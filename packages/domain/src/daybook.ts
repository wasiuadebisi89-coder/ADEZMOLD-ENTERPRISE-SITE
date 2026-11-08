/**
 * The day book: every journal posted on a day or over a date range, in the order it was
 * posted, grouped by the kind of voucher behind it (a sale, a payment, a manual journal...).
 * Pure functions; the web app loads the journals and these arrange them. Amounts are minor units.
 */

export const VOUCHER_TYPES = [
  'sales',
  'receipt',
  'salesReturn',
  'refund',
  'goodsReceipt',
  'purchase',
  'payment',
  'expense',
  'purchaseReturn',
  'stockAdjustment',
  'production',
  'fixedAsset',
  'depreciation',
  'journal',
  'openingBalance',
  'reversal',
  'yearEnd',
  'other',
] as const;
export type VoucherType = (typeof VOUCHER_TYPES)[number];

export const VOUCHER_LABEL: Record<VoucherType, string> = {
  sales: 'Sales',
  receipt: 'Receipt',
  salesReturn: 'Sales return',
  refund: 'Customer refund',
  goodsReceipt: 'Goods received',
  purchase: 'Purchase',
  payment: 'Payment',
  expense: 'Expense',
  purchaseReturn: 'Purchase return',
  stockAdjustment: 'Stock adjustment',
  production: 'Production',
  fixedAsset: 'Fixed asset',
  depreciation: 'Depreciation',
  journal: 'Journal',
  openingBalance: 'Opening balance',
  reversal: 'Reversal',
  yearEnd: 'Year-end close',
  other: 'Other',
};

const BY_SOURCE: Record<string, VoucherType> = {
  salesInvoice: 'sales',
  customerReceipt: 'receipt',
  creditNote: 'salesReturn',
  customerRefund: 'refund',
  goodsReceipt: 'goodsReceipt',
  purchaseInvoice: 'purchase',
  supplierPayment: 'payment',
  expense: 'expense',
  supplierReturn: 'purchaseReturn',
  stockAdjustment: 'stockAdjustment',
  productionOrder: 'production',
  fixedAsset: 'fixedAsset',
  depreciationRun: 'depreciation',
  fiscalYear: 'yearEnd',
};

export type JournalOriginForDayBook =
  'manual' | 'opening_balance' | 'reversal' | 'system' | 'closing';

export interface DayBookLine {
  lineNo: number;
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  memo: string | null;
}

export interface DayBookJournal {
  id: string;
  number: string;
  postingDate: string;
  origin: JournalOriginForDayBook;
  memo: string;
  branchId: string;
  status: 'posted' | 'reversed';
  totalDebit: number;
  totalCredit: number;
  lines: readonly DayBookLine[];
  source?: { type: string; id: string; number: string } | null;
  /** Milliseconds since the epoch; orders journals posted on the same date. */
  postedAtMs: number;
}

/** The kind of voucher a journal records, from its source document or how it was posted. */
export function voucherType(j: Pick<DayBookJournal, 'origin' | 'source'>): VoucherType {
  if (j.origin === 'reversal') return 'reversal';
  if (j.origin === 'opening_balance') return 'openingBalance';
  if (j.origin === 'closing') return 'yearEnd';
  if (j.source) return BY_SOURCE[j.source.type] ?? 'other';
  return j.origin === 'manual' ? 'journal' : 'other';
}

export interface DayBookRow extends DayBookJournal {
  voucherType: VoucherType;
  /** The source document's number (an invoice, a payment...) or the journal's own. */
  voucherNumber: string;
}

export interface DayBookTypeTotal {
  type: VoucherType;
  count: number;
  amount: bigint;
}

export interface DayBook {
  rows: DayBookRow[];
  totalDebit: bigint;
  totalCredit: bigint;
  /** One entry per voucher type that appears, in VOUCHER_TYPES order. */
  byType: DayBookTypeTotal[];
}

export interface DayBookFilter {
  from: string;
  to: string;
  /** Only these voucher types; empty or missing means all. */
  types?: readonly VoucherType[];
  branchId?: string | null;
}

/**
 * Arranges journals into the day book: inside the date range and filters, oldest first (by
 * posting date, then the time it was posted, then number), with debit and credit totals.
 * Reversed journals stay in, since both they and their reversals are in the ledger.
 */
export function dayBook(journals: readonly DayBookJournal[], filter: DayBookFilter): DayBook {
  const types = filter.types && filter.types.length > 0 ? new Set(filter.types) : null;
  const rows: DayBookRow[] = journals
    .filter((j) => j.postingDate >= filter.from && j.postingDate <= filter.to)
    .filter((j) => !filter.branchId || j.branchId === filter.branchId)
    .map((j) => ({
      ...j,
      voucherType: voucherType(j),
      voucherNumber: j.source && j.source.type !== 'fiscalYear' ? j.source.number : j.number,
    }))
    .filter((r) => !types || types.has(r.voucherType))
    .sort(
      (a, b) =>
        a.postingDate.localeCompare(b.postingDate) ||
        a.postedAtMs - b.postedAtMs ||
        a.number.localeCompare(b.number, 'en', { numeric: true }),
    );

  const counts = new Map<VoucherType, DayBookTypeTotal>();
  let totalDebit = 0n;
  let totalCredit = 0n;
  for (const r of rows) {
    totalDebit += BigInt(r.totalDebit);
    totalCredit += BigInt(r.totalCredit);
    const t = counts.get(r.voucherType) ?? { type: r.voucherType, count: 0, amount: 0n };
    t.count += 1;
    t.amount += BigInt(r.totalDebit);
    counts.set(r.voucherType, t);
  }
  const byType = VOUCHER_TYPES.flatMap((t) => {
    const v = counts.get(t);
    return v ? [v] : [];
  });
  return { rows, totalDebit, totalCredit, byType };
}
