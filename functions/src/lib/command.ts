/**
 * The command pipeline (docs/bms/ARCHITECTURE.md §5):
 * authenticate → validate → idempotency → tenant + authorization → handler → audit, with
 * everything after authentication inside one Firestore transaction.
 */
import {
  FieldValue,
  Timestamp,
  type DocumentReference,
  type Transaction,
} from 'firebase-admin/firestore';
import type { z } from 'zod';
import { effectivePermissions, type Permission } from '@bms/domain';
import { COMMAND_SCHEMAS, type CommandInput, type CommandName } from '@bms/schemas';
import { auth, db } from './firebase.js';
import { CommandError, conflict, denied } from './errors.js';
import { canonicalJson, sha256 } from './hash.js';
import { companyRefs, type MemberDoc, type RoleDoc } from './model.js';

export interface Caller {
  uid: string;
  email: string | undefined;
  displayName: string | undefined;
  emailVerified: boolean;
  /** Seconds since epoch at which the caller signed in (ID token `auth_time`). */
  authTime: number;
  platformAdmin: boolean;
}

export interface RequestMeta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export interface CompanyContext {
  companyId: string;
  member: MemberDoc;
  permissions: ReadonlySet<Permission>;
}

export type Access<I> =
  | { kind: 'authenticated'; requireVerifiedEmail: boolean }
  | {
      kind: 'company';
      /** A list means any one of them. */
      permission: Permission | readonly Permission[] | ((input: I) => Permission);
    }
  | { kind: 'platformAdmin' };

export type AuditTarget =
  | { scope: 'company'; companyId: string }
  | { scope: 'user' }
  | { scope: 'platform'; companyId?: string };

export interface AuditEntry {
  target: AuditTarget;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string | undefined;
}

export interface HandlerContext<I> {
  tx: Transaction;
  caller: Caller;
  input: I;
  now: Timestamp;
  /** Present for company-scoped commands. */
  company: CompanyContext | undefined;
}

export interface HandlerResult<R> {
  result: R;
  audit: AuditEntry;
  /** Side effects outside Firestore, run once after the transaction commits. */
  afterCommit?: () => Promise<void>;
}

export interface CommandDefinition<N extends CommandName, R> {
  name: N;
  access: Access<CommandInput<N>>;
  handler: (ctx: HandlerContext<CommandInput<N>>) => Promise<HandlerResult<R>>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyCommand = CommandDefinition<any, unknown>;

export function defineCommand<N extends CommandName, R>(
  def: CommandDefinition<N, R>,
): CommandDefinition<N, R> {
  return def;
}

/** Verifies the caller against Firebase Auth: disabled accounts and revoked sessions fail. */
export async function resolveCaller(token: {
  uid: string;
  email?: string | undefined;
  email_verified?: boolean | undefined;
  auth_time: number;
  platformAdmin?: unknown;
}): Promise<Caller> {
  let user;
  try {
    user = await auth.getUser(token.uid);
  } catch {
    throw new CommandError('unauthenticated', 'user_not_found', 'Please sign in again');
  }
  if (user.disabled) {
    throw new CommandError('unauthenticated', 'user_disabled', 'This account has been disabled');
  }
  if (user.tokensValidAfterTime) {
    const validAfter = Math.floor(new Date(user.tokensValidAfterTime).getTime() / 1000);
    if (token.auth_time < validAfter) {
      throw new CommandError(
        'unauthenticated',
        'session_revoked',
        'Your session has ended. Please sign in again',
      );
    }
  }
  return {
    uid: user.uid,
    email: user.email?.toLowerCase(),
    displayName: user.displayName ?? undefined,
    emailVerified: user.emailVerified,
    authTime: token.auth_time,
    platformAdmin: token.platformAdmin === true,
  };
}

function formatIssues(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  return fields;
}

export function parseInput<N extends CommandName>(name: N, raw: unknown): CommandInput<N> {
  const parsed = COMMAND_SCHEMAS[name].safeParse(raw);
  if (!parsed.success) {
    throw new CommandError('invalid-argument', 'validation_failed', 'Some fields are invalid', {
      fields: formatIssues(parsed.error),
    });
  }
  return parsed.data as CommandInput<N>;
}

async function loadCompanyContext(
  tx: Transaction,
  companyId: string,
  uid: string,
): Promise<CompanyContext> {
  const refs = companyRefs(companyId);
  const memberSnap = await tx.get(refs.member(uid));
  const member = memberSnap.data() as MemberDoc | undefined;
  if (!member || member.status !== 'active') {
    throw denied('not_a_member', 'You are not an active member of this company');
  }
  const companySnap = await tx.get(refs.company);
  if (!companySnap.exists || companySnap.get('status') !== 'active') {
    throw denied('company_inactive', 'This company is not active');
  }
  const roleSnaps = member.roleIds.length
    ? await tx.getAll(...member.roleIds.map((id) => refs.role(id)))
    : [];
  const roles = roleSnaps.filter((s) => s.exists).map((s) => s.data() as RoleDoc);
  return { companyId, member, permissions: effectivePermissions(roles) };
}

interface CommandRecord {
  name: string;
  uid: string;
  payloadHash: string;
  status: 'completed';
  result: unknown;
  createdAt: Timestamp;
}

export async function runCommand<N extends CommandName, R>(
  def: CommandDefinition<N, R>,
  rawInput: unknown,
  caller: Caller,
  meta: RequestMeta = {},
): Promise<R> {
  const input = parseInput(def.name, rawInput);
  const access = def.access;

  if (access.kind === 'authenticated' && access.requireVerifiedEmail && !caller.emailVerified) {
    throw new CommandError(
      'failed-precondition',
      'email_not_verified',
      'Please verify your email address first',
    );
  }
  if (access.kind === 'platformAdmin' && !caller.platformAdmin) {
    throw denied('not_platform_admin');
  }

  const { idempotencyKey, ...payload } = input as { idempotencyKey: string } & Record<
    string,
    unknown
  >;
  const payloadHash = sha256(canonicalJson({ name: def.name, payload }));
  const companyId =
    access.kind === 'company' ? (input as { companyId: string }).companyId : undefined;
  const commandRef: DocumentReference = companyId
    ? companyRefs(companyId).command(idempotencyKey)
    : db.doc(`users/${caller.uid}/commands/${idempotencyKey}`);

  let afterCommit: (() => Promise<void>) | undefined;

  const outcome = await db.runTransaction(async (tx) => {
    afterCommit = undefined;
    // Authorize before revealing anything about a prior command with this key.
    let company: CompanyContext | undefined;
    if (access.kind === 'company' && companyId) {
      company = await loadCompanyContext(tx, companyId, caller.uid);
      const required =
        typeof access.permission === 'function' ? access.permission(input) : access.permission;
      const anyOf: readonly Permission[] = typeof required === 'string' ? [required] : required;
      if (!anyOf.some((p) => company!.permissions.has(p))) throw denied('missing_permission');
    }
    if (access.kind === 'platformAdmin') {
      const adminSnap = await tx.get(db.doc(`platformAdmins/${caller.uid}`));
      if (!adminSnap.exists) throw denied('not_platform_admin');
    }

    const existing = await tx.get(commandRef);
    if (existing.exists) {
      const record = existing.data() as CommandRecord;
      if (
        record.uid !== caller.uid ||
        record.payloadHash !== payloadHash ||
        record.name !== def.name
      ) {
        throw conflict(
          'idempotency_key_reused',
          'This request id was already used for a different request',
        );
      }
      return { replayed: true as const, result: record.result as R };
    }

    const now = Timestamp.now();
    const handled = await def.handler({ tx, caller, input, now, company });
    afterCommit = handled.afterCommit;

    writeAudit(tx, def.name, caller, handled.audit, meta, idempotencyKey);
    const record: CommandRecord = {
      name: def.name,
      uid: caller.uid,
      payloadHash,
      status: 'completed',
      result: handled.result ?? null,
      createdAt: now,
    };
    tx.set(commandRef, record);
    return { replayed: false as const, result: handled.result };
  });

  if (!outcome.replayed && afterCommit) await afterCommit();
  return outcome.result;
}

function writeAudit(
  tx: Transaction,
  action: string,
  caller: Caller,
  entry: AuditEntry,
  meta: RequestMeta,
  idempotencyKey: string,
): void {
  const ref =
    entry.target.scope === 'company'
      ? companyRefs(entry.target.companyId).auditLogs.doc()
      : entry.target.scope === 'platform'
        ? db.collection('platformAuditLogs').doc()
        : db.collection(`users/${caller.uid}/auditLogs`).doc();
  tx.set(ref, {
    action,
    actorUid: caller.uid,
    actorEmail: caller.email ?? null,
    entityType: entry.entityType,
    entityId: entry.entityId,
    companyId: 'companyId' in entry.target ? (entry.target.companyId ?? null) : null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    reason: entry.reason ?? null,
    idempotencyKey,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
    at: FieldValue.serverTimestamp(),
  });
}
