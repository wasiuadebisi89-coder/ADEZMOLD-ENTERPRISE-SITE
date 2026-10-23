import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  MoneyError,
  allocate,
  divRoundHalfAwayFromZero,
  formatMoney,
  fromStorable,
  mulRatio,
  parseMoney,
  sum,
  toDecimalString,
  toStorable,
} from './money.js';

describe('parseMoney / toDecimalString (H1)', () => {
  it.each([
    ['1,250.50', 'NGN', 125050n],
    ['0.01', 'NGN', 1n],
    ['-3', 'USD', -300n],
    ['1500', 'JPY', 1500n],
    ['1.234', 'KWD', 1234n],
  ])('parses %s %s', (input, currency, expected) => {
    expect(parseMoney(input, currency)).toBe(expected);
  });

  it('rejects more decimals than the currency allows instead of rounding', () => {
    expect(() => parseMoney('1.005', 'NGN')).toThrow(MoneyError);
    expect(() => parseMoney('1.5', 'JPY')).toThrow(MoneyError);
  });

  it('rejects malformed input and unknown currencies', () => {
    for (const bad of ['', 'abc', '1.2.3', '1e5', '--1', '₦100']) {
      expect(() => parseMoney(bad, 'NGN')).toThrow(MoneyError);
    }
    expect(() => parseMoney('1', 'XXX')).toThrow(MoneyError);
  });

  it('round-trips through the decimal string for any amount', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: -(10n ** 15n), max: 10n ** 15n }), fc.constantFrom('NGN', 'JPY', 'KWD'), (minor, ccy) => {
        expect(parseMoney(toDecimalString(minor, ccy), ccy)).toBe(minor);
      }),
    );
  });

  it('formats for display without float drift', () => {
    expect(formatMoney(125050n, 'NGN', 'en-NG')).toBe('₦1,250.50');
    expect(formatMoney(900719925474099, 'USD', 'en-US')).toBe('$9,007,199,254,740.99');
  });
});

describe('storage range', () => {
  it('rejects unsafe integers both ways', () => {
    expect(() => toStorable(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow(MoneyError);
    expect(() => fromStorable(0.1)).toThrow(MoneyError);
    expect(fromStorable(toStorable(-42n))).toBe(-42n);
  });
});

describe('rounding (H2)', () => {
  it.each([
    [5n, 2n, 3n],
    [-5n, 2n, -3n],
    [4n, 3n, 1n],
    [-4n, 3n, -1n],
    [7n, -2n, -4n],
  ])('%d / %d rounds half away from zero to %d', (n, d, expected) => {
    expect(divRoundHalfAwayFromZero(n, d)).toBe(expected);
  });

  it('applies a 7.5% rate stored with 6-decimal percent scale', () => {
    // 7.5% stored as 7_500_000 / 100_000_000
    expect(mulRatio(133333n, 7_500_000n, 100_000_000n)).toBe(10000n);
  });

  it('never deviates by more than half a unit from the exact quotient', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: -(10n ** 12n), max: 10n ** 12n }), fc.bigInt({ min: 1n, max: 10n ** 6n }), (n, d) => {
        const q = divRoundHalfAwayFromZero(n, d);
        const diff = q * d - n;
        expect((diff < 0n ? -diff : diff) * 2n <= d).toBe(true);
      }),
    );
  });
});

describe('allocate (H2)', () => {
  it('splits exactly and gives leftovers to the largest remainders', () => {
    expect(allocate(100n, [1n, 1n, 1n])).toEqual([34n, 33n, 33n]);
    expect(allocate(-100n, [1n, 1n, 1n])).toEqual([-34n, -33n, -33n]);
    expect(allocate(10n, [0n, 3n, 7n])).toEqual([0n, 3n, 7n]);
  });

  it('always sums exactly to the total', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -(10n ** 12n), max: 10n ** 12n }),
        fc.array(fc.bigInt({ min: 0n, max: 10n ** 9n }), { minLength: 1, maxLength: 50 }).filter((w) => sum(w) > 0n),
        (total, weights) => {
          expect(sum(allocate(total, weights))).toBe(total);
        },
      ),
    );
  });

  it('rejects empty, negative or all-zero weights', () => {
    expect(() => allocate(1n, [])).toThrow(MoneyError);
    expect(() => allocate(1n, [-1n, 2n])).toThrow(MoneyError);
    expect(() => allocate(1n, [0n, 0n])).toThrow(MoneyError);
  });
});
