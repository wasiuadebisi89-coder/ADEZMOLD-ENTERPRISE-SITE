import { collection, query, where } from 'firebase/firestore';
import { useMemo } from 'react';
import {
  MoneyError,
  formatMoney,
  parseMoney,
  type AccountSubtype,
  type AccountType,
} from '@bms/domain';
import { db } from './firebase';
import { useCollection } from './firestore-hooks';

export interface AccountRow {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  subtype: AccountSubtype;
  parentId: string | null;
  isPostable: boolean;
  isControl: boolean;
  status: 'active' | 'inactive';
  hasPostings: boolean;
}

export interface JournalLineRow {
  lineNo: number;
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  memo: string | null;
}

export interface JournalRow {
  id: string;
  number: string;
  postingDate: string;
  periodId: string;
  branchId: string;
  origin: 'manual' | 'opening_balance' | 'reversal' | 'system' | 'closing';
  currency: string;
  memo: string;
  reference: string | null;
  lines: JournalLineRow[];
  totalDebit: number;
  totalCredit: number;
  status: 'posted' | 'reversed';
  reversesJournalId: string | null;
  reversedByJournalId: string | null;
  reversalReason: string | null;
  postedAt: { toDate(): Date };
  postedBy: string;
}

export const TYPE_LABEL: Record<AccountType, string> = {
  asset: 'Asset',
  liability: 'Liability',
  equity: 'Equity',
  income: 'Income',
  expense: 'Expense',
};

export const SUBTYPE_LABEL: Record<AccountSubtype, string> = {
  general: 'General',
  cash: 'Cash',
  bank: 'Bank',
  receivable: 'Trade receivables',
  payable: 'Trade payables',
  inventory: 'Inventory',
  grni: 'Goods received not invoiced',
  inputTax: 'Input tax',
  outputTax: 'Output tax',
  supplierAdvance: 'Supplier advances',
  customerAdvance: 'Customer advances',
  fixedAsset: 'Fixed asset',
  accumDepreciation: 'Accumulated depreciation',
  retainedEarnings: 'Retained earnings',
  openingBalanceEquity: 'Opening balance equity',
  revenue: 'Revenue',
  cogs: 'Cost of goods sold',
  inventoryAdjustment: 'Inventory adjustments',
  purchasePriceVariance: 'Purchase price variance',
  depreciation: 'Depreciation',
};

export const ORIGIN_LABEL: Record<JournalRow['origin'], string> = {
  manual: 'Manual',
  opening_balance: 'Opening balances',
  reversal: 'Reversal',
  system: 'System',
  closing: 'Year-end close',
};

export function useAccounts(companyId: string) {
  const q = useMemo(() => collection(db, `companies/${companyId}/accounts`), [companyId]);
  const result = useCollection<Omit<AccountRow, 'id'>>(q, `accounts-${companyId}`);
  const sorted = useMemo(() => sortChart(result.data), [result.data]);
  return { ...result, data: sorted };
}

/** Accounts in chart order: each heading followed by its children, by code. */
export function sortChart<T extends Pick<AccountRow, 'id' | 'code' | 'parentId'>>(
  accounts: readonly T[],
): (T & { depth: number })[] {
  const byParent = new Map<string | null, T[]>();
  const ids = new Set(accounts.map((a) => a.id));
  for (const a of accounts) {
    const parent = a.parentId && ids.has(a.parentId) ? a.parentId : null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), a]);
  }
  const out: (T & { depth: number })[] = [];
  const visit = (parent: string | null, depth: number) => {
    const children = [...(byParent.get(parent) ?? [])].sort((a, b) =>
      a.code.localeCompare(b.code, 'en', { numeric: true }),
    );
    for (const c of children) {
      out.push({ ...c, depth });
      if (depth < 10) visit(c.id, depth + 1);
    }
  };
  visit(null, 0);
  return out;
}

/** Accounts a manual or opening journal may use. */
export function postableForJournals(accounts: readonly AccountRow[]): AccountRow[] {
  return accounts.filter((a) => a.isPostable && a.status === 'active' && !a.isControl);
}

/** Parses an amount typed by the user; empty is zero, invalid is null. */
export function tryParseMoney(value: string, currency: string): bigint | null {
  if (value.trim() === '') return 0n;
  try {
    const v = parseMoney(value, currency);
    return v < 0n ? null : v;
  } catch (e) {
    if (e instanceof MoneyError) return null;
    throw e;
  }
}

export function money(minor: bigint | number, currency: string): string {
  return formatMoney(minor, currency);
}

export function useMyBackdateApprovals(companyId: string, uid: string | undefined) {
  const q = useMemo(
    () =>
      uid
        ? query(
            collection(db, `companies/${companyId}/approvalRequests`),
            where('requestedBy', '==', uid),
            where('action', '==', 'ledger.backdate'),
            where('status', '==', 'approved'),
          )
        : null,
    [companyId, uid],
  );
  return useCollection<{ target: { postingDate: string }; reason: string }>(
    q,
    `backdate-approvals-${companyId}-${uid}`,
  );
}
