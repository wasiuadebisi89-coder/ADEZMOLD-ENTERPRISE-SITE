/**
 * Zod schemas for every command. The web app uses them for form validation; the functions
 * use the same schemas as the authoritative check (docs/bms/ARCHITECTURE.md §5).
 */
import { z } from 'zod';
import { PERMISSIONS, SUPPORTED_CURRENCY_CODES, isIsoDate } from '@bms/domain';

const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max);

export const idempotencyKey = z.uuid({ message: 'idempotencyKey must be a UUID' });
export const docId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Invalid id');
export const companyId = docId;
export const isoDate = z.string().refine((v) => isIsoDate(v), 'Invalid date (YYYY-MM-DD)');
export const email = z
  .email()
  .max(254)
  .transform((e) => e.trim().toLowerCase());

export const timeZone = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, 'Unknown time zone');

export const branchCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{1,12}$/, 'Use 1–12 letters, digits or dashes');

export const permission = z.enum(PERMISSIONS);
export const branchScope = z.union([z.literal('all'), z.array(docId).min(1).max(100)]);

const base = z.object({ idempotencyKey });
const scoped = base.extend({ companyId });

// --- Company -------------------------------------------------------------------------------

export const createCompanyInput = base.extend({
  legalName: trimmed(2, 160),
  tradingName: trimmed(1, 160).optional(),
  country: z.string().length(2).toUpperCase(),
  baseCurrency: z.enum(SUPPORTED_CURRENCY_CODES),
  timeZone,
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  headOffice: z.object({
    code: branchCode,
    name: trimmed(1, 120),
  }),
});
export type CreateCompanyInput = z.infer<typeof createCompanyInput>;

export const updateCompanySettingsInput = scoped.extend({
  tradingName: trimmed(1, 160).optional(),
  timeZone: timeZone.optional(),
  baseCurrency: z.enum(SUPPORTED_CURRENCY_CODES).optional(),
  fiscalYearStartMonth: z.number().int().min(1).max(12).optional(),
  backdateWindowDays: z.number().int().min(0).max(366).optional(),
});
export type UpdateCompanySettingsInput = z.infer<typeof updateCompanySettingsInput>;

// --- Branches ------------------------------------------------------------------------------

export const createBranchInput = scoped.extend({
  code: branchCode,
  name: trimmed(1, 120),
  address: trimmed(0, 300).optional(),
});
export const updateBranchInput = scoped.extend({
  branchId: docId,
  name: trimmed(1, 120).optional(),
  address: trimmed(0, 300).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

// --- Roles ---------------------------------------------------------------------------------

export const createRoleInput = scoped.extend({
  name: trimmed(2, 60),
  description: trimmed(0, 300).optional(),
  permissions: z.array(permission).max(PERMISSIONS.length),
});
export const updateRoleInput = scoped.extend({
  roleId: docId,
  name: trimmed(2, 60).optional(),
  description: trimmed(0, 300).optional(),
  permissions: z.array(permission).max(PERMISSIONS.length).optional(),
});
export const deleteRoleInput = scoped.extend({ roleId: docId });

// --- Invitations and members ---------------------------------------------------------------

export const createInvitationInput = scoped.extend({
  email,
  roleIds: z.array(docId).min(1).max(10),
  branchScope,
});
export const revokeInvitationInput = scoped.extend({ invitationId: docId });
export const acceptInvitationInput = base.extend({
  invitationId: docId,
  token: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
});

export const updateMemberInput = scoped.extend({
  uid: docId.max(128),
  roleIds: z.array(docId).min(1).max(10).optional(),
  branchScope: branchScope.optional(),
});
export const setMemberStatusInput = scoped.extend({
  uid: docId.max(128),
  status: z.enum(['active', 'suspended', 'removed']),
  reason: trimmed(3, 500),
});

// --- Periods and approvals -----------------------------------------------------------------

export const periodId = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Period id must be YYYY-MM');

export const setPeriodStatusInput = scoped.extend({
  periodId,
  status: z.enum(['open', 'soft_closed', 'closed']),
  reason: trimmed(3, 500).optional(),
  approvalRequestId: docId.optional(),
});
export const createFiscalYearInput = scoped.extend({
  startYear: z.number().int().min(2000).max(2100),
});

export const requestApprovalInput = scoped.extend({
  action: z.enum(['period.reopen']),
  target: z.object({ periodId }),
  reason: trimmed(3, 500),
});
export const decideApprovalInput = scoped.extend({
  approvalRequestId: docId,
  decision: z.enum(['approved', 'rejected']),
  reason: trimmed(3, 500),
});

// --- Platform and session ------------------------------------------------------------------

export const platformSupportReadInput = base.extend({
  companyId,
  reason: trimmed(10, 500),
});
export const revokeSessionsInput = base;

/** Command name → schema. The functions layer registers exactly these names. */
export const COMMAND_SCHEMAS = {
  'company.create': createCompanyInput,
  'company.updateSettings': updateCompanySettingsInput,
  'branch.create': createBranchInput,
  'branch.update': updateBranchInput,
  'role.create': createRoleInput,
  'role.update': updateRoleInput,
  'role.delete': deleteRoleInput,
  'invitation.create': createInvitationInput,
  'invitation.revoke': revokeInvitationInput,
  'invitation.accept': acceptInvitationInput,
  'member.update': updateMemberInput,
  'member.setStatus': setMemberStatusInput,
  'period.setStatus': setPeriodStatusInput,
  'fiscalYear.create': createFiscalYearInput,
  'approval.request': requestApprovalInput,
  'approval.decide': decideApprovalInput,
  'platform.supportRead': platformSupportReadInput,
  'session.revokeAll': revokeSessionsInput,
} as const;

export type CommandName = keyof typeof COMMAND_SCHEMAS;
export type CommandInput<N extends CommandName> = z.infer<(typeof COMMAND_SCHEMAS)[N]>;
