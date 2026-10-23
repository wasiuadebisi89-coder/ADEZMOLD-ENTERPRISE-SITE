import { describe, expect, it, vi } from 'vitest';

vi.mock('./firebase', () => ({ db: {} }));
const { postableForJournals, sortChart, tryParseMoney } = await import('./ledger');
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
