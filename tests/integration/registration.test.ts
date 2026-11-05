import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveCaller, type Caller } from '../../functions/src/lib/command.js';
import {
  addMember,
  approveCompany,
  auth,
  call,
  companyInput,
  db,
  expectReason,
  makeUser,
  resetEmulators,
  setPlatformOwners,
} from './helpers.js';

let restoreOwners: () => void = () => {};

beforeEach(async () => {
  await resetEmulators();
  restoreOwners = setPlatformOwners('Owner@Platform.test');
});
afterEach(() => restoreOwners());

/** Signs the owner in, claims Platform Super Admin, and returns the refreshed caller. */
async function platformOwner(): Promise<Caller> {
  const owner = await makeUser('owner@platform.test');
  await call('platform.claimAdmin', {}, owner);
  const user = await auth.getUser(owner.uid);
  expect(user.customClaims?.platformAdmin).toBe(true);
  return resolveCaller({
    uid: owner.uid,
    email: owner.email,
    email_verified: true,
    auth_time: owner.authTime,
    platformAdmin: user.customClaims?.platformAdmin,
  });
}

async function register(caller: Caller) {
  return call<{ companyId: string; status: string }>('company.create', companyInput, caller);
}

describe('R. company registration approval', () => {
  it('R1 a new registration waits as pending and cannot be used', async () => {
    const registrant = await makeUser('new@shop.test');
    const { companyId, status } = await register(registrant);
    expect(status).toBe('pending');

    const company = (await db.doc(`companies/${companyId}`).get()).data()!;
    expect(company).toMatchObject({
      status: 'pending',
      registrant: { uid: registrant.uid, email: 'new@shop.test' },
      statusReason: null,
    });
    const mirror = await db.doc(`users/${registrant.uid}/memberships/${companyId}`).get();
    expect(mirror.get('companyStatus')).toBe('pending');

    await expectReason(
      call('branch.create', { companyId, code: 'B2', name: 'Branch 2' }, registrant),
      'company_pending_approval',
    );
  });

  it('R2 only a configured, verified owner email can claim the platform dashboard', async () => {
    const stranger = await makeUser('someone@else.test');
    await expectReason(call('platform.claimAdmin', {}, stranger), 'not_platform_owner');
    const unverified = await makeUser('owner@platform.test', { verified: false });
    await expectReason(call('platform.claimAdmin', {}, unverified), 'email_not_verified');
    expect((await db.collection('platformAdmins').get()).size).toBe(0);

    restoreOwners();
    restoreOwners = setPlatformOwners('');
    const owner = await makeUser('second@platform.test');
    await expectReason(call('platform.claimAdmin', {}, owner), 'not_platform_owner');
  });

  it('R3 the platform owner approves; the company becomes usable and the change is logged', async () => {
    const owner = await platformOwner();
    const registrant = await makeUser('new@shop.test');
    const { companyId } = await register(registrant);

    // A claim without the server record is not enough.
    const pretender = await makeUser('pretend@shop.test', { platformAdmin: true });
    await expectReason(
      call('platform.setCompanyStatus', { companyId, status: 'active' }, pretender),
      'not_platform_admin',
    );
    await expectReason(
      call('platform.setCompanyStatus', { companyId, status: 'active' }, registrant),
      'not_platform_admin',
    );

    await call('platform.setCompanyStatus', { companyId, status: 'active' }, owner);
    const company = (await db.doc(`companies/${companyId}`).get()).data()!;
    expect(company).toMatchObject({ status: 'active', statusChangedBy: owner.uid });
    const mirror = await db.doc(`users/${registrant.uid}/memberships/${companyId}`).get();
    expect(mirror.get('companyStatus')).toBe('active');

    await call('branch.create', { companyId, code: 'B2', name: 'Branch 2' }, registrant);

    const logs = await db.collection('platformAuditLogs').where('companyId', '==', companyId).get();
    expect(logs.docs.map((d) => d.data())).toEqual([
      expect.objectContaining({
        action: 'platform.setCompanyStatus',
        actorUid: owner.uid,
        before: { status: 'pending' },
        after: { status: 'active' },
      }),
    ]);
  });

  it('R4 rejecting needs a reason the registrant can read, and keeps the company locked', async () => {
    const owner = await platformOwner();
    const registrant = await makeUser('new@shop.test');
    const { companyId } = await register(registrant);

    await expectReason(
      call('platform.setCompanyStatus', { companyId, status: 'rejected' }, owner),
      'validation_failed',
    );
    await call(
      'platform.setCompanyStatus',
      { companyId, status: 'rejected', reason: 'Please register with your CAC details' },
      owner,
    );
    const company = (await db.doc(`companies/${companyId}`).get()).data()!;
    expect(company).toMatchObject({
      status: 'rejected',
      statusReason: 'Please register with your CAC details',
    });
    await expectReason(
      call('branch.create', { companyId, code: 'B2', name: 'Branch 2' }, registrant),
      'company_inactive',
    );
    // A rejected registration can be reconsidered, but not suspended.
    await expectReason(
      call(
        'platform.setCompanyStatus',
        { companyId, status: 'suspended', reason: 'x'.repeat(5) },
        owner,
      ),
      'invalid_status_change',
    );
    await call('platform.setCompanyStatus', { companyId, status: 'active' }, owner);
  });

  it('R5 suspending and reactivating an approved company updates every member', async () => {
    const owner = await platformOwner();
    const registrant = await makeUser('new@shop.test');
    const { companyId } = await register(registrant);
    await call('platform.setCompanyStatus', { companyId, status: 'active' }, owner);
    const clerk = await makeUser('clerk@shop.test');
    await addMember(companyId, registrant, clerk, ['sales_officer']);

    await expectReason(
      call('platform.setCompanyStatus', { companyId, status: 'active' }, owner),
      'status_unchanged',
    );
    await expectReason(
      call(
        'platform.setCompanyStatus',
        { companyId, status: 'rejected', reason: 'Too late' },
        owner,
      ),
      'invalid_status_change',
    );
    await call(
      'platform.setCompanyStatus',
      { companyId, status: 'suspended', reason: 'Subscription unpaid' },
      owner,
    );
    for (const uid of [registrant.uid, clerk.uid]) {
      const mirror = await db.doc(`users/${uid}/memberships/${companyId}`).get();
      expect(mirror.get('companyStatus')).toBe('suspended');
    }
    await expectReason(
      call('branch.create', { companyId, code: 'B2', name: 'Branch 2' }, registrant),
      'company_inactive',
    );
    await call('platform.setCompanyStatus', { companyId, status: 'active' }, owner);
    await call('branch.create', { companyId, code: 'B2', name: 'Branch 2' }, registrant);
  });

  it('R6 the platform owner’s own registrations are approved at once', async () => {
    const owner = await platformOwner();
    const { companyId, status } = await register(owner);
    expect(status).toBe('active');
    await call('branch.create', { companyId, code: 'B2', name: 'Branch 2' }, owner);
  });

  it('R7 companies registered before approvals existed stay active', async () => {
    const registrant = await makeUser('early@shop.test');
    const { companyId } = await register(registrant);
    // Older companies have status "active" and no registrant or companyStatus fields.
    await approveCompany(companyId);
    await db.doc(`companies/${companyId}`).update({ registrant: null, statusReason: null });
    await call('branch.create', { companyId, code: 'B2', name: 'Branch 2' }, registrant);
  });
});
