import { describe, expect, it } from 'vitest';
import {
  InventoryError,
  averageCost,
  defaultIncreaseCost,
  formatQuantity,
  issueFifo,
  issueWeightedAverage,
  parseQuantity,
  parseUnitCost,
  receive,
  valueAt,
  type CostLayer,
  type StockBalance,
} from './inventory.js';

function code(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined;
  } catch (e) {
    return e instanceof InventoryError ? e.code : 'other';
  }
}

describe('quantities and costs', () => {
  it('parses quantities into milli-units within the unit precision', () => {
    expect(parseQuantity('2.5', 'kg')).toBe(2500n);
    expect(parseQuantity('1,200', 'pcs')).toBe(1_200_000n);
    expect(parseQuantity('3.000', 'pcs')).toBe(3000n);
    expect(code(() => parseQuantity('1.5', 'pcs'))).toBe('invalid_quantity');
    expect(code(() => parseQuantity('1.2345', 'kg'))).toBe('invalid_quantity');
    expect(code(() => parseQuantity('-1', 'pcs'))).toBe('invalid_quantity');
    expect(parseQuantity('-1', 'pcs', true)).toBe(-1000n);
    expect(code(() => parseQuantity('abc', 'pcs'))).toBe('invalid_quantity');
  });

  it('formats quantities', () => {
    expect(formatQuantity(2500n, 'kg')).toBe('2.5');
    expect(formatQuantity(1_200_000, 'pcs')).toBe('1,200');
    expect(formatQuantity(-500n, 'l')).toBe('-0.5');
  });

  it('parses unit costs as minor units × 10⁴, up to four extra decimals', () => {
    expect(parseUnitCost('12.34567', 'NGN')).toBe(12_345_670n);
    expect(parseUnitCost('1,250', 'NGN')).toBe(1_250_000_000n);
    expect(code(() => parseUnitCost('1.1234567', 'NGN'))).toBe('invalid_cost');
    expect(code(() => parseUnitCost('-1', 'NGN'))).toBe('invalid_cost');
  });

  it('values a quantity at a unit cost with half-away-from-zero rounding', () => {
    // 3 units at ₦0.335 = ₦1.005 → 101 kobo (100.5 rounds away from zero)
    expect(valueAt(3000n, parseUnitCost('0.335', 'NGN'))).toBe(101n);
    expect(valueAt(2500n, parseUnitCost('100', 'NGN'))).toBe(25000n);
  });
});

describe('weighted average', () => {
  it('re-averages on receipt and issues at the average', () => {
    let b: StockBalance = { qtyMilli: 0n, valueMinor: 0n };
    b = receive(b, { qtyMilli: 10_000n, valueMinor: 100_000n }); // 10 @ ₦100
    b = receive(b, { qtyMilli: 10_000n, valueMinor: 140_000n }); // 10 @ ₦140
    expect(averageCost(b)).toBe(120_000_000n); // ₦120 = 12,000 kobo × 10⁴
    const issue = issueWeightedAverage(b, 5000n);
    expect(issue.valueMinor).toBe(60_000n);
    expect(issue.balance).toEqual({ qtyMilli: 15_000n, valueMinor: 180_000n });
  });

  it('empties value exactly when quantity reaches zero', () => {
    // 3 units worth ₦1.00: thirds do not divide evenly.
    let b: StockBalance = { qtyMilli: 3000n, valueMinor: 100n };
    const issued: bigint[] = [];
    for (let i = 0; i < 3; i++) {
      const r = issueWeightedAverage(b, 1000n);
      issued.push(r.valueMinor);
      b = r.balance;
    }
    expect(b).toEqual({ qtyMilli: 0n, valueMinor: 0n });
    expect(issued.reduce((s, v) => s + v, 0n)).toBe(100n);
  });

  it('refuses to go negative', () => {
    expect(code(() => issueWeightedAverage({ qtyMilli: 1000n, valueMinor: 5n }, 1001n))).toBe(
      'insufficient_stock',
    );
    expect(code(() => issueWeightedAverage({ qtyMilli: 0n, valueMinor: 5n }, 1n))).toBe(
      'corrupt_balance',
    );
  });
});

describe('FIFO', () => {
  const layers: CostLayer[] = [
    { id: 'a', qtyRemaining: 10_000n, valueRemaining: 100_000n },
    { id: 'b', qtyRemaining: 10_000n, valueRemaining: 140_000n },
  ];
  const balance = { qtyMilli: 20_000n, valueMinor: 240_000n };

  it('consumes the oldest layers first', () => {
    const r = issueFifo(balance, layers, 15_000n);
    expect(r.valueMinor).toBe(100_000n + 70_000n);
    expect(r.layers).toEqual([
      { id: 'a', qtyRemaining: 0n, valueRemaining: 0n },
      { id: 'b', qtyRemaining: 5000n, valueRemaining: 70_000n },
    ]);
    expect(r.balance).toEqual({ qtyMilli: 5000n, valueMinor: 70_000n });
  });

  it('takes the exact remaining value from an emptied layer', () => {
    const odd: CostLayer[] = [{ id: 'a', qtyRemaining: 3000n, valueRemaining: 100n }];
    let b = { qtyMilli: 3000n, valueMinor: 100n };
    let ls = odd;
    let total = 0n;
    for (let i = 0; i < 3; i++) {
      const r = issueFifo(b, ls, 1000n);
      total += r.valueMinor;
      b = r.balance;
      ls = r.layers!;
    }
    expect(total).toBe(100n);
    expect(b).toEqual({ qtyMilli: 0n, valueMinor: 0n });
  });

  it('detects layers that disagree with the balance', () => {
    expect(code(() => issueFifo({ qtyMilli: 1n, valueMinor: 0n }, layers, 1n))).toBe(
      'corrupt_balance',
    );
  });

  it('refuses to go negative', () => {
    expect(code(() => issueFifo(balance, layers, 20_001n))).toBe('insufficient_stock');
  });
});

describe('defaultIncreaseCost', () => {
  it('uses the average cost, and needs an entered cost when nothing is on hand', () => {
    expect(defaultIncreaseCost({ qtyMilli: 2000n, valueMinor: 500n })).toBe(2_500_000n);
    expect(code(() => defaultIncreaseCost({ qtyMilli: 0n, valueMinor: 0n }))).toBe('cost_required');
  });
});
