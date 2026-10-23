import { defineCommand } from '../lib/command.js';
import { notFound } from '../lib/errors.js';
import { auth } from '../lib/firebase.js';
import { companyRefs, type CompanyDoc } from '../lib/model.js';

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
