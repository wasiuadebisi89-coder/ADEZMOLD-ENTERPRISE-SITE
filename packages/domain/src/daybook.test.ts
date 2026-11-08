import { describe, expect, it } from 'vitest';
import { dayBook, voucherType, type DayBookJournal } from './daybook.js';

let seq = 0;
const journal = (over: Partial<DayBookJournal>): DayBookJournal => {
  seq += 1;
  return {
    id: `j${seq}`,
    number: `JV-${String(seq).padStart(4, '0')}`,
    postingDate: '2026-11-08',
    origin: 'system',
    memo: '',
    branchId: 'main',
    status: 'posted',
    totalDebit: 1_000,
    totalCredit: 1_000,
    lines: [],
    source: null,
    postedAtMs: seq * 1000,
    ...over,
  };
};

describe('voucherType', () => {
  it('names a voucher from its source document', () => {
    expect(
      voucherType({ origin: 'system', source: { type: 'salesInvoice', id: 'a', number: 'SI-1' } }),
    ).toBe('sales');
    expect(
      voucherType({
        origin: 'system',
        source: { type: 'supplierPayment', id: 'a', number: 'PAY-1' },
      }),
    ).toBe('payment');
    expect(
      voucherType({ origin: 'system', source: { type: 'creditNote', id: 'a', number: 'CN-1' } }),
    ).toBe('salesReturn');
    expect(
      voucherType({
        origin: 'system',
        source: { type: 'stockAdjustment', id: 'a', number: 'ADJ-1' },
      }),
    ).toBe('stockAdjustment');
    expect(
      voucherType({ origin: 'system', source: { type: 'expense', id: 'a', number: 'EXP-1' } }),
    ).toBe('expense');
    expect(
      voucherType({ origin: 'system', source: { type: 'somethingNew', id: 'a', number: 'X' } }),
    ).toBe('other');
  });

  it('names manual, opening, reversal and closing journals from their origin', () => {
    expect(voucherType({ origin: 'manual', source: null })).toBe('journal');
    expect(voucherType({ origin: 'opening_balance', source: null })).toBe('openingBalance');
    expect(voucherType({ origin: 'reversal', source: null })).toBe('reversal');
    expect(
      voucherType({ origin: 'closing', source: { type: 'fiscalYear', id: 'fy', number: 'fy' } }),
    ).toBe('yearEnd');
  });
});

describe('dayBook', () => {
  const sale = journal({
    postingDate: '2026-11-08',
    postedAtMs: 5_000,
    source: { type: 'salesInvoice', id: 's1', number: 'SI-0001' },
    totalDebit: 5_000,
    totalCredit: 5_000,
  });
  const payment = journal({
    postingDate: '2026-11-07',
    postedAtMs: 9_000,
    source: { type: 'supplierPayment', id: 'p1', number: 'PAY-0001' },
    totalDebit: 2_000,
    totalCredit: 2_000,
  });
  const manual = journal({ postingDate: '2026-11-08', postedAtMs: 1_000, origin: 'manual' });
  const old = journal({ postingDate: '2026-10-01', origin: 'manual' });
  const otherBranch = journal({ postingDate: '2026-11-08', origin: 'manual', branchId: 'b2' });
  const all = [sale, payment, manual, old, otherBranch];

  it('lists the range oldest first, ordering a day by the time posted', () => {
    const book = dayBook(all, { from: '2026-11-07', to: '2026-11-08' });
    expect(book.rows.map((r) => r.id)).toEqual([payment.id, manual.id, sale.id, otherBranch.id]);
    expect(book.totalDebit).toBe(9_000n);
    expect(book.totalCredit).toBe(9_000n);
  });

  it('shows the source document number as the voucher number', () => {
    const book = dayBook(all, { from: '2026-11-08', to: '2026-11-08' });
    expect(book.rows.find((r) => r.id === sale.id)?.voucherNumber).toBe('SI-0001');
    expect(book.rows.find((r) => r.id === manual.id)?.voucherNumber).toBe(manual.number);
  });

  it('filters by voucher type and branch and totals by type', () => {
    const sales = dayBook(all, { from: '2026-11-01', to: '2026-11-30', types: ['sales'] });
    expect(sales.rows.map((r) => r.id)).toEqual([sale.id]);
    expect(sales.totalDebit).toBe(5_000n);

    const main = dayBook(all, { from: '2026-11-01', to: '2026-11-30', branchId: 'main' });
    expect(main.rows.map((r) => r.id)).not.toContain(otherBranch.id);
    expect(main.byType).toEqual([
      { type: 'sales', count: 1, amount: 5_000n },
      { type: 'payment', count: 1, amount: 2_000n },
      { type: 'journal', count: 1, amount: 1_000n },
    ]);
  });

  it('is empty for a day with no postings', () => {
    const book = dayBook(all, { from: '2026-11-09', to: '2026-11-09' });
    expect(book.rows).toEqual([]);
    expect(book.totalDebit).toBe(0n);
    expect(book.byType).toEqual([]);
  });
});
