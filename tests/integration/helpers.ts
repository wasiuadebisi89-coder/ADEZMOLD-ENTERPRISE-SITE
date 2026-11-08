import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { CommandName } from '@bms/schemas';
import { resolveCaller, runCommand, type Caller } from '../../functions/src/lib/command.js';
import { CommandError } from '../../functions/src/lib/errors.js';
import { auth, db } from '../../functions/src/lib/firebase.js';
import { COMMANDS } from '../../functions/src/registry.js';

export { auth, db };

const PROJECT = process.env.GCLOUD_PROJECT ?? 'demo-bms';

export async function resetEmulators(): Promise<void> {
  const fs = process.env.FIRESTORE_EMULATOR_HOST;
  const au = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  await fetch(`http://${fs}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  await fetch(`http://${au}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
}

export async function makeUser(
  email: string,
  opts: { verified?: boolean; platformAdmin?: boolean; authTime?: number } = {},
): Promise<Caller> {
  const user = await auth.createUser({
    email,
    password: 'Password123!',
    emailVerified: opts.verified ?? true,
    displayName: email.split('@')[0],
  });
  return resolveCaller({
    uid: user.uid,
    email,
    email_verified: opts.verified ?? true,
    auth_time: opts.authTime ?? Math.floor(Date.now() / 1000),
    platformAdmin: opts.platformAdmin,
  });
}

export function call<R = Record<string, unknown>>(
  name: CommandName,
  input: Record<string, unknown>,
  caller: Caller,
  idempotencyKey: string = randomUUID(),
): Promise<R> {
  return runCommand(COMMANDS[name], { idempotencyKey, ...input }, caller) as Promise<R>;
}

export async function expectReason(
  promise: Promise<unknown>,
  reason: string,
): Promise<CommandError> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(CommandError);
    expect((e as CommandError).reason).toBe(reason);
    return e as CommandError;
  }
  throw new Error(`Expected command to fail with ${reason}`);
}

export const companyInput = {
  legalName: 'Adezmold Trading Ltd',
  tradingName: 'Adezmold',
  country: 'NG',
  baseCurrency: 'NGN',
  timeZone: 'Africa/Lagos',
  fiscalYearStartMonth: 1,
  headOffice: { code: 'HQ', name: 'Head office' },
};

/** Registers a company and approves it, as the platform owner would. */
export async function createCompany(admin: Caller, overrides: Record<string, unknown> = {}) {
  const created = await call<{ companyId: string; branchId: string; fiscalYearId: string }>(
    'company.create',
    { ...companyInput, ...overrides },
    admin,
  );
  await approveCompany(created.companyId);
  return created;
}

/** Marks a registration approved directly in Firestore (tests of other features only). */
export async function approveCompany(companyId: string): Promise<void> {
  await db.doc(`companies/${companyId}`).update({ status: 'active' });
}

/** Makes `email` a platform owner for the duration of a test. */
export function setPlatformOwners(emails: string): () => void {
  const previous = process.env.PLATFORM_OWNER_EMAILS;
  process.env.PLATFORM_OWNER_EMAILS = emails;
  return () => {
    if (previous === undefined) delete process.env.PLATFORM_OWNER_EMAILS;
    else process.env.PLATFORM_OWNER_EMAILS = previous;
  };
}

/** Invites and accepts so `user` becomes a member with `roleIds`. */
export async function addMember(
  companyId: string,
  admin: Caller,
  user: Caller,
  roleIds: string[],
  branchScope: 'all' | string[] = 'all',
) {
  const inv = await call<{ invitationId: string; token: string }>(
    'invitation.create',
    { companyId, email: user.email, roleIds, branchScope },
    admin,
  );
  await call('invitation.accept', { invitationId: inv.invitationId, token: inv.token }, user);
  return inv;
}

export async function auditCount(companyId: string): Promise<number> {
  return (await db.collection(`companies/${companyId}/auditLogs`).count().get()).data().count;
}

/** The amount `fundMoneyAccounts` puts into each cash and bank account: 10 million, in kobo. */
export const TEST_FUNDING = 1_000_000_000;

/**
 * Gives every cash and bank account money to pay out of, so tests about other rules are not
 * stopped by the no-overdraft check (DECISION 23). Writes a balanced pair of ledger entries per
 * account against opening balance equity, dated long before any test posting. Tests that check a
 * cash or bank balance subtract TEST_FUNDING.
 */
export async function fundMoneyAccounts(
  companyId: string,
  subtypes: readonly ('cash' | 'bank')[] = ['cash', 'bank'],
): Promise<void> {
  const accounts = await db
    .collection(`companies/${companyId}/accounts`)
    .where('subtype', 'in', [...subtypes, 'openingBalanceEquity'])
    .get();
  const equity = accounts.docs.find((d) => d.get('subtype') === 'openingBalanceEquity');
  if (!equity) throw new Error('No opening balance equity account');
  const batch = db.batch();
  const entries = db.collection(`companies/${companyId}/ledgerEntries`);
  const base = {
    journalId: 'test-funding',
    journalNumber: 'TEST',
    postingDate: '2000-01-01',
    periodId: '2000-01',
    branchId: 'HQ',
    projectId: null,
    origin: 'opening_balance',
    memo: 'Test funding',
    postedAt: new Date(0),
  };
  accounts.docs
    .filter((d) => d !== equity)
    .forEach((d, i) => {
      batch.set(entries.doc(`test-funding_${2 * i + 1}`), {
        ...base,
        lineNo: 2 * i + 1,
        accountId: d.id,
        debit: TEST_FUNDING,
        credit: 0,
      });
      batch.set(entries.doc(`test-funding_${2 * i + 2}`), {
        ...base,
        lineNo: 2 * i + 2,
        accountId: equity.id,
        debit: 0,
        credit: TEST_FUNDING,
      });
    });
  // Reports only read accounts that have postings.
  accounts.docs.forEach((d) => batch.update(d.ref, { hasPostings: true }));
  await batch.commit();
}
