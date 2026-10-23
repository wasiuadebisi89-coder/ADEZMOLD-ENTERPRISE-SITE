/**
 * Financial statements and ageing (Phase 7). Pure functions over account balances and open
 * invoices; the web app loads the figures and these arrange them. Amounts are minor units.
 */
import type { AccountSubtype, AccountType } from './ledger.js';

export interface ReportAccount {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  subtype: AccountSubtype;
}

export interface AccountMovement {
  account: ReportAccount;
  debit: bigint;
  credit: bigint;
}

export interface StatementLine {
  accountId: string;
  code: string;
  name: string;
  /** Shown with the section's natural sign: income and liabilities as positive credits. */
  amount: bigint;
}

export interface StatementSection {
  key: string;
  title: string;
  lines: StatementLine[];
  total: bigint;
}

const byCode = (a: StatementLine, b: StatementLine) =>
  a.code.localeCompare(b.code, 'en', { numeric: true });

function section(
  key: string,
  title: string,
  rows: readonly AccountMovement[],
  sign: 1n | -1n,
): StatementSection {
  const lines = rows
    .map((r) => ({
      accountId: r.account.id,
      code: r.account.code,
      name: r.account.name,
      amount: sign * (r.debit - r.credit),
    }))
    .filter((l) => l.amount !== 0n)
    .sort(byCode);
  return { key, title, lines, total: lines.reduce((s, l) => s + l.amount, 0n) };
}

const COST_OF_SALES: readonly AccountSubtype[] = [
  'cogs',
  'inventoryAdjustment',
  'purchasePriceVariance',
];

export interface ProfitAndLoss {
  revenue: StatementSection;
  costOfSales: StatementSection;
  grossProfit: bigint;
  otherIncome: StatementSection;
  expenses: StatementSection;
  netProfit: bigint;
}

/** Profit and loss from each account's movements over the period. */
export function profitAndLoss(movements: readonly AccountMovement[]): ProfitAndLoss {
  const income = movements.filter((m) => m.account.type === 'income');
  const expense = movements.filter((m) => m.account.type === 'expense');
  const revenue = section(
    'revenue',
    'Revenue',
    income.filter((m) => m.account.subtype === 'revenue'),
    -1n,
  );
  const otherIncome = section(
    'otherIncome',
    'Other income',
    income.filter((m) => m.account.subtype !== 'revenue'),
    -1n,
  );
  const costOfSales = section(
    'costOfSales',
    'Cost of sales',
    expense.filter((m) => COST_OF_SALES.includes(m.account.subtype)),
    1n,
  );
  const expenses = section(
    'expenses',
    'Operating expenses',
    expense.filter((m) => !COST_OF_SALES.includes(m.account.subtype)),
    1n,
  );
  const grossProfit = revenue.total - costOfSales.total;
  return {
    revenue,
    costOfSales,
    grossProfit,
    otherIncome,
    expenses,
    netProfit: grossProfit + otherIncome.total - expenses.total,
  };
}

const NON_CURRENT: readonly AccountSubtype[] = ['fixedAsset', 'accumDepreciation'];

export interface BalanceSheet {
  nonCurrentAssets: StatementSection;
  currentAssets: StatementSection;
  totalAssets: bigint;
  liabilities: StatementSection;
  equity: StatementSection;
  /** Income less expenses to date not yet closed into retained earnings by a journal. */
  unclosedProfit: bigint;
  totalEquity: bigint;
  totalLiabilitiesAndEquity: bigint;
  /** Zero when the books balance. */
  difference: bigint;
}

/** Balance sheet from each account's balance from the first posting to the as-at date. */
export function balanceSheet(balances: readonly AccountMovement[]): BalanceSheet {
  const assets = balances.filter((b) => b.account.type === 'asset');
  const nonCurrentAssets = section(
    'nonCurrentAssets',
    'Non-current assets',
    assets.filter((b) => NON_CURRENT.includes(b.account.subtype)),
    1n,
  );
  const currentAssets = section(
    'currentAssets',
    'Current assets',
    assets.filter((b) => !NON_CURRENT.includes(b.account.subtype)),
    1n,
  );
  const liabilities = section(
    'liabilities',
    'Liabilities',
    balances.filter((b) => b.account.type === 'liability'),
    -1n,
  );
  const equity = section(
    'equity',
    'Equity',
    balances.filter((b) => b.account.type === 'equity'),
    -1n,
  );
  const unclosedProfit = profitAndLoss(balances).netProfit;
  const totalAssets = nonCurrentAssets.total + currentAssets.total;
  const totalEquity = equity.total + unclosedProfit;
  const totalLiabilitiesAndEquity = liabilities.total + totalEquity;
  return {
    nonCurrentAssets,
    currentAssets,
    totalAssets,
    liabilities,
    equity,
    unclosedProfit,
    totalEquity,
    totalLiabilitiesAndEquity,
    difference: totalAssets - totalLiabilitiesAndEquity,
  };
}

export const AGEING_BUCKETS = ['current', '1-30', '31-60', '61-90', '90+'] as const;
export type AgeingBucket = (typeof AGEING_BUCKETS)[number];

export const AGEING_LABEL: Record<AgeingBucket, string> = {
  current: 'Not yet due',
  '1-30': '1–30 days',
  '31-60': '31–60 days',
  '61-90': '61–90 days',
  '90+': 'Over 90 days',
};

/** Days past the due date at the as-at date; 0 or less is not yet due. */
export function daysOverdue(dueDate: string, asAt: string): number {
  const ms = Date.parse(`${asAt}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export function ageingBucket(dueDate: string, asAt: string): AgeingBucket {
  const days = daysOverdue(dueDate, asAt);
  if (days <= 0) return 'current';
  if (days <= 30) return '1-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

export interface OpenItem {
  partyId: string;
  partyName: string;
  dueDate: string;
  outstanding: bigint;
}

export interface AgeingRow {
  partyId: string;
  partyName: string;
  buckets: Record<AgeingBucket, bigint>;
  total: bigint;
}

const emptyBuckets = (): Record<AgeingBucket, bigint> => ({
  current: 0n,
  '1-30': 0n,
  '31-60': 0n,
  '61-90': 0n,
  '90+': 0n,
});

/** Open items grouped by customer or supplier and by how overdue they are. */
export function ageing(
  items: readonly OpenItem[],
  asAt: string,
): { rows: AgeingRow[]; totals: AgeingRow['buckets']; total: bigint } {
  const rows = new Map<string, AgeingRow>();
  const totals = emptyBuckets();
  let total = 0n;
  for (const item of items) {
    if (item.outstanding === 0n) continue;
    const row = rows.get(item.partyId) ?? {
      partyId: item.partyId,
      partyName: item.partyName,
      buckets: emptyBuckets(),
      total: 0n,
    };
    const bucket = ageingBucket(item.dueDate, asAt);
    row.buckets[bucket] += item.outstanding;
    row.total += item.outstanding;
    totals[bucket] += item.outstanding;
    total += item.outstanding;
    rows.set(item.partyId, row);
  }
  return {
    rows: [...rows.values()].sort((a, b) => a.partyName.localeCompare(b.partyName)),
    totals,
    total,
  };
}

/** The first day of the financial year containing a date. */
export function fiscalYearStart(date: string, startMonth: number): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const startYear = month >= startMonth ? year : year - 1;
  return `${startYear}-${String(startMonth).padStart(2, '0')}-01`;
}
