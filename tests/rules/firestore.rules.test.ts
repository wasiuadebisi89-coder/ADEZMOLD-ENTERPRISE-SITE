import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, getDocs, collection, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { roleTemplate } from '@bms/domain';

let env: RulesTestEnvironment;

const ADMIN_A = 'admin-a';
const AUDITOR_A = 'auditor-a';
const SALES_A = 'sales-a';
const SUSPENDED_A = 'suspended-a';
const ADMIN_B = 'admin-b';

function member(uid: string, roleId: Parameters<typeof roleTemplate>[0], status = 'active') {
  return {
    uid,
    email: `${uid}@example.test`,
    status,
    roleIds: [roleId],
    permissions: [...roleTemplate(roleId).permissions],
    branchScope: 'all',
  };
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-bms',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [companyId, members] of [
      ['A', [member(ADMIN_A, 'company_admin'), member(AUDITOR_A, 'auditor'), member(SALES_A, 'sales_officer'), member(SUSPENDED_A, 'company_admin', 'suspended')]],
      ['B', [member(ADMIN_B, 'company_admin')]],
    ] as const) {
      await setDoc(doc(db, `companies/${companyId}`), { legalName: `Company ${companyId}`, status: 'active' });
      await setDoc(doc(db, `companies/${companyId}/settings/general`), { backdateWindowDays: 3 });
      await setDoc(doc(db, `companies/${companyId}/roles/company_admin`), { name: 'Company Admin' });
      await setDoc(doc(db, `companies/${companyId}/branches/HQ`), { name: 'Head office' });
      await setDoc(doc(db, `companies/${companyId}/periods/2026-10`), { status: 'open' });
      await setDoc(doc(db, `companies/${companyId}/auditLogs/log1`), { action: 'company.create' });
      await setDoc(doc(db, `companies/${companyId}/commands/key1`), { name: 'company.create' });
      for (const m of members) await setDoc(doc(db, `companies/${companyId}/members/${m.uid}`), m);
    }
    await setDoc(doc(db, `users/${ADMIN_A}`), { email: 'admin-a@example.test', defaultCompanyId: 'A' });
    await setDoc(doc(db, `users/${ADMIN_A}/memberships/A`), { status: 'active' });
    await setDoc(doc(db, 'invitations/inv1'), { companyId: 'A', email: 'new@example.test', tokenHash: 'x' });
    await setDoc(doc(db, 'platformAdmins/root'), { grantedAt: 1 });
  });
});

const db = (uid?: string) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();

const COMPANY_PATHS = [
  'companies/A',
  'companies/A/settings/general',
  'companies/A/roles/company_admin',
  'companies/A/branches/HQ',
  'companies/A/periods/2026-10',
  'companies/A/auditLogs/log1',
  'companies/A/members/admin-a',
];

describe('C1 unauthenticated access', () => {
  it.each(COMPANY_PATHS)('cannot read %s', async (path) => {
    await assertFails(getDoc(doc(db(), path)));
  });
});

describe('C2 cross-tenant isolation', () => {
  it.each(COMPANY_PATHS)('admin of B cannot read %s', async (path) => {
    await assertFails(getDoc(doc(db(ADMIN_B), path)));
  });
  it('admin of B cannot list A members or audit logs', async () => {
    await assertFails(getDocs(collection(db(ADMIN_B), 'companies/A/members')));
    await assertFails(getDocs(collection(db(ADMIN_B), 'companies/A/auditLogs')));
  });
  it('admin of A can read A', async () => {
    for (const path of COMPANY_PATHS) await assertSucceeds(getDoc(doc(db(ADMIN_A), path)));
  });
  it('admin of B cannot read A invitations', async () => {
    await assertFails(getDoc(doc(db(ADMIN_B), 'invitations/inv1')));
    await assertSucceeds(getDoc(doc(db(ADMIN_A), 'invitations/inv1')));
  });
});

describe('C3 no client writes to company data', () => {
  const writes: [string, Record<string, unknown>][] = [
    ['companies/A', { legalName: 'Hacked' }],
    ['companies/A/members/admin-a', { status: 'active', permissions: ['company.members.manage'] }],
    ['companies/A/members/new-user', member('new-user', 'company_admin')],
    ['companies/A/roles/company_admin', { permissions: [] }],
    ['companies/A/settings/general', { backdateWindowDays: 999 }],
    ['companies/A/periods/2026-10', { status: 'open' }],
    ['companies/A/branches/X', { name: 'X' }],
    ['companies/A/commands/key2', { name: 'x' }],
    ['companies/NEW', { legalName: 'Self-made' }],
    ['invitations/inv2', { companyId: 'A' }],
  ];
  it.each(writes)('admin of A cannot set %s', async (path, data) => {
    await assertFails(setDoc(doc(db(ADMIN_A), path), data));
  });
  it('admin of A cannot update or delete company documents', async () => {
    await assertFails(updateDoc(doc(db(ADMIN_A), 'companies/A'), { status: 'suspended' }));
    await assertFails(deleteDoc(doc(db(ADMIN_A), 'companies/A/branches/HQ')));
  });
  it('idempotency records are not readable', async () => {
    await assertFails(getDoc(doc(db(ADMIN_A), 'companies/A/commands/key1')));
  });
});

describe('C4 suspended members', () => {
  it('lose read access', async () => {
    await assertFails(getDoc(doc(db(SUSPENDED_A), 'companies/A')));
    await assertFails(getDoc(doc(db(SUSPENDED_A), 'companies/A/branches/HQ')));
  });
  it('can still read their own member record', async () => {
    await assertSucceeds(getDoc(doc(db(SUSPENDED_A), 'companies/A/members/suspended-a')));
  });
});

describe('permission-based reads', () => {
  it('sales officer cannot read audit logs, periods or other members', async () => {
    await assertFails(getDoc(doc(db(SALES_A), 'companies/A/auditLogs/log1')));
    await assertFails(getDoc(doc(db(SALES_A), 'companies/A/periods/2026-10')));
    await assertFails(getDoc(doc(db(SALES_A), 'companies/A/members/admin-a')));
    await assertSucceeds(getDoc(doc(db(SALES_A), 'companies/A/members/sales-a')));
    await assertSucceeds(getDoc(doc(db(SALES_A), 'companies/A/settings/general')));
  });
  it('auditor can read audit logs but not invitations (E6)', async () => {
    await assertSucceeds(getDoc(doc(db(AUDITOR_A), 'companies/A/auditLogs/log1')));
    await assertFails(getDoc(doc(db(AUDITOR_A), 'invitations/inv1')));
  });
});

describe('C7 user profile', () => {
  it('user can read own profile and memberships, not others', async () => {
    await assertSucceeds(getDoc(doc(db(ADMIN_A), `users/${ADMIN_A}`)));
    await assertSucceeds(getDoc(doc(db(ADMIN_A), `users/${ADMIN_A}/memberships/A`)));
    await assertFails(getDoc(doc(db(ADMIN_B), `users/${ADMIN_A}`)));
  });
  it('user can change displayName and preferences only', async () => {
    await assertSucceeds(updateDoc(doc(db(ADMIN_A), `users/${ADMIN_A}`), { displayName: 'Ada', preferences: { theme: 'dark' } }));
    await assertFails(updateDoc(doc(db(ADMIN_A), `users/${ADMIN_A}`), { defaultCompanyId: 'B' }));
    await assertFails(updateDoc(doc(db(ADMIN_A), `users/${ADMIN_A}`), { displayName: 'x'.repeat(121) }));
  });
  it('user cannot write the memberships mirror', async () => {
    await assertFails(setDoc(doc(db(ADMIN_B), `users/${ADMIN_B}/memberships/A`), { status: 'active' }));
  });
});

describe('G2 audit log immutability and platform collections', () => {
  it('nobody can write or delete audit entries from a client', async () => {
    await assertFails(setDoc(doc(db(ADMIN_A), 'companies/A/auditLogs/log2'), { action: 'fake' }));
    await assertFails(updateDoc(doc(db(ADMIN_A), 'companies/A/auditLogs/log1'), { action: 'edited' }));
    await assertFails(deleteDoc(doc(db(ADMIN_A), 'companies/A/auditLogs/log1')));
  });
  it('platform collections are closed to clients, including platform admins', async () => {
    const root = env.authenticatedContext('root', { platformAdmin: true }).firestore();
    await assertFails(getDoc(doc(root, 'platformAdmins/root')));
    await assertFails(setDoc(doc(db(ADMIN_A), 'platformAdmins/admin-a'), { grantedAt: 1 }));
    await assertFails(getDoc(doc(root, 'companies/A')));
  });
});
