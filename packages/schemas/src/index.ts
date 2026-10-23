/**
 * Zod schemas for every command. The web app uses them for form validation; the functions
 * use the same schemas as the authoritative check (docs/bms/ARCHITECTURE.md §5).
 */
import { z } from 'zod';
import {
  ACCOUNT_CODE,
  ACCOUNT_SUBTYPES,
  ACCOUNT_TYPES,
  CHART_TEMPLATES,
  MAX_JOURNAL_LINES,
  PERMISSIONS,
  SUPPORTED_CURRENCY_CODES,
  isIsoDate,
} from '@bms/domain';

const trimmed = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, min <= 1 ? 'This field is required' : `Use at least ${min} characters`)
    .max(max, `Use at most ${max} characters`);

/** Optional free text where an empty input means "not provided". */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters`)
    .optional()
    .transform((v) => (v ? v : undefined));

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
  tradingName: optionalText(160),
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

export const APPROVAL_ACTIONS = ['period.reopen', 'ledger.backdate'] as const;
export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];

export const requestApprovalInput = z.discriminatedUnion('action', [
  scoped.extend({
    action: z.literal('period.reopen'),
    target: z.object({ periodId }),
    reason: trimmed(3, 500),
  }),
  scoped.extend({
    action: z.literal('ledger.backdate'),
    target: z.object({ postingDate: isoDate }),
    reason: trimmed(3, 500),
  }),
]);
export const decideApprovalInput = scoped.extend({
  approvalRequestId: docId,
  decision: z.enum(['approved', 'rejected']),
  reason: trimmed(3, 500),
});

// --- Ledger -------------------------------------------------------------------------------

export const accountCode = z
  .string()
  .trim()
  .regex(ACCOUNT_CODE, 'Use digits, optionally with one dot or dash, e.g. 1110 or 1110.01');

export const applyChartTemplateInput = scoped.extend({
  templateId: z.enum(Object.keys(CHART_TEMPLATES) as [string, ...string[]]),
});
export const createAccountInput = scoped.extend({
  code: accountCode,
  name: trimmed(2, 120),
  type: z.enum(ACCOUNT_TYPES),
  subtype: z.enum(ACCOUNT_SUBTYPES).default('general'),
  parentId: docId.nullable().default(null),
  isPostable: z.boolean().default(true),
});
export const updateAccountInput = scoped.extend({
  accountId: docId,
  name: trimmed(2, 120).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  parentId: docId.nullable().optional(),
});

/**
 * A money amount as typed by the user, e.g. "1,250.50". Empty means zero. The server parses it
 * with the company's currency, which also rejects too many decimal places.
 */
export const amount = z
  .string()
  .trim()
  .max(24, 'Amount is too large')
  .regex(/^(\d{1,3}(,\d{3})*|\d*)(\.\d*)?$/, 'Enter an amount such as 1250.50')
  .transform((v) => (v === '' || v === '.' ? '0' : v));

export const journalLineInput = z.object({
  accountId: docId,
  debit: amount,
  credit: amount,
  memo: optionalText(200),
});
const journalLines = z
  .array(journalLineInput)
  .min(2, 'A journal needs at least two lines')
  .max(MAX_JOURNAL_LINES, `A journal can have at most ${MAX_JOURNAL_LINES} lines`);

export const postJournalInput = scoped.extend({
  branchId: docId,
  postingDate: isoDate,
  memo: trimmed(3, 300),
  reference: optionalText(60),
  lines: journalLines,
  backdateApprovalId: docId.optional(),
});
export const reverseJournalInput = scoped.extend({
  journalId: docId,
  postingDate: isoDate,
  reason: trimmed(3, 500),
  backdateApprovalId: docId.optional(),
});
export const postOpeningBalanceInput = scoped.extend({
  branchId: docId,
  asAtDate: isoDate,
  memo: optionalText(300),
  lines: z
    .array(journalLineInput)
    .min(1, 'Enter at least one balance')
    .max(MAX_JOURNAL_LINES - 1, `Enter at most ${MAX_JOURNAL_LINES - 1} balances`),
  backdateApprovalId: docId.optional(),
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
  'chart.applyTemplate': applyChartTemplateInput,
  'account.create': createAccountInput,
  'account.update': updateAccountInput,
  'journal.post': postJournalInput,
  'journal.reverse': reverseJournalInput,
  'openingBalance.post': postOpeningBalanceInput,
  'platform.supportRead': platformSupportReadInput,
  'session.revokeAll': revokeSessionsInput,
} as const;

export type CommandName = keyof typeof COMMAND_SCHEMAS;
export type CommandInput<N extends CommandName> = z.infer<(typeof COMMAND_SCHEMAS)[N]>;
