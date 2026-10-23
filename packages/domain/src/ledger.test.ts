import { describe, expect, it } from 'vitest';
import { CHART_TEMPLATES, TRADING_TEMPLATE } from './chart.js';
import {
  ACCOUNT_CODE,
  LedgerError,
  assertValidJournal,
  isControlSubtype,
  normalBalance,
  openingBalanceDifference,
  reverseLines,
  subtypeAllowed,
  trialBalance,
  type JournalLine,
  type LedgerAccount,
} from './ledger.js';

const acct = (id: string, overrides: Partial<LedgerAccount> = {}): LedgerAccount => ({
  id,
  code: id,
  name: `Account ${id}`,
  type: 'asset',
  subtype: 'general',
  isPostable: true,
  isControl: false,
  status: 'active',
  ...overrides,
});

const accounts = new Map<string, LedgerAccount>([
  ['cash', acct('cash', { subtype: 'cash' })],
  ['rev', acct('rev', { type: 'income', subtype: 'revenue' })],
  ['heading', acct('heading', { isPostable: false })],
  ['old', acct('old', { status: 'inactive' })],
  ['ar', acct('ar', { subtype: 'receivable', isControl: true })],
]);

const line = (accountId: string, debit: bigint, credit = 0n): JournalLine => ({
  accountId,
  debit,
  credit,
});

function code(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined;
  } catch (e) {
    return e instanceof LedgerError ? e.code : 'other';
  }
}

describe('assertValidJournal', () => {
  it('accepts a balanced journal and returns totals', () => {
    expect(
      assertValidJournal([line('cash', 500n), line('rev', 0n, 500n)], accounts, 'manual'),
    ).toEqual({ debit: 500n, credit: 500n });
  });

  it('rejects journals with fewer than two lines', () => {
    expect(code(() => assertValidJournal([line('cash', 1n)], accounts, 'manual'))).toBe(
      'too_few_lines',
    );
  });

  it('rejects more than 200 lines', () => {
    const lines = Array.from({ length: 201 }, (_, i) =>
      i % 2 ? line('rev', 0n, 1n) : line('cash', 1n),
    );
    expect(code(() => assertValidJournal(lines, accounts, 'manual'))).toBe('too_many_lines');
  });

  it.each([
    ['both sides', line('cash', 5n, 5n)],
    ['neither side', line('cash', 0n, 0n)],
    ['negative debit', line('cash', -5n)],
  ])('rejects a line with %s', (_label, bad) => {
    expect(code(() => assertValidJournal([bad, line('rev', 0n, 5n)], accounts, 'manual'))).toBe(
      'line_amount_invalid',
    );
  });

  it('rejects unbalanced journals', () => {
    expect(
      code(() =>
        assertValidJournal([line('cash', 500n), line('rev', 0n, 499n)], accounts, 'manual'),
      ),
    ).toBe('unbalanced');
  });

  it('rejects unknown, heading and inactive accounts', () => {
    expect(
      code(() => assertValidJournal([line('nope', 1n), line('rev', 0n, 1n)], accounts, 'manual')),
    ).toBe('account_not_found');
    expect(
      code(() =>
        assertValidJournal([line('heading', 1n), line('rev', 0n, 1n)], accounts, 'manual'),
      ),
    ).toBe('account_not_postable');
    expect(
      code(() => assertValidJournal([line('old', 1n), line('rev', 0n, 1n)], accounts, 'manual')),
    ).toBe('account_inactive');
  });

  it('keeps control accounts out of manual and opening journals but not module postings', () => {
    const lines = [line('ar', 1n), line('rev', 0n, 1n)];
    expect(code(() => assertValidJournal(lines, accounts, 'manual'))).toBe('control_account');
    expect(code(() => assertValidJournal(lines, accounts, 'opening_balance'))).toBe(
      'control_account',
    );
    expect(code(() => assertValidJournal(lines, accounts, 'system'))).toBeUndefined();
    expect(code(() => assertValidJournal(lines, accounts, 'reversal'))).toBeUndefined();
  });

  it('reports the failing line number', () => {
    try {
      assertValidJournal([line('cash', 1n), line('old', 0n, 1n)], accounts, 'manual');
    } catch (e) {
      expect((e as LedgerError).lineNo).toBe(2);
    }
  });
});

describe('reverseLines', () => {
  it('swaps debits and credits so the pair nets to zero', () => {
    const original = [line('cash', 700n), line('rev', 0n, 700n)];
    const reversed = reverseLines(original);
    expect(reversed).toEqual([
      { accountId: 'cash', debit: 0n, credit: 700n, memo: undefined },
      { accountId: 'rev', debit: 700n, credit: 0n, memo: undefined },
    ]);
    const tb = trialBalance(
      ['cash', 'rev'].map((id) => {
        const all = [...original, ...reversed].filter((l) => l.accountId === id);
        return {
          account: { id, code: id, name: id, type: 'asset' as const },
          debit: all.reduce((s, l) => s + l.debit, 0n),
          credit: all.reduce((s, l) => s + l.credit, 0n),
        };
      }),
    );
    expect(tb.rows).toEqual([]);
  });
});

describe('openingBalanceDifference', () => {
  it('returns null when the lines balance', () => {
    expect(openingBalanceDifference([line('cash', 5n), line('rev', 0n, 5n)], 'obe')).toBeNull();
  });
  it('credits equity when debits exceed credits, and debits it otherwise', () => {
    expect(openingBalanceDifference([line('cash', 900n)], 'obe')).toMatchObject({
      accountId: 'obe',
      debit: 0n,
      credit: 900n,
    });
    expect(openingBalanceDifference([line('rev', 0n, 250n)], 'obe')).toMatchObject({
      debit: 250n,
      credit: 0n,
    });
  });
});

describe('trialBalance', () => {
  it('nets accounts onto their side, skips zero balances, sorts by code and checks totals', () => {
    const tb = trialBalance([
      {
        account: { id: 'r', code: '4100', name: 'Sales', type: 'income' },
        debit: 100n,
        credit: 1100n,
      },
      { account: { id: 'c', code: '1110', name: 'Cash', type: 'asset' }, debit: 1000n, credit: 0n },
      {
        account: { id: 'z', code: '6100', name: 'Wages', type: 'expense' },
        debit: 50n,
        credit: 50n,
      },
    ]);
    expect(tb.rows.map((r) => [r.code, r.debit, r.credit])).toEqual([
      ['1110', 1000n, 0n],
      ['4100', 0n, 1000n],
    ]);
    expect(tb).toMatchObject({ totalDebit: 1000n, totalCredit: 1000n, balanced: true });
  });

  it('flags an out-of-balance ledger', () => {
    const tb = trialBalance([
      { account: { id: 'c', code: '1', name: 'Cash', type: 'asset' }, debit: 10n, credit: 0n },
    ]);
    expect(tb.balanced).toBe(false);
  });
});

describe('account helpers', () => {
  it('knows normal balances', () => {
    expect(normalBalance('asset')).toBe('debit');
    expect(normalBalance('expense')).toBe('debit');
    expect(normalBalance('liability')).toBe('credit');
    expect(normalBalance('equity')).toBe('credit');
    expect(normalBalance('income')).toBe('credit');
  });

  it('restricts subtypes to their account type', () => {
    expect(subtypeAllowed('asset', 'cash')).toBe(true);
    expect(subtypeAllowed('liability', 'cash')).toBe(false);
    expect(subtypeAllowed('income', 'revenue')).toBe(true);
  });

  it('validates account codes', () => {
    expect(ACCOUNT_CODE.test('1110')).toBe(true);
    expect(ACCOUNT_CODE.test('1110.01')).toBe(true);
    expect(ACCOUNT_CODE.test('11a')).toBe(false);
    expect(ACCOUNT_CODE.test('')).toBe(false);
  });
});

describe('trading chart template', () => {
  const accountsByCode = new Map(TRADING_TEMPLATE.accounts.map((x) => [x.code, x]));

  it('is registered and has unique, valid codes', () => {
    expect(CHART_TEMPLATES.trading).toBe(TRADING_TEMPLATE);
    expect(accountsByCode.size).toBe(TRADING_TEMPLATE.accounts.length);
    for (const x of TRADING_TEMPLATE.accounts) expect(ACCOUNT_CODE.test(x.code)).toBe(true);
  });

  it('nests every account under a heading of the same type', () => {
    for (const x of TRADING_TEMPLATE.accounts) {
      if (!x.parentCode) {
        expect(x.isPostable).toBe(false);
        continue;
      }
      const parent = accountsByCode.get(x.parentCode);
      expect(parent?.isPostable).toBe(false);
      expect(parent?.type).toBe(x.type);
    }
  });

  it('uses subtypes valid for each type', () => {
    for (const x of TRADING_TEMPLATE.accounts) expect(subtypeAllowed(x.type, x.subtype)).toBe(true);
  });

  it('has exactly one account for each role posting services look up', () => {
    for (const subtype of [
      'cash',
      'bank',
      'receivable',
      'payable',
      'inventory',
      'grni',
      'retainedEarnings',
      'openingBalanceEquity',
      'revenue',
      'cogs',
    ] as const) {
      expect(TRADING_TEMPLATE.accounts.filter((x) => x.subtype === subtype)).toHaveLength(1);
    }
  });

  it('marks the subledger accounts as control accounts', () => {
    const control = TRADING_TEMPLATE.accounts.filter((x) => isControlSubtype(x.subtype));
    expect(control.map((x) => x.code).sort()).toEqual(['1200', '1300', '2100', '2150']);
  });
});
