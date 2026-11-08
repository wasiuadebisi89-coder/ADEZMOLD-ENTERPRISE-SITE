import { describe, expect, it, vi } from 'vitest';

vi.mock('./firebase', () => ({ db: {} }));
const {
  journalSourcePath,
  maskAccountNumber,
  moneyAccountLabel,
  moneyAccounts,
  postableForJournals,
  sortChart,
  suggestBankCode,
  tryParseMoney,
} = await import('./ledger');
const { lineTotals } = await import('../components/JournalLines');

describe('sortChart', () => {
  it('lists each heading followed by its children, by code, with depth', () => {
    const rows = sortChart([
      { id: 'b', code: '1120', parentId: 'h' },
      { id: 'x', code: '2000', parentId: null },
      { id: 'a', code: '1110', parentId: 'h' },
      { id: 'h', code: '1100', parentId: null },
      { id: 'o', code: '9', parentId: 'missing' },
    ]);
    expect(rows.map((r) => [r.code, r.depth])).toEqual([
      ['9', 0],
      ['1100', 0],
      ['1110', 1],
      ['1120', 1],
      ['2000', 0],
    ]);
  });
});

describe('tryParseMoney', () => {
  it('reads typed amounts and rejects bad ones', () => {
    expect(tryParseMoney('', 'NGN')).toBe(0n);
    expect(tryParseMoney('1,250.5', 'NGN')).toBe(125050n);
    expect(tryParseMoney('1.234', 'NGN')).toBeNull();
    expect(tryParseMoney('-5', 'NGN')).toBeNull();
    expect(tryParseMoney('abc', 'NGN')).toBeNull();
  });
});

describe('lineTotals', () => {
  const l = (debit: string, credit: string) => ({
    key: debit + credit,
    accountId: 'a',
    debit,
    credit,
    memo: '',
  });
  it('totals both sides and flags unreadable or two-sided lines', () => {
    const t = lineTotals([l('100', ''), l('', '60.50'), l('x', ''), l('1', '1')], 'NGN');
    expect(t.debit).toBe(10000n);
    expect(t.credit).toBe(6050n);
    expect([...t.invalid]).toEqual([2, 3]);
  });
});

describe('postableForJournals', () => {
  it('leaves out headings, inactive and control accounts', () => {
    const base = {
      code: '1',
      name: 'n',
      type: 'asset' as const,
      subtype: 'general' as const,
      parentId: null,
      hasPostings: false,
    };
    const rows = postableForJournals([
      { ...base, id: 'ok', isPostable: true, isControl: false, status: 'active' },
      { ...base, id: 'heading', isPostable: false, isControl: false, status: 'active' },
      { ...base, id: 'off', isPostable: true, isControl: false, status: 'inactive' },
      { ...base, id: 'ar', isPostable: true, isControl: true, status: 'active' },
    ]);
    expect(rows.map((r) => r.id)).toEqual(['ok']);
  });
});

describe('bank accounts in pickers', () => {
  const row = (over: Record<string, unknown>) =>
    ({
      id: String(over.code),
      name: 'Account',
      type: 'asset',
      subtype: 'general',
      parentId: null,
      isPostable: true,
      isControl: false,
      status: 'active',
      hasPostings: false,
      ...over,
    }) as Parameters<typeof moneyAccounts>[0][number];

  it('offers active, postable cash and bank accounts only', () => {
    const rows = [
      row({ code: '1110', subtype: 'cash' }),
      row({ code: '1120', subtype: 'bank' }),
      row({ code: '1121', subtype: 'bank', status: 'inactive' }),
      row({ code: '1100', isPostable: false }),
      row({ code: '1200', subtype: 'receivable' }),
    ];
    expect(moneyAccounts(rows).map((a) => a.code)).toEqual(['1110', '1120']);
  });

  it('labels bank accounts with the bank and the last four digits', () => {
    expect(maskAccountNumber('0123456789')).toBe('••6789');
    expect(moneyAccountLabel({ code: '1110', name: 'Cash on hand' })).toBe('1110 · Cash on hand');
    expect(
      moneyAccountLabel({
        code: '1121',
        name: 'Operations',
        bank: {
          bankName: 'GTBank',
          accountName: 'Adezmold',
          accountNumber: '0123456789',
          currency: 'NGN',
        },
      }),
    ).toBe('1121 · Operations (GTBank ••6789)');
  });

  it('suggests the next free code after the cash and bank accounts', () => {
    expect(
      suggestBankCode([
        { code: '1110', subtype: 'cash' },
        { code: '1120', subtype: 'bank' },
        { code: '1121', subtype: 'general' },
      ]),
    ).toBe('1122');
    expect(suggestBankCode([{ code: '6700', subtype: 'general' }])).toBe('');
  });
});

describe('journalSourcePath', () => {
  const src = (type: string) => ({ id: 'j1', source: { type, id: 'd1', number: 'N-1' } });
  it('links a journal to the document behind it', () => {
    expect(journalSourcePath('c', src('salesInvoice'))).toBe('/c/c/sales/invoices/d1');
    expect(journalSourcePath('c', src('supplierPayment'))).toBe('/c/c/purchases/payments/d1');
    expect(journalSourcePath('c', src('stockAdjustment'))).toBe('/c/c/stock-adjustments/d1');
    expect(journalSourcePath('c', src('customerRefund'))).toBe('/c/c/sales/refunds/d1');
    expect(journalSourcePath('c', src('expense'))).toBe('/c/c/expenses/d1');
  });
  it('falls back to the journal itself', () => {
    expect(journalSourcePath('c', { id: 'j1', source: null })).toBe('/c/c/journals/j1');
    expect(journalSourcePath('c', src('depreciationRun'))).toBe('/c/c/journals/j1');
  });
});
