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
  /** The bank's details, on a registered company bank account. */
  bank?: BankDetails | null;
}

export interface BankDetails {
  bankName: string;
  accountName: string;
  accountNumber: string;
  currency: string;
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
  source?: { type: string; id: string; number: string } | null;
  projectId?: string | null;
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
  wip: 'Work in progress',
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
  serviceRevenue: 'Service revenue',
  cogs: 'Cost of goods sold',
  directServiceCost: 'Direct service costs',
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

/** Cash and bank accounts money can be paid from or into: active and postable. */
export function moneyAccounts<T extends AccountRow>(accounts: readonly T[]): T[] {
  return accounts.filter(
    (a) => a.status === 'active' && a.isPostable && (a.subtype === 'cash' || a.subtype === 'bank'),
  );
}

/** Shows the last four characters of an account number, e.g. "••6789". */
export function maskAccountNumber(accountNumber: string): string {
  return `••${accountNumber.slice(-4)}`;
}

/** How a cash or bank account reads in a picker: "1121 · Operations (GTBank ••6789)". */
export function moneyAccountLabel(a: Pick<AccountRow, 'code' | 'name' | 'bank'>): string {
  const label = `${a.code} · ${a.name}`;
  return a.bank
    ? `${label} (${a.bank.bankName} ${maskAccountNumber(a.bank.accountNumber)})`
    : label;
}

/**
 * The next free code after the company's cash and bank accounts, e.g. 1121 after 1120, so a
 * new bank account lands beside the others in the chart. Empty when there is no obvious one.
 */
export function suggestBankCode(accounts: readonly Pick<AccountRow, 'code' | 'subtype'>[]): string {
  const taken = new Set(accounts.map((a) => a.code));
  const money = accounts
    .filter((a) => (a.subtype === 'bank' || a.subtype === 'cash') && /^\d+$/.test(a.code))
    .map((a) => Number(a.code));
  if (money.length === 0) return '';
  for (let n = Math.max(...money) + 1; n < Math.max(...money) + 100; n++) {
    if (!taken.has(String(n))) return String(n);
  }
  return '';
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

/** Where the document behind a journal lives in the app; the journal itself when it has none. */
export function journalSourcePath(companyId: string, j: Pick<JournalRow, 'id' | 'source'>): string {
  const base = `/c/${companyId}`;
  const s = j.source;
  switch (s?.type) {
    case 'salesInvoice':
      return `${base}/sales/invoices/${s.id}`;
    case 'customerReceipt':
      return `${base}/sales/receipts/${s.id}`;
    case 'creditNote':
      return `${base}/sales/returns/${s.id}`;
    case 'customerRefund':
      return `${base}/sales/refunds/${s.id}`;
    case 'goodsReceipt':
      return `${base}/purchases/receipts/${s.id}`;
    case 'purchaseInvoice':
      return `${base}/purchases/invoices/${s.id}`;
    case 'supplierPayment':
      return `${base}/purchases/payments/${s.id}`;
    case 'supplierReturn':
      return `${base}/purchases/returns/${s.id}`;
    case 'stockAdjustment':
      return `${base}/stock-adjustments/${s.id}`;
    case 'productionOrder':
      return `${base}/production/${s.id}`;
    case 'fixedAsset':
      return `${base}/fixed-assets/${s.id}`;
    default:
      return `${base}/journals/${j.id}`;
  }
}
