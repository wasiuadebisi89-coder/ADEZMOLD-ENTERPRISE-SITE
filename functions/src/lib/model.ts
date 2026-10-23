/** Firestore document shapes and path helpers (docs/bms/DATA_MODEL.md §2–3). */
import type { Timestamp } from 'firebase-admin/firestore';
import type {
  AccountSubtype,
  AccountType,
  BranchScope,
  JournalOrigin,
  PeriodStatus,
  UnitCode,
  Permission,
  SystemRoleId,
} from '@bms/domain';
import { db } from './firebase.js';

export type MemberStatus = 'active' | 'suspended' | 'removed';

export interface CompanyDoc {
  legalName: string;
  tradingName: string;
  country: string;
  baseCurrency: string;
  timeZone: string;
  fiscalYearStartMonth: number;
  costingMethod: 'weighted_average' | 'fifo';
  businessTypes: string[];
  status: 'active' | 'suspended';
  /** Set by posting services once a value can no longer change (Phase 2+). */
  locks: { baseCurrency: boolean; costingMethod: boolean; fiscalYearStartMonth: boolean };
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
  schemaVersion: number;
}

export interface MemberDoc {
  uid: string;
  email: string;
  displayName: string;
  status: MemberStatus;
  roleIds: string[];
  /** Denormalised union of role permissions, read by security rules. */
  permissions: Permission[];
  branchScope: BranchScope;
  joinedAt: Timestamp;
  invitedBy: string | null;
  updatedAt: Timestamp;
  updatedBy: string;
}

export interface RoleDoc {
  name: string;
  description: string;
  system: boolean;
  templateId: SystemRoleId | null;
  permissions: Permission[];
  updatedAt: Timestamp;
  updatedBy: string;
}

export interface BranchDoc {
  code: string;
  name: string;
  address: string;
  status: 'active' | 'inactive';
  isHeadOffice: boolean;
  updatedAt: Timestamp;
  updatedBy: string;
}

export interface SettingsDoc {
  backdateWindowDays: number;
  allowNegativeStock: boolean;
  roundingMode: 'half_away_from_zero';
  taxRounding: 'per_line';
  pricesIncludeTax: boolean;
  updatedAt: Timestamp;
  updatedBy: string;
}

export interface PeriodDoc {
  fiscalYearId: string;
  startDate: string;
  endDate: string;
  status: PeriodStatus;
  statusChangedAt: Timestamp;
  statusChangedBy: string;
  lastReason: string | null;
}

export interface FiscalYearDoc {
  startDate: string;
  endDate: string;
  status: 'open' | 'closed';
  /** Year-end closing journals, in order; a later one closes anything posted after the first. */
  closingJournalIds?: string[];
  createdAt: Timestamp;
  createdBy: string;
}

export interface InvitationDoc {
  companyId: string;
  companyName: string;
  email: string;
  roleIds: string[];
  branchScope: BranchScope;
  tokenHash: string;
  status: 'pending' | 'accepted' | 'revoked';
  expiresAt: Timestamp;
  invitedBy: string;
  createdAt: Timestamp;
  acceptedBy: string | null;
}

export type ApprovalTarget =
  | { action: 'period.reopen'; target: { periodId: string } }
  | { action: 'ledger.backdate'; target: { postingDate: string } }
  | {
      action: 'sales.creditOverride';
      /** The amount the sale may leave on credit, minor units. */
      target: { customerId: string; customerName: string; amountMinor: number };
    };

export type ApprovalRequestDoc = ApprovalTarget & {
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'used';
  requestedBy: string;
  requestedAt: Timestamp;
  decidedBy: string | null;
  decidedAt: Timestamp | null;
  decisionReason: string | null;
  usedAt: Timestamp | null;
  /** The record that consumed the approval, e.g. a journal id. */
  usedFor: string | null;
};

// --- Ledger (DATA_MODEL.md §4) ---------------------------------------------------------------

export interface AccountDoc {
  code: string;
  name: string;
  type: AccountType;
  subtype: AccountSubtype;
  parentId: string | null;
  isPostable: boolean;
  /** Derived from the subtype; control accounts only take postings from their module. */
  isControl: boolean;
  status: 'active' | 'inactive';
  /** Set by the first posting; the type and subtype are fixed from then on. */
  hasPostings: boolean;
  template: { id: string; version: number } | null;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
}

export interface JournalLineDoc {
  lineNo: number;
  accountId: string;
  /** Snapshots so the journal reads correctly after an account is renamed. */
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  memo: string | null;
}

export interface JournalDoc {
  number: string;
  postingDate: string;
  periodId: string;
  branchId: string;
  origin: JournalOrigin;
  currency: string;
  memo: string;
  reference: string | null;
  lines: JournalLineDoc[];
  totalDebit: number;
  totalCredit: number;
  status: 'posted' | 'reversed';
  reversesJournalId: string | null;
  reversedByJournalId: string | null;
  reversalReason: string | null;
  backdateApprovalId: string | null;
  /** The module document that produced a system journal. */
  source: { type: string; id: string; number: string } | null;
  postedAt: Timestamp;
  postedBy: string;
}

export interface LedgerEntryDoc {
  journalId: string;
  journalNumber: string;
  lineNo: number;
  accountId: string;
  postingDate: string;
  periodId: string;
  branchId: string;
  origin: JournalOrigin;
  debit: number;
  credit: number;
  memo: string | null;
  postedAt: Timestamp;
}

// --- Catalogue and inventory (DATA_MODEL.md §5) ---------------------------------------------

export interface CategoryDoc {
  name: string;
  status: 'active' | 'inactive';
  updatedAt: Timestamp;
  updatedBy: string;
}

export interface ProductDoc {
  sku: string;
  name: string;
  unit: UnitCode;
  categoryId: string | null;
  description: string;
  /** Minor units; used by sales from Phase 5. */
  salePrice: number | null;
  reorderLevelMilli: number | null;
  status: 'active' | 'inactive';
  /** Set by the first stock movement; the unit is fixed from then on. */
  hasMovements: boolean;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
}

export interface LocationDoc {
  branchId: string;
  name: string;
  type: 'store' | 'quarantine';
  status: 'active' | 'inactive';
  updatedAt: Timestamp;
  updatedBy: string;
}

export interface StockBalanceDoc {
  productId: string;
  locationId: string;
  branchId: string;
  qtyMilli: number;
  valueMinor: number;
  /** FIFO: sequence for the next cost layer at this product and location. */
  nextLayerSeq: number;
  updatedAt: Timestamp;
}

export interface CostLayerDoc {
  productId: string;
  locationId: string;
  seq: number;
  open: boolean;
  qtyReceived: number;
  qtyRemaining: number;
  valueRemaining: number;
  receivedDate: string;
  sourceId: string;
  /** The receipt line that created the layer, so invoice price differences find it. */
  sourceLineNo: number | null;
}

export type StockMovementType =
  | 'adjustment'
  | 'count'
  | 'opening'
  | 'receipt'
  | 'purchase_return'
  | 'cost_adjustment'
  | 'sale'
  | 'sales_return';
export type StockSourceType =
  | 'stockAdjustment'
  | 'goodsReceipt'
  | 'purchaseInvoice'
  | 'supplierReturn'
  | 'salesInvoice'
  | 'creditNote';

/** Quantity only, so sales staff can see what is available without seeing cost. */
export interface StockAvailabilityDoc {
  productId: string;
  locationId: string;
  branchId: string;
  qtyMilli: number;
  updatedAt: Timestamp;
}

export interface StockMovementDoc {
  productId: string;
  locationId: string;
  branchId: string;
  /** Signed: positive into stock, negative out. */
  qtyMilli: number;
  valueMinor: number;
  movementType: StockMovementType;
  postingDate: string;
  sourceType: StockSourceType;
  sourceId: string;
  sourceNumber: string;
  journalId: string | null;
  balanceQtyMilli: number;
  balanceValueMinor: number;
  postedAt: Timestamp;
  postedBy: string;
}

export interface StockAdjustmentLineDoc {
  lineNo: number;
  productId: string;
  sku: string;
  productName: string;
  unit: UnitCode;
  /** As entered: the change, the counted quantity, or the opening quantity. */
  enteredMilli: number;
  /** Count only: the quantity on hand when the count was recorded. */
  expectedMilli: number | null;
  deltaMilli: number;
  unitCostScaled: number | null;
  /** Filled in when posted. */
  valueMinor: number | null;
}

export interface StockAdjustmentDoc {
  number: string;
  kind: 'adjustment' | 'count' | 'opening';
  locationId: string;
  branchId: string;
  reason: string;
  lines: StockAdjustmentLineDoc[];
  status: 'pending' | 'posted' | 'rejected';
  createdAt: Timestamp;
  createdBy: string;
  decidedAt: Timestamp | null;
  decidedBy: string | null;
  decisionReason: string | null;
  postingDate: string | null;
  journalId: string | null;
  /** Net change in stock value when posted, minor units. */
  valueMinor: number | null;
}

// --- Suppliers and purchasing (DATA_MODEL.md §6) -------------------------------------------

export interface SupplierDoc {
  code: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxId: string | null;
  paymentTermsDays: number;
  status: 'active' | 'inactive';
  /** Owed on posted invoices, minor units. Sums to the trade payables account. */
  balanceMinor: number;
  /** Paid but not yet allocated to invoices. Sums to the supplier advances account. */
  advanceMinor: number;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
}

export interface GoodsReceiptLineDoc {
  lineNo: number;
  productId: string;
  sku: string;
  productName: string;
  unit: UnitCode;
  qtyMilli: number;
  unitCostScaled: number;
  /** Value received into stock and credited to GRNI. */
  valueMinor: number;
  /** Quantity invoiced or returned before invoicing, and the GRNI value released for it. */
  clearedQtyMilli: number;
  clearedValueMinor: number;
}

export interface GoodsReceiptDoc {
  number: string;
  supplierId: string;
  supplierName: string;
  locationId: string;
  branchId: string;
  postingDate: string;
  reference: string | null;
  memo: string | null;
  lines: GoodsReceiptLineDoc[];
  totalMinor: number;
  invoiceStatus: 'not_invoiced' | 'partly_invoiced' | 'invoiced';
  journalId: string;
  postedAt: Timestamp;
  postedBy: string;
}

export interface PurchaseInvoiceLineDoc {
  lineNo: number;
  kind: 'receipt' | 'expense' | 'landed' | 'opening';
  description: string;
  amountMinor: number;
  /** receipt and landed lines */
  goodsReceiptId: string | null;
  receiptNumber: string | null;
  /** receipt lines */
  receiptLineNo: number | null;
  productId: string | null;
  sku: string | null;
  unit: UnitCode | null;
  qtyMilli: number | null;
  grniMinor: number | null;
  returnedQtyMilli: number | null;
  returnedCreditMinor: number | null;
  /** receipt and landed lines: where the difference or charge went */
  inventoryMinor: number | null;
  cogsMinor: number | null;
  /** landed lines */
  basis: 'value' | 'quantity' | null;
  /** expense lines */
  accountId: string | null;
  accountCode: string | null;
}

export interface PurchaseInvoiceDoc {
  number: string;
  kind: 'invoice' | 'opening';
  supplierId: string;
  supplierName: string;
  supplierInvoiceNo: string;
  branchId: string;
  invoiceDate: string;
  dueDate: string;
  memo: string | null;
  lines: PurchaseInvoiceLineDoc[];
  inputTaxMinor: number;
  totalMinor: number;
  /** Settled by payment allocations and by returns credited to this invoice. */
  paidMinor: number;
  /** Credit notes applied to this invoice. */
  creditedMinor: number;
  /** Everything credited for returns, including credit paid back or kept as an advance. */
  returnedMinor?: number;
  status: 'open' | 'paid';
  journalId: string;
  postedAt: Timestamp;
  postedBy: string;
}

export interface PaymentAllocationDoc {
  invoiceId: string;
  invoiceNumber: string;
  amountMinor: number;
  /** The journal that moved this amount: the payment itself, or a later allocation. */
  journalId: string;
  allocatedAt: Timestamp;
}

export interface SupplierPaymentDoc {
  number: string;
  supplierId: string;
  supplierName: string;
  branchId: string;
  postingDate: string;
  paymentAccountId: string;
  paymentAccountName: string;
  amountMinor: number;
  allocatedMinor: number;
  reference: string | null;
  memo: string | null;
  allocations: PaymentAllocationDoc[];
  journalId: string;
  postedAt: Timestamp;
  postedBy: string;
}

export interface SupplierReturnLineDoc {
  lineNo: number;
  goodsReceiptId: string;
  receiptNumber: string;
  receiptLineNo: number;
  invoiceId: string | null;
  invoiceNumber: string | null;
  productId: string;
  sku: string;
  productName: string;
  unit: UnitCode;
  qtyMilli: number;
  /** Stock value taken out at the costing method. */
  costMinor: number;
  /** Released from GRNI, or credited against the invoice. */
  creditMinor: number;
}

export interface SupplierReturnDoc {
  number: string;
  supplierId: string;
  supplierName: string;
  locationId: string;
  branchId: string;
  postingDate: string;
  reason: string;
  lines: SupplierReturnLineDoc[];
  costMinor: number;
  creditMinor: number;
  journalId: string;
  postedAt: Timestamp;
  postedBy: string;
}

// --- Customers and sales (DATA_MODEL.md §7) ------------------------------------------------

export interface TaxCodeDoc {
  code: string;
  name: string;
  /** Basis points: 7.5% is 750. */
  rateBp: number;
  status: 'active' | 'inactive';
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
}

export interface CustomerDoc {
  code: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxId: string | null;
  paymentTermsDays: number;
  /** Minor units; 0 means cash only (DECISION 7). */
  creditLimitMinor: number;
  status: 'active' | 'inactive';
  /** Owed on posted invoices, minor units. Sums to the trade receivables account. */
  balanceMinor: number;
  /** Received but not yet allocated. Sums to the customer advances account. */
  advanceMinor: number;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
}

export interface SalesInvoiceLineDoc {
  lineNo: number;
  productId: string;
  sku: string;
  productName: string;
  unit: UnitCode;
  qtyMilli: number;
  /** The product's price when sold, and the price used. They differ only on an override. */
  listPriceMinor: number | null;
  unitPriceMinor: number;
  discountMinor: number;
  netMinor: number;
  taxCodeId: string | null;
  taxCode: string | null;
  taxRateBp: number;
  taxMinor: number;
  grossMinor: number;
  /** Cost of the goods sold at the costing method. */
  costMinor: number;
  /** Running totals of what has come back on credit notes (Phase 6). */
  returnedQtyMilli: number;
  returnedNetMinor?: number;
  returnedTaxMinor?: number;
  returnedCostMinor?: number;
}

export interface SalePaymentDoc {
  accountId: string;
  accountName: string;
  amountMinor: number;
}

export interface SalesInvoiceDoc {
  number: string;
  kind: 'invoice' | 'opening';
  /** null for a walk-in sale. */
  customerId: string | null;
  customerName: string;
  branchId: string;
  locationId: string | null;
  invoiceDate: string;
  dueDate: string;
  reference: string | null;
  memo: string | null;
  pricesIncludeTax: boolean;
  lines: SalesInvoiceLineDoc[];
  netMinor: number;
  taxMinor: number;
  totalMinor: number;
  costMinor: number;
  /** Paid at the sale. */
  payments: SalePaymentDoc[];
  /** Everything settled: payments at the sale, receipts allocated, credits from returns. */
  paidMinor: number;
  /** Credit notes applied to this invoice. */
  creditedMinor: number;
  /** Everything credited for returns, including credit paid back or kept as an advance. */
  returnedMinor?: number;
  status: 'open' | 'paid';
  /** How a sale over the customer's credit limit was allowed, if it was. */
  creditOverride: { by: 'permission' | 'approval'; approvalId: string | null } | null;
  journalId: string;
  postedAt: Timestamp;
  postedBy: string;
}

export interface CustomerReceiptDoc {
  number: string;
  customerId: string;
  customerName: string;
  branchId: string;
  postingDate: string;
  depositAccountId: string;
  depositAccountName: string;
  amountMinor: number;
  allocatedMinor: number;
  /** Paid back to the customer on refunds (Phase 6). */
  refundedMinor?: number;
  reference: string | null;
  memo: string | null;
  allocations: PaymentAllocationDoc[];
  journalId: string;
  postedAt: Timestamp;
  postedBy: string;
}

// --- Returns, credit notes and refunds (DATA_MODEL.md §8) -------------------------------------

export interface CreditNoteLineDoc {
  /** The sale line returned. */
  lineNo: number;
  productId: string;
  sku: string;
  productName: string;
  unit: UnitCode;
  qtyMilli: number;
  condition: 'resalable' | 'damaged';
  /** Where the goods went back: the store sold from, or a quarantine location. */
  locationId: string;
  /** Filled in when posted: the share of the sale line's amounts. */
  netMinor: number | null;
  taxMinor: number | null;
  costMinor: number | null;
}

export interface CreditNoteDoc {
  number: string;
  invoiceId: string;
  invoiceNumber: string;
  /** null for a walk-in sale. */
  customerId: string | null;
  customerName: string;
  branchId: string;
  reason: string;
  lines: CreditNoteLineDoc[];
  quarantineLocationId: string | null;
  /** Walk-in sales only: the account the credit is paid back from. */
  refundAccountId: string | null;
  status: 'pending' | 'posted' | 'rejected';
  createdAt: Timestamp;
  createdBy: string;
  decidedAt: Timestamp | null;
  decidedBy: string | null;
  decisionReason: string | null;
  /** Filled in when posted. */
  postingDate: string | null;
  netMinor: number;
  taxMinor: number;
  totalMinor: number;
  costMinor: number;
  /** Credit used against invoices: the sale itself first, later others. */
  allocatedMinor: number;
  /** Credit paid back: at once for walk-in sales, or on refunds. */
  refundedMinor: number;
  allocations: PaymentAllocationDoc[];
  journalId: string | null;
}

export interface CustomerRefundDoc {
  number: string;
  customerId: string;
  customerName: string;
  branchId: string;
  source: { type: 'customerReceipt' | 'creditNote'; id: string; number: string };
  accountId: string;
  accountName: string;
  amountMinor: number;
  reason: string;
  reference: string | null;
  status: 'pending' | 'posted' | 'rejected';
  createdAt: Timestamp;
  createdBy: string;
  decidedAt: Timestamp | null;
  decidedBy: string | null;
  decisionReason: string | null;
  postingDate: string | null;
  journalId: string | null;
}

// --- Bank reconciliation (DATA_MODEL.md §9) ---------------------------------------------------

/** Per cash or bank account: where the last reconciliation left off. Id = account id. */
export interface BankStateDoc {
  accountId: string;
  reconciledBalanceMinor: number;
  lastStatementDate: string;
  lastReconciliationId: string;
  updatedAt: Timestamp;
}

export interface BankReconciliationDoc {
  accountId: string;
  accountName: string;
  statementDate: string;
  openingBalanceMinor: number;
  statementBalanceMinor: number;
  entryIds: string[];
  clearedDebitMinor: number;
  clearedCreditMinor: number;
  completedAt: Timestamp;
  completedBy: string;
}

/** One per ledger entry cleared on a statement, so no entry is cleared twice. */
export interface BankClearingDoc {
  accountId: string;
  reconciliationId: string;
  statementDate: string;
  clearedAt: Timestamp;
}

// --- Fixed assets (DATA_MODEL.md §10) ---------------------------------------------------------

export interface FixedAssetDoc {
  number: string;
  name: string;
  branchId: string;
  assetAccountId: string;
  assetAccountName: string;
  accumulatedAccountId: string;
  expenseAccountId: string;
  costMinor: number;
  residualMinor: number;
  usefulLifeMonths: number;
  availableForUseDate: string;
  /** The first month charged after the base (DECISION 10). */
  firstMonth: string;
  /** For assets brought in at cut-over: months and depreciation charged before. */
  baseMonths: number;
  baseAccumulatedMinor: number;
  /** Running totals, including the base. */
  chargedMonths: number;
  accumulatedMinor: number;
  /** The last month charged, or null. */
  depreciatedThrough: string | null;
  status: 'active' | 'disposed';
  acquisition: {
    kind: 'purchase' | 'opening';
    date: string;
    creditAccountId: string | null;
    journalId: string;
  };
  disposal: {
    date: string;
    proceedsMinor: number;
    proceedsAccountId: string | null;
    gainLossAccountId: string;
    /** Positive is a gain, negative a loss. */
    gainMinor: number;
    reason: string;
    journalId: string;
    disposedAt: Timestamp;
    disposedBy: string;
  } | null;
  reference: string | null;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
}

export interface DepreciationRunDoc {
  branchId: string;
  month: string;
  postingDate: string;
  totalMinor: number;
  assets: { assetId: string; number: string; months: number; amountMinor: number }[];
  journalId: string;
  journalNumber: string;
  postedAt: Timestamp;
  postedBy: string;
}

/**
 * One amount settled against an invoice after it was posted: a receipt or payment allocated, or
 * a credit from a return. Lets ageing be worked out as at any date (DATA_MODEL.md §11).
 * Payments taken at a sale are on the invoice itself.
 */
export interface SettlementDoc {
  ledger: 'receivable' | 'payable';
  invoiceId: string;
  partyId: string;
  /** The business date of the journal that settled it. */
  date: string;
  amountMinor: number;
  kind: 'allocation' | 'credit';
  sourceType: string;
  sourceId: string;
  journalId: string;
  at: Timestamp;
}

export interface NumberSeriesDoc {
  prefix: string;
  next: number;
}

export interface LedgerSettingsDoc {
  /** The posted, unreversed opening-balance journal, if any. */
  openingBalanceJournalId: string | null;
  updatedAt: Timestamp;
  updatedBy: string;
}

export function companyRefs(companyId: string) {
  const company = db.doc(`companies/${companyId}`);
  return {
    company,
    member: (uid: string) => company.collection('members').doc(uid),
    members: company.collection('members'),
    role: (id: string) => company.collection('roles').doc(id),
    roles: company.collection('roles'),
    branch: (id: string) => company.collection('branches').doc(id),
    branches: company.collection('branches'),
    settings: company.collection('settings').doc('general'),
    period: (id: string) => company.collection('periods').doc(id),
    periods: company.collection('periods'),
    fiscalYear: (id: string) => company.collection('fiscalYears').doc(id),
    fiscalYears: company.collection('fiscalYears'),
    approval: (id: string) => company.collection('approvalRequests').doc(id),
    approvals: company.collection('approvalRequests'),
    command: (key: string) => company.collection('commands').doc(key),
    account: (id: string) => company.collection('accounts').doc(id),
    accounts: company.collection('accounts'),
    journal: (id: string) => company.collection('journals').doc(id),
    journals: company.collection('journals'),
    ledgerEntry: (id: string) => company.collection('ledgerEntries').doc(id),
    ledgerEntries: company.collection('ledgerEntries'),
    numberSeries: (id: string) => company.collection('numberSeries').doc(id),
    ledgerSettings: company.collection('settings').doc('ledger'),
    category: (id: string) => company.collection('categories').doc(id),
    categories: company.collection('categories'),
    product: (id: string) => company.collection('products').doc(id),
    products: company.collection('products'),
    location: (id: string) => company.collection('locations').doc(id),
    locations: company.collection('locations'),
    stockBalance: (productId: string, locationId: string) =>
      company.collection('stockBalances').doc(`${productId}__${locationId}`),
    stockBalances: company.collection('stockBalances'),
    costLayers: company.collection('costLayers'),
    stockMovements: company.collection('stockMovements'),
    stockAdjustment: (id: string) => company.collection('stockAdjustments').doc(id),
    stockAdjustments: company.collection('stockAdjustments'),
    supplier: (id: string) => company.collection('suppliers').doc(id),
    suppliers: company.collection('suppliers'),
    goodsReceipt: (id: string) => company.collection('goodsReceipts').doc(id),
    goodsReceipts: company.collection('goodsReceipts'),
    purchaseInvoice: (id: string) => company.collection('purchaseInvoices').doc(id),
    purchaseInvoices: company.collection('purchaseInvoices'),
    supplierInvoiceKey: (id: string) => company.collection('supplierInvoiceKeys').doc(id),
    supplierPayment: (id: string) => company.collection('supplierPayments').doc(id),
    supplierPayments: company.collection('supplierPayments'),
    supplierReturn: (id: string) => company.collection('supplierReturns').doc(id),
    supplierReturns: company.collection('supplierReturns'),
    stockAvailability: (productId: string, locationId: string) =>
      company.collection('stockAvailability').doc(`${productId}__${locationId}`),
    taxCode: (id: string) => company.collection('taxCodes').doc(id),
    taxCodes: company.collection('taxCodes'),
    customer: (id: string) => company.collection('customers').doc(id),
    customers: company.collection('customers'),
    salesInvoice: (id: string) => company.collection('salesInvoices').doc(id),
    salesInvoices: company.collection('salesInvoices'),
    customerReceipt: (id: string) => company.collection('customerReceipts').doc(id),
    customerReceipts: company.collection('customerReceipts'),
    creditNote: (id: string) => company.collection('creditNotes').doc(id),
    creditNotes: company.collection('creditNotes'),
    customerRefund: (id: string) => company.collection('customerRefunds').doc(id),
    customerRefunds: company.collection('customerRefunds'),
    bankState: (accountId: string) => company.collection('bankStates').doc(accountId),
    bankReconciliation: (id: string) => company.collection('bankReconciliations').doc(id),
    bankReconciliations: company.collection('bankReconciliations'),
    bankClearing: (entryId: string) => company.collection('bankClearings').doc(entryId),
    bankClearings: company.collection('bankClearings'),
    fixedAsset: (id: string) => company.collection('fixedAssets').doc(id),
    fixedAssets: company.collection('fixedAssets'),
    depreciationRuns: company.collection('depreciationRuns'),
    settlements: company.collection('settlements'),
    auditLogs: company.collection('auditLogs'),
  };
}

export const membershipMirror = (uid: string, companyId: string) =>
  db.doc(`users/${uid}/memberships/${companyId}`);

export const invitationRef = (id: string) => db.doc(`invitations/${id}`);
