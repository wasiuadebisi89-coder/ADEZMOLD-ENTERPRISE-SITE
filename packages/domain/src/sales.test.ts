import { describe, expect, it } from 'vitest';
import {
  SalesError,
  creditCheck,
  formatRatePercent,
  parseRatePercent,
  returnShare,
  salesLine,
} from './sales.js';

describe('tax rates', () => {
  it('parses percentages into basis points', () => {
    expect(parseRatePercent('7.5')).toBe(750);
    expect(parseRatePercent('0')).toBe(0);
    expect(parseRatePercent('12.25')).toBe(1225);
    expect(parseRatePercent(' 5 ')).toBe(500);
  });
  it('rejects bad input', () => {
    for (const bad of ['', '-1', '7.555', 'abc', '1e2', '100001']) {
      expect(() => parseRatePercent(bad)).toThrow(SalesError);
    }
  });
  it('formats basis points back', () => {
    expect(formatRatePercent(750)).toBe('7.5');
    expect(formatRatePercent(1225)).toBe('12.25');
    expect(formatRatePercent(500)).toBe('5');
    expect(formatRatePercent(5)).toBe('0.05');
  });
});

describe('sales lines', () => {
  const base = { discountMinor: 0n, rateBp: 0, pricesIncludeTax: false };

  it('multiplies quantity by price and rounds to the minor unit', () => {
    // 2.5 bags at 1,000.01 = 2,500.025 → 2,500.03
    const l = salesLine({ ...base, qtyMilli: 2500n, unitPriceMinor: 100001n });
    expect(l).toEqual({
      amountMinor: 250003n,
      netMinor: 250003n,
      taxMinor: 0n,
      grossMinor: 250003n,
    });
  });

  it('adds tax to exclusive prices, per line, after discount', () => {
    // 3 × 1,000.00 − 100.00 discount = 2,900.00; 7.5% = 217.50
    const l = salesLine({
      ...base,
      qtyMilli: 3000n,
      unitPriceMinor: 100000n,
      discountMinor: 10000n,
      rateBp: 750,
    });
    expect(l).toEqual({
      amountMinor: 300000n,
      netMinor: 290000n,
      taxMinor: 21750n,
      grossMinor: 311750n,
    });
  });

  it('rounds tax half away from zero', () => {
    // 0.07 × 7.5% = 0.00525 → 0.01
    const l = salesLine({ ...base, qtyMilli: 1000n, unitPriceMinor: 7n, rateBp: 750 });
    expect(l.taxMinor).toBe(1n);
  });

  it('takes tax out of inclusive prices', () => {
    // 1,075.00 including 7.5% → 1,000.00 + 75.00
    const l = salesLine({
      ...base,
      qtyMilli: 1000n,
      unitPriceMinor: 107500n,
      rateBp: 750,
      pricesIncludeTax: true,
    });
    expect(l).toEqual({
      amountMinor: 107500n,
      netMinor: 100000n,
      taxMinor: 7500n,
      grossMinor: 107500n,
    });
  });

  it('keeps net + tax equal to gross when rounding', () => {
    for (const price of [1n, 99n, 12345n, 100001n]) {
      for (const inclusive of [true, false]) {
        const l = salesLine({
          ...base,
          qtyMilli: 1333n,
          unitPriceMinor: price,
          rateBp: 750,
          pricesIncludeTax: inclusive,
        });
        expect(l.netMinor + l.taxMinor).toBe(l.grossMinor);
      }
    }
  });

  it('rejects discounts beyond the line and negative values', () => {
    expect(() =>
      salesLine({ ...base, qtyMilli: 1000n, unitPriceMinor: 100n, discountMinor: 101n }),
    ).toThrow(/more than the line/);
    expect(() =>
      salesLine({ ...base, qtyMilli: 1000n, unitPriceMinor: 100n, discountMinor: -1n }),
    ).toThrow(SalesError);
    expect(() => salesLine({ ...base, qtyMilli: 1000n, unitPriceMinor: -1n })).toThrow(SalesError);
  });
});

describe('credit check', () => {
  it('passes sales paid in full whatever the limit', () => {
    expect(creditCheck(500n, 0n, 0n, 0n).over).toBe(false);
  });
  it('treats a zero limit as cash only', () => {
    expect(creditCheck(0n, 0n, 0n, 1n).over).toBe(true);
  });
  it('compares balance plus the new credit, less advances, with the limit', () => {
    expect(creditCheck(600n, 0n, 1000n, 400n)).toEqual({
      exposureMinor: 1000n,
      limitMinor: 1000n,
      over: false,
    });
    expect(creditCheck(600n, 0n, 1000n, 401n).over).toBe(true);
    expect(creditCheck(600n, 100n, 1000n, 500n).over).toBe(false);
  });
});

describe('return share', () => {
  it('takes the share of the line for the quantity returned', () => {
    // 3 sold for 1,000.00; one returned
    expect(returnShare(100_000n, 0n, 3000n, 0n, 1000n)).toBe(33_333n);
  });
  it('adds up exactly to the line over several returns', () => {
    const first = returnShare(100_000n, 0n, 3000n, 0n, 1000n);
    const second = returnShare(100_000n, first, 3000n, 1000n, 1000n);
    const third = returnShare(100_000n, first + second, 3000n, 2000n, 1000n);
    expect([first, second, third]).toEqual([33_333n, 33_334n, 33_333n]);
    expect(first + second + third).toBe(100_000n);
  });
  it('refuses more than was sold and not yet returned, and zero', () => {
    expect(() => returnShare(100n, 0n, 2000n, 1500n, 1000n)).toThrow(SalesError);
    expect(() => returnShare(100n, 0n, 2000n, 0n, 0n)).toThrow(SalesError);
  });
});
