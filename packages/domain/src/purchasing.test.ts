import { describe, expect, it } from 'vitest';
import {
  PurchasingError,
  allocateLandedCost,
  assertAllocations,
  clearingValue,
  splitPriceDifference,
} from './purchasing.js';

const line = (qty: bigint, value: bigint, clearedQty = 0n, clearedValue = 0n) => ({
  qtyMilli: qty,
  valueMinor: value,
  clearedQtyMilli: clearedQty,
  clearedValueMinor: clearedValue,
});

describe('clearingValue', () => {
  it('releases proportional value and the exact remainder at the end', () => {
    const l = line(3000n, 1000n);
    const a = clearingValue(l, 1000n);
    expect(a).toBe(333n);
    const b = clearingValue(line(3000n, 1000n, 1000n, a), 1000n);
    expect(b).toBe(334n);
    const c = clearingValue(line(3000n, 1000n, 2000n, a + b), 1000n);
    expect(a + b + c).toBe(1000n);
  });

  it('never releases more than the value across many small clearings', () => {
    // 3 over 5 units: a per-unit rounding would release 4.
    let state = line(5000n, 3n);
    let released = 0n;
    for (let i = 0; i < 5; i++) {
      const v = clearingValue(state, 1000n);
      expect(v).toBeGreaterThanOrEqual(0n);
      released += v;
      state = line(5000n, 3n, state.clearedQtyMilli + 1000n, released);
      expect(released).toBeLessThanOrEqual(3n);
    }
    expect(released).toBe(3n);
  });

  it('refuses clearing more than remains', () => {
    expect(() => clearingValue(line(2000n, 100n, 1500n, 75n), 1000n)).toThrow(PurchasingError);
    expect(() => clearingValue(line(2000n, 100n), 0n)).toThrow(PurchasingError);
  });
});

describe('splitPriceDifference', () => {
  it('puts it all on stock when everything is on hand', () => {
    expect(splitPriceDifference(500n, 10_000n, 25_000n, 9_000n)).toEqual({
      inventory: 500n,
      cogs: 0n,
    });
  });

  it('splits by the share still on hand', () => {
    expect(splitPriceDifference(1000n, 10_000n, 4_000n, 9_000n)).toEqual({
      inventory: 400n,
      cogs: 600n,
    });
    expect(splitPriceDifference(-1000n, 10_000n, 0n, 9_000n)).toEqual({
      inventory: 0n,
      cogs: -1000n,
    });
  });

  it('never takes stock value below zero', () => {
    expect(splitPriceDifference(-5000n, 10_000n, 10_000n, 3_000n)).toEqual({
      inventory: -3000n,
      cogs: -2000n,
    });
  });
});

describe('allocateLandedCost', () => {
  const lines = [
    { qtyMilli: 1000n, valueMinor: 300n },
    { qtyMilli: 3000n, valueMinor: 100n },
  ];
  it('spreads by value or quantity, summing exactly', () => {
    expect(allocateLandedCost(100n, 'value', lines)).toEqual([75n, 25n]);
    expect(allocateLandedCost(101n, 'quantity', lines)).toEqual([25n, 76n]);
  });
  it('refuses a zero basis or amount', () => {
    expect(() => allocateLandedCost(0n, 'value', lines)).toThrow(PurchasingError);
    expect(() => allocateLandedCost(10n, 'value', [{ qtyMilli: 1000n, valueMinor: 0n }])).toThrow(
      PurchasingError,
    );
  });
});

describe('assertAllocations', () => {
  it('sums valid allocations and refuses overpaying a document or the payment', () => {
    expect(
      assertAllocations(500n, [
        { amountMinor: 200n, outstandingMinor: 200n, label: 'PI-1' },
        { amountMinor: 100n, outstandingMinor: 400n, label: 'PI-2' },
      ]),
    ).toBe(300n);
    expect(() =>
      assertAllocations(500n, [{ amountMinor: 300n, outstandingMinor: 200n, label: 'PI-1' }]),
    ).toThrow(/outstanding/);
    expect(() =>
      assertAllocations(100n, [{ amountMinor: 200n, outstandingMinor: 200n, label: 'PI-1' }]),
    ).toThrow(/exceed/);
  });
});
