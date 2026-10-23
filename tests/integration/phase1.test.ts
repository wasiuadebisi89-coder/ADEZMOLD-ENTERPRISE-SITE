import { randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { SYSTEM_ROLES } from '@bms/domain';
import { resolveCaller } from '../../functions/src/lib/command.js';
import {
  addMember,
  auditCount,
  auth,
  call,
  companyInput,
  createCompany,
  db,
  expectReason,
  makeUser,
  resetEmulators,
} from './helpers.js';

beforeEach(async () => {
  await resetEmulators();
});

describe('A. authentication', () => {
  it('A1 unverified users cannot create a company', async () => {
    const user = await makeUser('new@example.test', { verified: false });
    await expectReason(createCompany(user), 'email_not_verified');
  });

  it('A4 disabled users are rejected', async () => {
    const user = await makeUser('gone@example.test');
    await auth.updateUser(user.uid, { disabled: true });
    await expect(
      resolveCaller({
        uid: user.uid,
        email: user.email,
        email_verified: true,
        auth_time: user.authTime,
      }),
    ).rejects.toMatchObject({ reason: 'user_disabled' });
  });

  it('A5 sign out everywhere invalidates earlier sessions', async () => {
    const user = await makeUser('roam@example.test');
    // Revocation has one-second resolution; make the revocation strictly later than sign-in.
    await new Promise((r) => setTimeout(r, 1100));
    await call('session.revokeAll', {}, user);
    await expect(
      resolveCaller({
        uid: user.uid,
        email: user.email,
        email_verified: true,
        auth_time: user.authTime,
      }),
    ).rejects.toMatchObject({ reason: 'session_revoked' });
  });
});

describe('B. company registration', () => {
  it('B1 creates the full tenant skeleton in one command', async () => {
    const admin = await makeUser('owner@example.test');
    const { companyId, branchId, fiscalYearId } = await createCompany(admin);
    const base = `companies/${companyId}`;

    const company = (await db.doc(base).get()).data()!;
    expect(company).toMatchObject({
      legalName: 'Adezmold Trading Ltd',
      baseCurrency: 'NGN',
      status: 'active',
      costingMethod: 'weighted_average',
    });
    expect((await db.doc(`${base}/branches/${branchId}`).get()).get('isHeadOffice')).toBe(true);
    const roles = await db.collection(`${base}/roles`).get();
    expect(roles.docs.map((d) => d.id).sort()).toEqual(SYSTEM_ROLES.map((r) => r.id).sort());
    expect((await db.doc(`${base}/settings/general`).get()).get('backdateWindowDays')).toBe(3);
    expect(
      (await db.collection(`${base}/periods`).where('fiscalYearId', '==', fiscalYearId).get()).size,
    ).toBe(12);
    const member = (await db.doc(`${base}/members/${admin.uid}`).get()).data()!;
    expect(member).toMatchObject({
      status: 'active',
      roleIds: ['company_admin'],
      branchScope: 'all',
    });
    expect(member.permissions).toContain('company.members.manage');
    expect((await db.doc(`users/${admin.uid}/memberships/${companyId}`).get()).get('status')).toBe(
      'active',
    );
    expect(await auditCount(companyId)).toBe(1);
  });

  it('B2 retrying with the same idempotency key returns the same company', async () => {
    const admin = await makeUser('owner@example.test');
    const key = randomUUID();
    const first = await call('company.create', companyInput, admin, key);
    const second = await call('company.create', companyInput, admin, key);
    expect(second).toEqual(first);
    expect((await db.collection('companies').get()).size).toBe(1);
  });

  it('B2 concurrent retries create only one company', async () => {
    const admin = await makeUser('owner@example.test');
    const key = randomUUID();
    const results = await Promise.allSettled(
      [1, 2, 3].map(() => call('company.create', companyInput, admin, key)),
    );
    const ok = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<unknown>[];
    expect(ok.length).toBeGreaterThan(0);
    expect(new Set(ok.map((r) => JSON.stringify(r.value))).size).toBe(1);
    expect((await db.collection('companies').get()).size).toBe(1);
  });

  it('B3 reusing a key with a different payload is rejected', async () => {
    const admin = await makeUser('owner@example.test');
    const key = randomUUID();
    await call('company.create', companyInput, admin, key);
    await expectReason(
      call('company.create', { ...companyInput, legalName: 'Other Ltd' }, admin, key),
      'idempotency_key_reused',
    );
  });

  it('B4 server-side validation rejects bad input even when the UI is bypassed', async () => {
    const admin = await makeUser('owner@example.test');
    const err = await expectReason(
      createCompany(admin, {
        legalName: '',
        baseCurrency: 'XXX',
        fiscalYearStartMonth: 13,
        timeZone: 'Mars/Base',
      }),
      'validation_failed',
    );
    expect(Object.keys((err.details as { fields: object }).fields)).toEqual(
      expect.arrayContaining(['legalName', 'baseCurrency', 'fiscalYearStartMonth', 'timeZone']),
    );
    await expectReason(
      call('company.create', { ...companyInput, idempotencyKey: 'not-a-uuid' }, admin),
      'validation_failed',
    );
  });

  it('B5 base currency cannot change once locked', async () => {
    const admin = await makeUser('owner@example.test');
    const { companyId } = await createCompany(admin);
    await call('company.updateSettings', { companyId, baseCurrency: 'USD' }, admin);
    await db.doc(`companies/${companyId}`).update({ 'locks.baseCurrency': true });
    await expectReason(
      call('company.updateSettings', { companyId, baseCurrency: 'NGN' }, admin),
      'base_currency_locked',
    );
    await call('company.updateSettings', { companyId, tradingName: 'Renamed' }, admin);
    expect(
      (await db.doc(`users/${admin.uid}/memberships/${companyId}`).get()).get('companyName'),
    ).toBe('Renamed');
  });
});

describe('C5. tenant isolation in commands', () => {
  it('rejects commands for a company the caller does not belong to', async () => {
    const a = await makeUser('a@example.test');
    const b = await makeUser('b@example.test');
    const { companyId: companyA } = await createCompany(a);
    await createCompany(b);
    await expectReason(
      call('branch.create', { companyId: companyA, code: 'X1', name: 'Intruder' }, b),
      'not_a_member',
    );
    await expectReason(
      call('company.updateSettings', { companyId: companyA, tradingName: 'Hijack' }, b),
      'not_a_member',
    );
    await expectReason(
      call('company.updateSettings', { companyId: 'does-not-exist', tradingName: 'x' }, b),
      'not_a_member',
    );
  });

  it('does not leak a prior result to another user who reuses the key', async () => {
    const a = await makeUser('a@example.test');
    const b = await makeUser('b@example.test');
    const { companyId } = await createCompany(a);
    await addMember(companyId, a, b, ['manager']);
    const key = randomUUID();
    await call('branch.create', { companyId, code: 'B1', name: 'Branch' }, a, key);
    await expectReason(
      call('branch.create', { companyId, code: 'B1', name: 'Branch' }, b, key),
      'missing_permission',
    );
  });
});

describe('D. memberships and invitations', () => {
  it('D1 invitations are single-use', async () => {
    const admin = await makeUser('admin@example.test');
    const invitee = await makeUser('staff@example.test');
    const { companyId } = await createCompany(admin);
    const inv = await addMember(companyId, admin, invitee, ['sales_officer']);
    await expectReason(
      call('invitation.accept', { invitationId: inv.invitationId, token: inv.token }, invitee),
      'invitation_not_pending',
    );
    const member = (await db.doc(`companies/${companyId}/members/${invitee.uid}`).get()).data()!;
    expect(member.permissions).toContain('sales.invoice.post');
    expect(member.permissions).not.toContain('company.members.manage');
  });

  it('D1 invitations expire and wrong tokens are rejected', async () => {
    const admin = await makeUser('admin@example.test');
    const invitee = await makeUser('staff@example.test');
    const { companyId } = await createCompany(admin);
    const inv = await call<{ invitationId: string; token: string }>(
      'invitation.create',
      { companyId, email: invitee.email, roleIds: ['sales_officer'], branchScope: 'all' },
      admin,
    );
    await expectReason(
      call('invitation.accept', { invitationId: inv.invitationId, token: 'x'.repeat(43) }, invitee),
      'invitation_not_found',
    );
    await db
      .doc(`invitations/${inv.invitationId}`)
      .update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
    await expectReason(
      call('invitation.accept', { invitationId: inv.invitationId, token: inv.token }, invitee),
      'invitation_expired',
    );
  });

  it('D2 an invitation cannot be accepted from a different email', async () => {
    const admin = await makeUser('admin@example.test');
    const other = await makeUser('other@example.test');
    const { companyId } = await createCompany(admin);
    const inv = await call<{ invitationId: string; token: string }>(
      'invitation.create',
      { companyId, email: 'staff@example.test', roleIds: ['sales_officer'], branchScope: 'all' },
      admin,
    );
    await expectReason(
      call('invitation.accept', { invitationId: inv.invitationId, token: inv.token }, other),
      'invitation_email_mismatch',
    );
  });

  it('D3 one user, two companies, different permissions', async () => {
    const a = await makeUser('a@example.test');
    const b = await makeUser('b@example.test');
    const { companyId: companyA } = await createCompany(a);
    const { companyId: companyB } = await createCompany(b);
    await addMember(companyB, b, a, ['auditor']);
    const memberships = await db.collection(`users/${a.uid}/memberships`).get();
    expect(memberships.docs.map((d) => d.id).sort()).toEqual([companyA, companyB].sort());
    await call('branch.create', { companyId: companyA, code: 'LAG', name: 'Lagos' }, a);
    await expectReason(
      call('branch.create', { companyId: companyB, code: 'LAG', name: 'Lagos' }, a),
      'missing_permission',
    );
  });

  it('D4 suspended members cannot run commands and the change is audited', async () => {
    const admin = await makeUser('admin@example.test');
    const manager = await makeUser('manager@example.test');
    const { companyId } = await createCompany(admin);
    await addMember(companyId, admin, manager, ['company_admin']);
    await call(
      'member.setStatus',
      { companyId, uid: manager.uid, status: 'suspended', reason: 'Left the company' },
      admin,
    );
    await expectReason(
      call('branch.create', { companyId, code: 'B2', name: 'B' }, manager),
      'not_a_member',
    );
    const audit = await db
      .collection(`companies/${companyId}/auditLogs`)
      .where('action', '==', 'member.setStatus')
      .get();
    expect(audit.size).toBe(1);
    expect(audit.docs[0]!.data()).toMatchObject({
      actorUid: admin.uid,
      entityId: manager.uid,
      reason: 'Left the company',
      after: { status: 'suspended' },
    });
  });

  it('D5 the last active admin cannot be removed, suspended or demoted', async () => {
    const admin = await makeUser('admin@example.test');
    const admin2 = await makeUser('admin2@example.test');
    const { companyId } = await createCompany(admin);
    await expectReason(
      call('member.update', { companyId, uid: admin.uid, roleIds: ['manager'] }, admin),
      'last_admin',
    );
    await expectReason(
      call(
        'member.setStatus',
        { companyId, uid: admin.uid, status: 'removed', reason: 'test' },
        admin,
      ),
      'cannot_change_own_status',
    );
    await addMember(companyId, admin, admin2, ['company_admin']);
    await call(
      'member.setStatus',
      { companyId, uid: admin.uid, status: 'suspended', reason: 'Handover' },
      admin2,
    );
    await expectReason(
      call('member.update', { companyId, uid: admin2.uid, roleIds: ['manager'] }, admin2),
      'last_admin',
    );
  });

  it('D6 non-admins cannot invite, change roles or suspend', async () => {
    const admin = await makeUser('admin@example.test');
    const manager = await makeUser('manager@example.test');
    const { companyId } = await createCompany(admin);
    await addMember(companyId, admin, manager, ['manager']);
    await expectReason(
      call(
        'invitation.create',
        { companyId, email: 'x@example.test', roleIds: ['company_admin'], branchScope: 'all' },
        manager,
      ),
      'missing_permission',
    );
    await expectReason(
      call('member.update', { companyId, uid: manager.uid, roleIds: ['company_admin'] }, manager),
      'missing_permission',
    );
    await expectReason(
      call(
        'member.setStatus',
        { companyId, uid: admin.uid, status: 'suspended', reason: 'coup' },
        manager,
      ),
      'missing_permission',
    );
  });
});

describe('E. roles and permissions', () => {
  it('E3 custom roles can be created and edited; system roles are immutable', async () => {
    const admin = await makeUser('admin@example.test');
    const staff = await makeUser('staff@example.test');
    const { companyId } = await createCompany(admin);
    const { roleId } = await call<{ roleId: string }>(
      'role.create',
      { companyId, name: 'Cashier', permissions: ['sales.invoice.post'] },
      admin,
    );
    await addMember(companyId, admin, staff, [roleId]);
    await call(
      'role.update',
      { companyId, roleId, permissions: ['sales.invoice.post', 'sales.receipt.post'] },
      admin,
    );
    expect(
      (await db.doc(`companies/${companyId}/members/${staff.uid}`).get()).get('permissions'),
    ).toEqual(['sales.invoice.post', 'sales.receipt.post']);
    await expectReason(call('role.delete', { companyId, roleId }, admin), 'role_in_use');
    await expectReason(
      call('role.update', { companyId, roleId: 'company_admin', permissions: [] }, admin),
      'system_role_immutable',
    );
    await expectReason(
      call('role.delete', { companyId, roleId: 'auditor' }, admin),
      'system_role_immutable',
    );
    await expectReason(
      call('role.create', { companyId, name: 'Bad', permissions: ['root.everything'] }, admin),
      'validation_failed',
    );
  });

  it('E4 branch scope must reference active branches', async () => {
    const admin = await makeUser('admin@example.test');
    const { companyId } = await createCompany(admin);
    await expectReason(
      call(
        'invitation.create',
        { companyId, email: 'x@example.test', roleIds: ['sales_officer'], branchScope: ['NOPE'] },
        admin,
      ),
      'unknown_branch',
    );
    await call(
      'invitation.create',
      { companyId, email: 'x@example.test', roleIds: ['sales_officer'], branchScope: ['HQ'] },
      admin,
    );
  });

  it('E6 auditors cannot change anything', async () => {
    const admin = await makeUser('admin@example.test');
    const auditor = await makeUser('auditor@example.test');
    const { companyId } = await createCompany(admin);
    await addMember(companyId, admin, auditor, ['auditor']);
    const attempts: [Parameters<typeof call>[0], Record<string, unknown>][] = [
      ['company.updateSettings', { companyId, tradingName: 'x' }],
      ['branch.create', { companyId, code: 'A1', name: 'x' }],
      ['role.create', { companyId, name: 'x1', permissions: [] }],
      ['period.setStatus', { companyId, periodId: '2026-01', status: 'closed' }],
      [
        'approval.request',
        {
          companyId,
          action: 'period.reopen',
          target: { periodId: '2026-01' },
          reason: 'need to fix',
        },
      ],
    ];
    for (const [name, input] of attempts)
      await expectReason(call(name, input, auditor), 'missing_permission');
  });
});

describe('F. branches and financial periods', () => {
  it('F1 branches can be added and deactivated, but not the head office', async () => {
    const admin = await makeUser('admin@example.test');
    const { companyId } = await createCompany(admin);
    await call('branch.create', { companyId, code: 'abj', name: 'Abuja' }, admin);
    await expectReason(
      call('branch.create', { companyId, code: 'ABJ', name: 'Abuja 2' }, admin),
      'branch_code_taken',
    );
    await call('branch.update', { companyId, branchId: 'ABJ', status: 'inactive' }, admin);
    await expectReason(
      call('branch.update', { companyId, branchId: 'HQ', status: 'inactive' }, admin),
      'head_office_required',
    );
  });

  it('F2/F4 periods close in order', async () => {
    const admin = await makeUser('admin@example.test');
    const { companyId, fiscalYearId } = await createCompany(admin);
    const periods = (
      await db
        .collection(`companies/${companyId}/periods`)
        .where('fiscalYearId', '==', fiscalYearId)
        .get()
    ).docs
      .map((d) => d.id)
      .sort();
    const [p1, p2] = periods as [string, string];
    await expectReason(
      call('period.setStatus', { companyId, periodId: p2, status: 'closed' }, admin),
      'close_out_of_order',
    );
    await call('period.setStatus', { companyId, periodId: p1, status: 'soft_closed' }, admin);
    await call('period.setStatus', { companyId, periodId: p1, status: 'closed' }, admin);
    await call('period.setStatus', { companyId, periodId: p2, status: 'closed' }, admin);
    expect((await db.doc(`companies/${companyId}/periods/${p1}`).get()).get('status')).toBe(
      'closed',
    );
  });

  it('F3 reopening needs an approved request from someone else, used once', async () => {
    const admin = await makeUser('admin@example.test');
    const accountant = await makeUser('acct@example.test');
    const { companyId, fiscalYearId } = await createCompany(admin);
    await addMember(companyId, admin, accountant, ['accountant']);
    const periodId = (
      await db
        .collection(`companies/${companyId}/periods`)
        .where('fiscalYearId', '==', fiscalYearId)
        .get()
    ).docs
      .map((d) => d.id)
      .sort()[0]!;
    await call('period.setStatus', { companyId, periodId, status: 'closed' }, accountant);

    await expectReason(
      call(
        'period.setStatus',
        { companyId, periodId, status: 'open', reason: 'Fix error' },
        accountant,
      ),
      'approval_required',
    );
    const { approvalRequestId } = await call<{ approvalRequestId: string }>(
      'approval.request',
      {
        companyId,
        action: 'period.reopen',
        target: { periodId },
        reason: 'Missing supplier invoice',
      },
      accountant,
    );
    await expectReason(
      call(
        'approval.request',
        { companyId, action: 'period.reopen', target: { periodId }, reason: 'again' },
        accountant,
      ),
      'approval_exists',
    );
    await expectReason(
      call(
        'approval.decide',
        { companyId, approvalRequestId, decision: 'approved', reason: 'Looks fine' },
        accountant,
      ),
      'missing_permission',
    );
    await expectReason(
      call(
        'period.setStatus',
        { companyId, periodId, status: 'open', reason: 'Fix error', approvalRequestId },
        accountant,
      ),
      'approval_invalid',
    );
    await call(
      'approval.decide',
      { companyId, approvalRequestId, decision: 'approved', reason: 'Agreed' },
      admin,
    );
    await call(
      'period.setStatus',
      { companyId, periodId, status: 'open', reason: 'Fix error', approvalRequestId },
      accountant,
    );
    await call('period.setStatus', { companyId, periodId, status: 'closed' }, accountant);
    await expectReason(
      call(
        'period.setStatus',
        { companyId, periodId, status: 'open', reason: 'Again', approvalRequestId },
        accountant,
      ),
      'approval_invalid',
    );
  });

  it('F3 requesters cannot approve their own request', async () => {
    const admin = await makeUser('admin@example.test');
    const { companyId, fiscalYearId } = await createCompany(admin);
    const periodId = `${fiscalYearId.slice(2, 6)}-01`;
    await call('period.setStatus', { companyId, periodId, status: 'closed' }, admin);
    const { approvalRequestId } = await call<{ approvalRequestId: string }>(
      'approval.request',
      { companyId, action: 'period.reopen', target: { periodId }, reason: 'Correction' },
      admin,
    );
    await expectReason(
      call(
        'approval.decide',
        { companyId, approvalRequestId, decision: 'approved', reason: 'self' },
        admin,
      ),
      'self_approval',
    );
  });

  it('F6 the next fiscal year is contiguous and non-overlapping', async () => {
    const admin = await makeUser('admin@example.test');
    const { companyId, fiscalYearId } = await createCompany(admin);
    const year = Number(fiscalYearId.slice(2, 6));
    await expectReason(
      call('fiscalYear.create', { companyId, startYear: year }, admin),
      'overlapping_year',
    );
    await expectReason(
      call('fiscalYear.create', { companyId, startYear: year + 2 }, admin),
      'fiscal_year_gap',
    );
    await call('fiscalYear.create', { companyId, startYear: year + 1 }, admin);
    expect((await db.collection(`companies/${companyId}/periods`).get()).size).toBe(24);
  });
});

describe('G. audit', () => {
  it('G1 every successful command writes exactly one audit entry; failures write none', async () => {
    const admin = await makeUser('admin@example.test');
    const { companyId } = await createCompany(admin);
    expect(await auditCount(companyId)).toBe(1);
    await call('branch.create', { companyId, code: 'B9', name: 'B9' }, admin);
    expect(await auditCount(companyId)).toBe(2);
    await expectReason(
      call('branch.create', { companyId, code: 'B9', name: 'dup' }, admin),
      'branch_code_taken',
    );
    expect(await auditCount(companyId)).toBe(2);
    const key = randomUUID();
    await call('branch.create', { companyId, code: 'B10', name: 'B10' }, admin, key);
    await call('branch.create', { companyId, code: 'B10', name: 'B10' }, admin, key);
    expect(await auditCount(companyId)).toBe(3);
  });

  it('G3 platform support reads require a platform admin and are logged with a reason', async () => {
    const owner = await makeUser('owner@example.test');
    const { companyId } = await createCompany(owner);
    const support = await makeUser('support@example.test', { platformAdmin: true });
    await expectReason(
      call('platform.supportRead', { companyId, reason: 'Customer ticket 42' }, support),
      'not_platform_admin',
    );
    await db.doc(`platformAdmins/${support.uid}`).set({ grantedAt: Timestamp.now() });
    await expectReason(
      call('platform.supportRead', { companyId, reason: 'Customer ticket 42' }, owner),
      'not_platform_admin',
    );
    const summary = await call(
      'platform.supportRead',
      { companyId, reason: 'Customer ticket 42' },
      support,
    );
    expect(summary).toMatchObject({ companyId, memberCount: 1, branchCount: 1 });
    const logs = await db.collection('platformAuditLogs').get();
    expect(logs.size).toBe(1);
    expect(logs.docs[0]!.data()).toMatchObject({
      actorUid: support.uid,
      companyId,
      reason: 'Customer ticket 42',
    });
  });
});
