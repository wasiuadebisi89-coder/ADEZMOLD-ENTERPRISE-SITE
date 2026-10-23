import { describe, expect, it } from 'vitest';
import type { AccountSubtype, AccountType } from './ledger.js';
import {
  ageing,
  ageingBucket,
  balanceSheet,
  daysOverdue,
  fiscalYearStart,
  profitAndLoss,
  type AccountMovement,
} from './reports.js';

const row = (
  code: string,
  type: AccountType,
  subtype: AccountSubtype,
  debit: bigint,
  credit = 0n,
): AccountMovement => ({
  account: { id: code, code, name: `Account ${code}`, type, subtype },
  debit,
  credit,
});

// A small set of books that balances: owner put in 1,000; bought stock 400; sold half for 500.
const books = [
  row('1110', 'asset', 'cash', 1_500n, 400n),
  row('1300', 'asset', 'inventory', 400n, 200n),
  row('1510', 'asset', 'fixedAsset', 300n),
  row('1590', 'asset', 'accumDepreciation', 0n, 30n),
  row('2100', 'liability', 'payable', 0n, 300n),
  row('3100', 'equity', 'general', 0n, 1_000n),
  row('4100', 'income', 'revenue', 0n, 500n),
  row('4900', 'income', 'general', 0n, 0n),
  row('5100', 'expense', 'cogs', 200n),
  row('6600', 'expense', 'depreciation', 30n),
];

describe('profit and loss', () => {
  it('arranges revenue, cost of sales, other income and expenses', () => {
    const pl = profitAndLoss(books);
    expect(pl.revenue.total).toBe(500n);
    expect(pl.costOfSales.total).toBe(200n);
    expect(pl.grossProfit).toBe(300n);
    expect(pl.otherIncome.lines).toEqual([]);
    expect(pl.expenses.lines.map((l) => l.code)).toEqual(['6600']);
    expect(pl.netProfit).toBe(270n);
  });
});

describe('balance sheet', () => {
  it('includes profit not yet closed into equity and balances', () => {
    const bs = balanceSheet(books);
    expect(bs.nonCurrentAssets.total).toBe(270n);
    expect(bs.currentAssets.total).toBe(1_300n);
    expect(bs.totalAssets).toBe(1_570n);
    expect(bs.liabilities.total).toBe(300n);
    expect(bs.equity.total).toBe(1_000n);
    expect(bs.unclosedProfit).toBe(270n);
    expect(bs.totalLiabilitiesAndEquity).toBe(1_570n);
    expect(bs.difference).toBe(0n);
  });
  it('shows a difference when the books do not balance', () => {
    expect(balanceSheet([row('1110', 'asset', 'cash', 10n)]).difference).toBe(10n);
  });
});

describe('ageing', () => {
  it('counts days past due into buckets', () => {
    expect(daysOverdue('2026-10-01', '2026-10-23')).toBe(22);
    expect(ageingBucket('2026-10-23', '2026-10-23')).toBe('current');
    expect(ageingBucket('2026-10-22', '2026-10-23')).toBe('1-30');
    expect(ageingBucket('2026-09-23', '2026-10-23')).toBe('1-30');
    expect(ageingBucket('2026-09-22', '2026-10-23')).toBe('31-60');
    expect(ageingBucket('2026-07-25', '2026-10-23')).toBe('61-90');
    expect(ageingBucket('2026-07-24', '2026-10-23')).toBe('90+');
  });
  it('groups by party and totals each bucket', () => {
    const result = ageing(
      [
        { partyId: 'b', partyName: 'Bola', dueDate: '2026-10-30', outstanding: 100n },
        { partyId: 'a', partyName: 'Ade', dueDate: '2026-08-01', outstanding: 50n },
        { partyId: 'b', partyName: 'Bola', dueDate: '2026-10-01', outstanding: 25n },
        { partyId: 'c', partyName: 'Chi', dueDate: '2026-10-01', outstanding: 0n },
      ],
      '2026-10-23',
    );
    expect(result.rows.map((r) => r.partyName)).toEqual(['Ade', 'Bola']);
    expect(result.rows[1]!.buckets).toMatchObject({ current: 100n, '1-30': 25n });
    expect(result.totals).toEqual({
      current: 100n,
      '1-30': 25n,
      '31-60': 0n,
      '61-90': 50n,
      '90+': 0n,
    });
    expect(result.total).toBe(175n);
  });
});

describe('financial year start', () => {
  it('finds the start on either side of the year end', () => {
    expect(fiscalYearStart('2026-10-23', 1)).toBe('2026-01-01');
    expect(fiscalYearStart('2026-03-10', 7)).toBe('2025-07-01');
    expect(fiscalYearStart('2026-07-01', 7)).toBe('2026-07-01');
  });
});
