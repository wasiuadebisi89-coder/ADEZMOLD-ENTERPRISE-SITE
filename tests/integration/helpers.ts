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

export async function createCompany(admin: Caller, overrides: Record<string, unknown> = {}) {
  return call<{ companyId: string; branchId: string; fiscalYearId: string }>(
    'company.create',
    { ...companyInput, ...overrides },
    admin,
  );
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
