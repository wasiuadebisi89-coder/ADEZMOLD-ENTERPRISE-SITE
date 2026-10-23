/**
 * Double-entry rules shared by every posting service (docs/bms/ACCOUNTING_POLICIES.md §3).
 * Amounts are integer minor units as bigint; storage conversion happens at the edges.
 */

export const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/**
 * Subtypes tell posting services which account plays which role. `general` is any account
 * without a special role.
 */
export const ACCOUNT_SUBTYPES = [
  'general',
  'cash',
  'bank',
  'receivable',
  'payable',
  'inventory',
  'wip',
  'grni',
  'inputTax',
  'outputTax',
  'supplierAdvance',
  'customerAdvance',
  'fixedAsset',
  'accumDepreciation',
  'retainedEarnings',
  'openingBalanceEquity',
  'revenue',
  'serviceRevenue',
  'cogs',
  'directServiceCost',
  'inventoryAdjustment',
  'purchasePriceVariance',
  'depreciation',
] as const;
export type AccountSubtype = (typeof ACCOUNT_SUBTYPES)[number];

/** Which subtypes belong to which type. A subtype outside its type is rejected. */
export const SUBTYPES_BY_TYPE: Readonly<Record<AccountType, readonly AccountSubtype[]>> = {
  asset: [
    'general',
    'cash',
    'bank',
    'receivable',
    'inventory',
    'wip',
    'inputTax',
    'supplierAdvance',
    'fixedAsset',
    'accumDepreciation',
  ],
  liability: ['general', 'payable', 'grni', 'outputTax', 'customerAdvance'],
  equity: ['general', 'retainedEarnings', 'openingBalanceEquity'],
  income: ['general', 'revenue', 'serviceRevenue'],
  expense: [
    'general',
    'cogs',
    'directServiceCost',
    'inventoryAdjustment',
    'purchasePriceVariance',
    'depreciation',
  ],
};

/**
 * Subtypes whose balance must equal a subledger. They only accept postings from their own
 * module, never from manual journals or the general opening-balance journal.
 */
export const CONTROL_SUBTYPES: readonly AccountSubtype[] = [
  'receivable',
  'payable',
  'inventory',
  'wip',
  'grni',
];

export function isControlSubtype(subtype: AccountSubtype): boolean {
  return CONTROL_SUBTYPES.includes(subtype);
}

export function normalBalance(type: AccountType): 'debit' | 'credit' {
  return type === 'asset' || type === 'expense' ? 'debit' : 'credit';
}

export function subtypeAllowed(type: AccountType, subtype: AccountSubtype): boolean {
  return SUBTYPES_BY_TYPE[type].includes(subtype);
}

/** Account codes: up to 6 digits, optionally followed by a dot or dash and up to 6 more. */
export const ACCOUNT_CODE = /^[0-9]{1,6}([.-][0-9]{1,6})?$/;

export interface LedgerAccount {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  subtype: AccountSubtype;
  isPostable: boolean;
  isControl: boolean;
  status: 'active' | 'inactive';
}

export interface JournalLine {
  accountId: string;
  debit: bigint;
  credit: bigint;
  memo?: string | undefined;
}

/** Who is posting. Manual and opening-balance journals may not touch control accounts. */
/** `closing` is the year-end journal that moves income and expenses into retained earnings. */
export type JournalOrigin = 'manual' | 'opening_balance' | 'reversal' | 'system' | 'closing';

export const MAX_JOURNAL_LINES = 200;

export class LedgerError extends Error {
  override name = 'LedgerError';
  constructor(
    public readonly code:
      | 'too_few_lines'
      | 'too_many_lines'
      | 'line_amount_invalid'
      | 'unbalanced'
      | 'zero_journal'
      | 'account_not_found'
      | 'account_not_postable'
      | 'account_inactive'
      | 'control_account',
    message: string,
    public readonly lineNo?: number,
  ) {
    super(message);
  }
}

export interface JournalTotals {
  debit: bigint;
  credit: bigint;
}

/**
 * Validates a journal before it is written. Every posting service calls this inside its
 * transaction with freshly read accounts.
 */
export function assertValidJournal(
  lines: readonly JournalLine[],
  accounts: ReadonlyMap<string, LedgerAccount>,
  origin: JournalOrigin,
): JournalTotals {
  if (lines.length < 2)
    throw new LedgerError('too_few_lines', 'A journal needs at least two lines');
  if (lines.length > MAX_JOURNAL_LINES) {
    throw new LedgerError(
      'too_many_lines',
      `A journal can have at most ${MAX_JOURNAL_LINES} lines`,
    );
  }
  let debit = 0n;
  let credit = 0n;
  lines.forEach((line, i) => {
    const lineNo = i + 1;
    const oneSided =
      (line.debit > 0n && line.credit === 0n) || (line.credit > 0n && line.debit === 0n);
    if (!oneSided) {
      throw new LedgerError(
        'line_amount_invalid',
        `Line ${lineNo}: enter a debit or a credit greater than zero, not both`,
        lineNo,
      );
    }
    const account = accounts.get(line.accountId);
    if (!account)
      throw new LedgerError('account_not_found', `Line ${lineNo}: unknown account`, lineNo);
    if (!account.isPostable) {
      throw new LedgerError(
        'account_not_postable',
        `Line ${lineNo}: ${account.code} ${account.name} is a heading and cannot be posted to`,
        lineNo,
      );
    }
    if (account.status !== 'active') {
      throw new LedgerError(
        'account_inactive',
        `Line ${lineNo}: ${account.code} ${account.name} is inactive`,
        lineNo,
      );
    }
    if (account.isControl && (origin === 'manual' || origin === 'opening_balance')) {
      throw new LedgerError(
        'control_account',
        `Line ${lineNo}: ${account.code} ${account.name} is a control account and only accepts postings from its own module`,
        lineNo,
      );
    }
    debit += line.debit;
    credit += line.credit;
  });
  if (debit !== credit) {
    throw new LedgerError('unbalanced', 'Total debits must equal total credits');
  }
  if (debit === 0n) throw new LedgerError('zero_journal', 'A journal cannot total zero');
  return { debit, credit };
}

/** Mirror lines for a reversal: every debit becomes a credit and vice versa. */
export function reverseLines(lines: readonly JournalLine[]): JournalLine[] {
  return lines.map((l) => ({
    accountId: l.accountId,
    debit: l.credit,
    credit: l.debit,
    memo: l.memo,
  }));
}

/**
 * The balancing line for an opening-balance journal: whatever difference remains between
 * debits and credits goes to the opening balance equity account (ACCOUNTING_POLICIES §12).
 * Returns null when the entered lines already balance.
 */
export function openingBalanceDifference(
  lines: readonly Pick<JournalLine, 'debit' | 'credit'>[],
  equityAccountId: string,
): JournalLine | null {
  let net = 0n;
  for (const l of lines) net += l.debit - l.credit;
  if (net === 0n) return null;
  return net > 0n
    ? { accountId: equityAccountId, debit: 0n, credit: net, memo: 'Opening balance difference' }
    : { accountId: equityAccountId, debit: -net, credit: 0n, memo: 'Opening balance difference' };
}

export interface TrialBalanceInput {
  account: Pick<LedgerAccount, 'id' | 'code' | 'name' | 'type'>;
  debit: bigint;
  credit: bigint;
}

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  /** Net balance shown on its natural side; exactly one of the two is non-zero (or both zero). */
  debit: bigint;
  credit: bigint;
}

export interface TrialBalance {
  rows: TrialBalanceRow[];
  totalDebit: bigint;
  totalCredit: bigint;
  balanced: boolean;
}

/** Nets each account's debits and credits and totals them. Zero-balance accounts are left out. */
export function trialBalance(inputs: readonly TrialBalanceInput[]): TrialBalance {
  const rows: TrialBalanceRow[] = [];
  let totalDebit = 0n;
  let totalCredit = 0n;
  for (const { account, debit, credit } of inputs) {
    const net = debit - credit;
    if (net === 0n) continue;
    const row: TrialBalanceRow = {
      accountId: account.id,
      code: account.code,
      name: account.name,
      type: account.type,
      debit: net > 0n ? net : 0n,
      credit: net < 0n ? -net : 0n,
    };
    totalDebit += row.debit;
    totalCredit += row.credit;
    rows.push(row);
  }
  rows.sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));
  return { rows, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
}
