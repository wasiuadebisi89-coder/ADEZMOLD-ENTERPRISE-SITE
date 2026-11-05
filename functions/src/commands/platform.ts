import type { CompanyStatus } from '@bms/schemas';
import { defineCommand } from '../lib/command.js';
import { denied, failedPrecondition, notFound } from '../lib/errors.js';
import { auth, db } from '../lib/firebase.js';
import { companyRefs, membershipMirror, type CompanyDoc } from '../lib/model.js';

/**
 * Verified emails allowed to make themselves Platform Super Admin, from the deploy's
 * environment (PLATFORM_OWNER_EMAILS, comma separated). Kept out of the repository.
 */
export function platformOwnerEmails(raw = process.env.PLATFORM_OWNER_EMAILS ?? ''): Set<string> {
  return new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Which registration status each platform decision may move a company from. */
export const STATUS_TRANSITIONS: Record<
  Exclude<CompanyStatus, 'pending'>,
  readonly CompanyStatus[]
> = {
  active: ['pending', 'suspended', 'rejected'],
  rejected: ['pending'],
  suspended: ['active'],
};

/**
 * Makes a configured platform owner a Platform Super Admin: the `platformAdmins` record and the
 * `platformAdmin` custom claim. The web app calls it when the owner opens the platform dashboard.
 */
export const platformClaimAdmin = defineCommand({
  name: 'platform.claimAdmin',
  access: { kind: 'authenticated', requireVerifiedEmail: true },
  async handler({ tx, caller, now }) {
    if (!caller.email || !platformOwnerEmails().has(caller.email)) {
      throw denied('not_platform_owner', 'This area is only for the platform owner');
    }
    const ref = db.doc(`platformAdmins/${caller.uid}`);
    const existing = await tx.get(ref);
    if (!existing.exists) tx.set(ref, { email: caller.email, grantedAt: now, via: 'owner_config' });
    return {
      result: { granted: true },
      audit: {
        target: { scope: 'platform' },
        entityType: 'platformAdmin',
        entityId: caller.uid,
        after: { email: caller.email },
      },
      afterCommit: async () => {
        const user = await auth.getUser(caller.uid);
        if (user.customClaims?.platformAdmin === true) return;
        await auth.setCustomUserClaims(caller.uid, { ...user.customClaims, platformAdmin: true });
      },
    };
  },
});

/** Approves, rejects, suspends or reactivates a company registration. */
export const platformSetCompanyStatus = defineCommand({
  name: 'platform.setCompanyStatus',
  access: { kind: 'platformAdmin' },
  async handler({ tx, caller, input, now }) {
    const refs = companyRefs(input.companyId);
    const company = (await tx.get(refs.company)).data() as CompanyDoc | undefined;
    if (!company) throw notFound('company_not_found', 'Company not found');
    if (company.status === input.status) {
      throw failedPrecondition('status_unchanged', `This company is already ${input.status}`);
    }
    if (!STATUS_TRANSITIONS[input.status].includes(company.status)) {
      throw failedPrecondition(
        'invalid_status_change',
        `A ${company.status} company cannot be made ${input.status}`,
      );
    }
    const members = await tx.get(refs.members.where('status', '==', 'active'));

    const reason = input.reason ?? null;
    tx.update(refs.company, {
      status: input.status,
      statusReason: reason,
      statusChangedAt: now,
      statusChangedBy: caller.uid,
      updatedAt: now,
      updatedBy: caller.uid,
    });
    for (const m of members.docs) {
      tx.set(
        membershipMirror(m.id, input.companyId),
        { companyStatus: input.status, updatedAt: now },
        { merge: true },
      );
    }
    return {
      result: { companyId: input.companyId, status: input.status },
      audit: {
        target: { scope: 'platform', companyId: input.companyId },
        entityType: 'company',
        entityId: input.companyId,
        before: { status: company.status },
        after: { status: input.status },
        reason: input.reason,
      },
    };
  },
});

/** Read-only support view of a company for Platform Super Admins. Always audited (G3). */
export const platformSupportRead = defineCommand({
  name: 'platform.supportRead',
  access: { kind: 'platformAdmin' },
  async handler({ tx, input }) {
    const refs = companyRefs(input.companyId);
    const company = (await tx.get(refs.company)).data() as CompanyDoc | undefined;
    if (!company) throw notFound('company_not_found', 'Company not found');
    const members = await tx.get(refs.members);
    const branches = await tx.get(refs.branches);
    return {
      result: {
        companyId: input.companyId,
        legalName: company.legalName,
        status: company.status,
        baseCurrency: company.baseCurrency,
        memberCount: members.docs.filter((d) => d.get('status') === 'active').length,
        branchCount: branches.size,
      },
      audit: {
        target: { scope: 'platform', companyId: input.companyId },
        entityType: 'company',
        entityId: input.companyId,
        reason: input.reason,
      },
    };
  },
});

/** Signs the caller out of every device (A5). */
export const revokeAllSessions = defineCommand({
  name: 'session.revokeAll',
  access: { kind: 'authenticated', requireVerifiedEmail: false },
  async handler({ caller }) {
    return {
      result: { revoked: true },
      audit: { target: { scope: 'user' }, entityType: 'user', entityId: caller.uid },
      afterCommit: () => auth.revokeRefreshTokens(caller.uid),
    };
  },
});
