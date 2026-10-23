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
  UNIT_CODES,
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
  costingMethod: z.enum(['weighted_average', 'fifo']).optional(),
  /** DECISION 9: whether sale prices include tax. Applies to sales posted afterwards. */
  pricesIncludeTax: z.boolean().optional(),
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

export const APPROVAL_ACTIONS = [
  'period.reopen',
  'ledger.backdate',
  'sales.creditOverride',
] as const;
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
  /** A sale that takes a customer over their credit limit; the amount is what goes on credit. */
  scoped.extend({
    action: z.literal('sales.creditOverride'),
    target: z.object({
      customerId: docId,
      amount: z
        .string()
        .trim()
        .max(24)
        .regex(/^(\d{1,3}(,\d{3})*|\d+)(\.\d+)?$/, 'Enter an amount such as 1250.50'),
    }),
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

// --- Catalogue and inventory (Phase 3) --------------------------------------------------------

/** A quantity as typed, e.g. "2.5". Parsed on the server with the product's unit. */
export const quantity = z
  .string()
  .trim()
  .min(1, 'Enter a quantity')
  .max(20, 'Quantity is too large')
  .regex(/^-?(\d{1,3}(,\d{3})*|\d+)(\.\d+)?$/, 'Enter a number such as 12 or 2.5');

/** A unit cost as typed. Empty means "use the current average cost". */
export const unitCost = z
  .string()
  .trim()
  .max(24, 'Cost is too large')
  .regex(/^((\d{1,3}(,\d{3})*|\d+)(\.\d+)?)?$/, 'Enter a cost such as 1250.50')
  .optional()
  .transform((v) => (v ? v : undefined));

export const sku = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z0-9][A-Z0-9._-]{0,39}$/,
    'Use up to 40 letters, digits, dots, dashes or underscores',
  );

export const createCategoryInput = scoped.extend({ name: trimmed(2, 80) });
export const updateCategoryInput = scoped.extend({
  categoryId: docId,
  name: trimmed(2, 80).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export const createProductInput = scoped.extend({
  sku,
  name: trimmed(2, 160),
  unit: z.enum(UNIT_CODES),
  categoryId: docId.nullable().default(null),
  description: optionalText(500),
  salePrice: amount.optional(),
  reorderLevel: quantity.optional(),
});
export const updateProductInput = scoped.extend({
  productId: docId,
  name: trimmed(2, 160).optional(),
  categoryId: docId.nullable().optional(),
  description: z.string().trim().max(500).optional(),
  salePrice: amount.nullable().optional(),
  reorderLevel: quantity.nullable().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export const createLocationInput = scoped.extend({
  branchId: docId,
  name: trimmed(2, 80),
  type: z.enum(['store', 'quarantine']),
});
export const updateLocationInput = scoped.extend({
  locationId: docId,
  name: trimmed(2, 80).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export const STOCK_ADJUSTMENT_KINDS = ['adjustment', 'count', 'opening'] as const;
export type StockAdjustmentKind = (typeof STOCK_ADJUSTMENT_KINDS)[number];

/**
 * One request for every stock change outside purchases and sales. `quantity` means:
 * adjustment — the change (+ found, − lost); count — the quantity counted;
 * opening — the quantity on hand at the start (needs a unit cost).
 */
export const createStockAdjustmentInput = scoped.extend({
  kind: z.enum(STOCK_ADJUSTMENT_KINDS),
  locationId: docId,
  reason: trimmed(3, 500),
  lines: z
    .array(z.object({ productId: docId, quantity, unitCost }))
    .min(1, 'Add at least one product')
    .max(200, 'Use at most 200 lines'),
});
export const decideStockAdjustmentInput = scoped.extend({
  adjustmentId: docId,
  decision: z.enum(['approved', 'rejected']),
  reason: trimmed(3, 500),
});

// --- Suppliers and purchasing (Phase 4) -----------------------------------------------------

export const supplierCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z0-9][A-Z0-9._-]{0,19}$/,
    'Use up to 20 letters, digits, dots, dashes or underscores',
  );

const supplierDetails = {
  name: trimmed(2, 160),
  contactName: optionalText(120),
  phone: optionalText(40),
  email: z
    .string()
    .trim()
    .max(254)
    .refine((v) => v === '' || z.email().safeParse(v).success, 'Enter a valid email')
    .optional()
    .transform((v) => (v ? v.toLowerCase() : undefined)),
  address: optionalText(300),
  taxId: optionalText(40),
  paymentTermsDays: z.number().int().min(0).max(365),
};

export const createSupplierInput = scoped.extend({ code: supplierCode, ...supplierDetails });
export const updateSupplierInput = scoped.extend({
  supplierId: docId,
  ...(Object.fromEntries(Object.entries(supplierDetails).map(([k, v]) => [k, v.optional()])) as {
    [K in keyof typeof supplierDetails]: z.ZodOptional<(typeof supplierDetails)[K]>;
  }),
  status: z.enum(['active', 'inactive']).optional(),
});

const MAX_DOCUMENT_LINES = 200;
const documentLines = <T extends z.ZodType>(line: T) =>
  z
    .array(line)
    .min(1, 'Add at least one line')
    .max(MAX_DOCUMENT_LINES, `Use at most ${MAX_DOCUMENT_LINES} lines`);

/** A cost the user must enter (receipts need one; empty is not allowed). */
export const requiredUnitCost = z
  .string()
  .trim()
  .min(1, 'Enter a unit cost')
  .max(24, 'Cost is too large')
  .regex(/^(\d{1,3}(,\d{3})*|\d+)(\.\d+)?$/, 'Enter a cost such as 1250.50');

export const postGoodsReceiptInput = scoped.extend({
  supplierId: docId,
  locationId: docId,
  postingDate: isoDate,
  reference: optionalText(60),
  memo: optionalText(300),
  lines: documentLines(z.object({ productId: docId, quantity, unitCost: requiredUnitCost })),
  backdateApprovalId: docId.optional(),
});

export const LANDED_COST_BASES = ['value', 'quantity'] as const;

export const purchaseInvoiceLineInput = z.discriminatedUnion('kind', [
  /** Goods already received: clears GRNI; any price difference goes to stock or cost of sales. */
  z.object({
    kind: z.literal('receipt'),
    goodsReceiptId: docId,
    lineNo: z.number().int().min(1),
    quantity,
    amount,
  }),
  /** Services and other costs: debits the chosen account. */
  z.object({
    kind: z.literal('expense'),
    accountId: docId,
    description: trimmed(2, 200),
    amount,
  }),
  /** A capitalisable charge (freight in, duty) spread over a receipt's lines. */
  z.object({
    kind: z.literal('landed'),
    goodsReceiptId: docId,
    description: trimmed(2, 200),
    basis: z.enum(LANDED_COST_BASES),
    amount,
  }),
]);
export type PurchaseInvoiceLineInput = z.infer<typeof purchaseInvoiceLineInput>;

export const postPurchaseInvoiceInput = scoped.extend({
  supplierId: docId,
  branchId: docId,
  invoiceDate: isoDate,
  dueDate: isoDate.optional(),
  supplierInvoiceNo: trimmed(1, 60),
  memo: optionalText(300),
  lines: documentLines(purchaseInvoiceLineInput),
  /** Recoverable input tax shown on the supplier's invoice, if any. Not computed. */
  inputTax: amount.optional(),
  backdateApprovalId: docId.optional(),
});

export const postSupplierOpeningBalanceInput = scoped.extend({
  supplierId: docId,
  branchId: docId,
  asAtDate: isoDate,
  dueDate: isoDate.optional(),
  supplierInvoiceNo: trimmed(1, 60),
  amount,
  backdateApprovalId: docId.optional(),
});

const allocationsInput = z
  .array(z.object({ invoiceId: docId, amount }))
  .max(100, 'Use at most 100 allocations');

export const postSupplierPaymentInput = scoped.extend({
  supplierId: docId,
  branchId: docId,
  postingDate: isoDate,
  paymentAccountId: docId,
  amount,
  reference: optionalText(60),
  memo: optionalText(300),
  allocations: allocationsInput.default([]),
  backdateApprovalId: docId.optional(),
});

/** Applies the unallocated part of an earlier payment (a supplier advance) to invoices. */
export const allocateSupplierPaymentInput = scoped.extend({
  paymentId: docId,
  allocations: allocationsInput.min(1, 'Choose at least one invoice'),
});

export const postSupplierReturnInput = scoped.extend({
  supplierId: docId,
  locationId: docId,
  postingDate: isoDate,
  reason: trimmed(3, 500),
  lines: documentLines(
    z.object({
      goodsReceiptId: docId,
      lineNo: z.number().int().min(1),
      quantity,
      /** Set when the goods were invoiced: the credit reduces what is owed on that invoice. */
      invoiceId: docId.optional(),
    }),
  ),
  backdateApprovalId: docId.optional(),
});

// --- Customers and sales (Phase 5) ---------------------------------------------------------

export const customerCode = supplierCode;

const customerDetails = {
  ...supplierDetails,
  /** DECISION 7: 0 means cash only. Sales beyond it need an override. */
  creditLimit: amount,
};

export const createCustomerInput = scoped.extend({ code: customerCode, ...customerDetails });
export const updateCustomerInput = scoped.extend({
  customerId: docId,
  ...(Object.fromEntries(Object.entries(customerDetails).map(([k, v]) => [k, v.optional()])) as {
    [K in keyof typeof customerDetails]: z.ZodOptional<(typeof customerDetails)[K]>;
  }),
  status: z.enum(['active', 'inactive']).optional(),
});

export const taxCode = supplierCode;
/** A percentage as typed, e.g. "7.5". No rate is preset (DECISION 9). */
export const ratePercent = z
  .string()
  .trim()
  .regex(/^\d{1,4}(\.\d{1,2})?$/, 'Enter a rate such as 7.5, with up to two decimals');

export const createTaxCodeInput = scoped.extend({
  code: taxCode,
  name: trimmed(2, 80),
  rate: ratePercent,
});
export const updateTaxCodeInput = scoped.extend({
  taxCodeId: docId,
  name: trimmed(2, 80).optional(),
  rate: ratePercent.optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export const salesLineInput = z.object({
  productId: docId,
  quantity,
  /** Leave out to sell at the product's price. A different price needs sales.priceOverride. */
  unitPrice: amount.optional(),
  /** An amount off the line. Needs sales.priceOverride. */
  discount: amount.optional(),
  taxCodeId: docId.optional(),
});

export const postSalesInvoiceInput = scoped.extend({
  /** Leave out for a walk-in customer, who must pay in full. */
  customerId: docId.optional(),
  locationId: docId,
  postingDate: isoDate,
  dueDate: isoDate.optional(),
  reference: optionalText(60),
  memo: optionalText(300),
  lines: documentLines(salesLineInput),
  /** Money taken at the sale. Whatever is left is owed by the customer. */
  payments: z
    .array(z.object({ accountId: docId, amount }))
    .max(5, 'Use at most 5 payments')
    .default([]),
  creditApprovalId: docId.optional(),
  backdateApprovalId: docId.optional(),
});

export const postCustomerOpeningBalanceInput = scoped.extend({
  customerId: docId,
  branchId: docId,
  asAtDate: isoDate,
  dueDate: isoDate.optional(),
  reference: trimmed(1, 60),
  amount,
  backdateApprovalId: docId.optional(),
});

export const postCustomerReceiptInput = scoped.extend({
  customerId: docId,
  branchId: docId,
  postingDate: isoDate,
  depositAccountId: docId,
  amount,
  reference: optionalText(60),
  memo: optionalText(300),
  allocations: allocationsInput.default([]),
  backdateApprovalId: docId.optional(),
});

/** Applies the unallocated part of an earlier receipt (a customer advance) to invoices. */
export const allocateCustomerReceiptInput = scoped.extend({
  receiptId: docId,
  allocations: allocationsInput.min(1, 'Choose at least one invoice'),
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
  'category.create': createCategoryInput,
  'category.update': updateCategoryInput,
  'product.create': createProductInput,
  'product.update': updateProductInput,
  'location.create': createLocationInput,
  'location.update': updateLocationInput,
  'stockAdjustment.create': createStockAdjustmentInput,
  'stockAdjustment.decide': decideStockAdjustmentInput,
  'supplier.create': createSupplierInput,
  'supplier.update': updateSupplierInput,
  'goodsReceipt.post': postGoodsReceiptInput,
  'purchaseInvoice.post': postPurchaseInvoiceInput,
  'supplierOpeningBalance.post': postSupplierOpeningBalanceInput,
  'supplierPayment.post': postSupplierPaymentInput,
  'supplierPayment.allocate': allocateSupplierPaymentInput,
  'supplierReturn.post': postSupplierReturnInput,
  'taxCode.create': createTaxCodeInput,
  'taxCode.update': updateTaxCodeInput,
  'customer.create': createCustomerInput,
  'customer.update': updateCustomerInput,
  'salesInvoice.post': postSalesInvoiceInput,
  'customerOpeningBalance.post': postCustomerOpeningBalanceInput,
  'customerReceipt.post': postCustomerReceiptInput,
  'customerReceipt.allocate': allocateCustomerReceiptInput,
  'platform.supportRead': platformSupportReadInput,
  'session.revokeAll': revokeSessionsInput,
} as const;

export type CommandName = keyof typeof COMMAND_SCHEMAS;
export type CommandInput<N extends CommandName> = z.infer<(typeof COMMAND_SCHEMAS)[N]>;
