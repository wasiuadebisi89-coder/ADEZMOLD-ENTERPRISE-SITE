/**
 * Money is represented as an integer number of minor units (e.g. kobo, cents).
 * All arithmetic is done in bigint; values are range-checked before they leave
 * the domain layer so they can be stored as Firestore integers.
 * See docs/bms/adr/0003-money-as-integer-minor-units.md.
 */

export interface CurrencyInfo {
  code: string;
  /** Number of minor-unit decimals (NGN 2, JPY 0, KWD 3). */
  decimals: number;
}

export const CURRENCIES: Readonly<Record<string, CurrencyInfo>> = Object.freeze({
  NGN: { code: 'NGN', decimals: 2 },
  USD: { code: 'USD', decimals: 2 },
  GBP: { code: 'GBP', decimals: 2 },
  EUR: { code: 'EUR', decimals: 2 },
  GHS: { code: 'GHS', decimals: 2 },
  KES: { code: 'KES', decimals: 2 },
  ZAR: { code: 'ZAR', decimals: 2 },
  XOF: { code: 'XOF', decimals: 0 },
  JPY: { code: 'JPY', decimals: 0 },
  KWD: { code: 'KWD', decimals: 3 },
});

export const SUPPORTED_CURRENCY_CODES = Object.keys(CURRENCIES) as [string, ...string[]];

export function currencyInfo(code: string): CurrencyInfo {
  const info = CURRENCIES[code];
  if (!info) throw new MoneyError(`Unsupported currency: ${code}`);
  return info;
}

export class MoneyError extends Error {
  override name = 'MoneyError';
}

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/** Converts a bigint amount of minor units to a storable number, rejecting overflow. */
export function toStorable(minor: bigint): number {
  if (minor > MAX_SAFE || minor < -MAX_SAFE) {
    throw new MoneyError('Amount exceeds the supported range');
  }
  return Number(minor);
}

/** Reads a stored minor-unit amount, rejecting anything that is not a safe integer. */
export function fromStorable(value: number): bigint {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`Stored amount is not a safe integer: ${value}`);
  }
  return BigInt(value);
}

/**
 * Parses a decimal string such as "1,250.50" or "-3" into minor units.
 * Rejects more fractional digits than the currency allows instead of silently rounding.
 */
export function parseMoney(input: string, currency: string): bigint {
  const { decimals } = currencyInfo(currency);
  const cleaned = input.trim().replace(/,/g, '');
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(cleaned);
  if (!match) throw new MoneyError(`Invalid amount: "${input}"`);
  const [, sign, whole = '0', frac = ''] = match;
  if (frac.length > decimals) {
    throw new MoneyError(`Amount "${input}" has more than ${decimals} decimal places`);
  }
  const minor = BigInt(whole + frac.padEnd(decimals, '0'));
  return sign ? -minor : minor;
}

/** Formats minor units as a plain decimal string (no grouping, no symbol). */
export function toDecimalString(minor: bigint, currency: string): string {
  const { decimals } = currencyInfo(currency);
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const digits = abs.toString().padStart(decimals + 1, '0');
  const whole = decimals === 0 ? digits : digits.slice(0, -decimals);
  const frac = decimals === 0 ? '' : '.' + digits.slice(-decimals);
  return (negative ? '-' : '') + whole + frac;
}

/** Locale-aware display formatting. Uses string input to Intl so no float conversion occurs. */
export function formatMoney(minor: bigint | number, currency: string, locale = 'en-NG'): string {
  const value = typeof minor === 'number' ? fromStorable(minor) : minor;
  const { decimals } = currencyInfo(currency);
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  // Intl accepts decimal strings (ES2023 Intl.NumberFormat v3), avoiding float rounding.
  return formatter.format(toDecimalString(value, currency) as unknown as number);
}

/**
 * Divides with rounding half away from zero. Used for every rounding step in the domain.
 */
export function divRoundHalfAwayFromZero(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new MoneyError('Division by zero');
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = n / d;
  const r = n % d;
  const rounded = r * 2n >= d ? q + 1n : q;
  return negative ? -rounded : rounded;
}

/**
 * Multiplies an amount by a ratio expressed as numerator/denominator and rounds
 * half away from zero, e.g. applying a rate stored as an integer with a fixed scale.
 */
export function mulRatio(amount: bigint, numerator: bigint, denominator: bigint): bigint {
  return divRoundHalfAwayFromZero(amount * numerator, denominator);
}

/**
 * Splits `total` across `weights` so the parts sum exactly to `total`
 * (largest-remainder method; ties go to the earliest weight).
 */
export function allocate(total: bigint, weights: readonly bigint[]): bigint[] {
  if (weights.length === 0) throw new MoneyError('Cannot allocate across zero weights');
  if (weights.some((w) => w < 0n)) throw new MoneyError('Weights must not be negative');
  const weightSum = weights.reduce((a, b) => a + b, 0n);
  if (weightSum === 0n) throw new MoneyError('Weights must not all be zero');

  const negative = total < 0n;
  const abs = negative ? -total : total;
  const parts = weights.map((w) => (abs * w) / weightSum);
  const remainders = weights.map((w, i) => ({ i, r: (abs * w) % weightSum }));
  let leftover = abs - parts.reduce((a, b) => a + b, 0n);
  remainders.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (const { i } of remainders) {
    if (leftover === 0n) break;
    parts[i] = (parts[i] ?? 0n) + 1n;
    leftover -= 1n;
  }
  return negative ? parts.map((p) => -p) : parts;
}

export function sum(values: readonly bigint[]): bigint {
  return values.reduce((a, b) => a + b, 0n);
}
