/**
 * Sales rules (ACCOUNTING_POLICIES.md §7, §9, §10): line amounts, discounts and tax per line,
 * and the customer credit check. Pure functions on bigint minor units and milli-quantities.
 */
import { mulRatio } from './money.js';
import { QTY_SCALE } from './inventory.js';

export type SalesErrorCode =
  | 'invalid_rate'
  | 'invalid_price'
  | 'invalid_discount'
  | 'over_paid'
  | 'credit_limit_exceeded'
  | 'over_returned';

export class SalesError extends Error {
  constructor(
    readonly code: SalesErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SalesError';
  }
}

/** Tax rates are stored in basis points: 7.5% is 750. */
export const RATE_SCALE = 10_000n;
export const MAX_RATE_BP = 100_000; // 1000%, a sanity bound, not a policy

/** Parses a percentage such as "7.5" into basis points. At most two decimal places. */
export function parseRatePercent(input: string): number {
  const match = /^(\d{1,4})(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!match) {
    throw new SalesError('invalid_rate', 'Enter a rate such as 7.5, with up to two decimals');
  }
  const bp = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  if (bp > MAX_RATE_BP) throw new SalesError('invalid_rate', 'The rate is too large');
  return bp;
}

export function formatRatePercent(bp: number): string {
  const whole = Math.trunc(bp / 100);
  const frac = String(bp % 100)
    .padStart(2, '0')
    .replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : String(whole);
}

export interface SalesLineInput {
  qtyMilli: bigint;
  unitPriceMinor: bigint;
  discountMinor: bigint;
  rateBp: number;
  /** When true, the price already includes tax and the tax is taken out of it. */
  pricesIncludeTax: boolean;
}

export interface SalesLineAmounts {
  /** Quantity × price, before discount, rounded to the minor unit. */
  amountMinor: bigint;
  /** Revenue: the line after discount, without tax. */
  netMinor: bigint;
  taxMinor: bigint;
  /** What the customer pays for the line. */
  grossMinor: bigint;
}

/**
 * One sales line. Tax is computed and rounded on each line (DECISION 8): exclusive prices add
 * rate × net; inclusive prices take out gross × rate / (1 + rate). Rounding is half away from
 * zero, so the lines always add up to the document total.
 */
export function salesLine(input: SalesLineInput): SalesLineAmounts {
  if (input.unitPriceMinor < 0n) throw new SalesError('invalid_price', 'Price cannot be negative');
  if (input.rateBp < 0 || input.rateBp > MAX_RATE_BP) {
    throw new SalesError('invalid_rate', 'Invalid tax rate');
  }
  const amountMinor = mulRatio(input.unitPriceMinor, input.qtyMilli, QTY_SCALE);
  if (input.discountMinor < 0n) {
    throw new SalesError('invalid_discount', 'Discount cannot be negative');
  }
  if (input.discountMinor > amountMinor) {
    throw new SalesError('invalid_discount', 'Discount is more than the line amount');
  }
  const afterDiscount = amountMinor - input.discountMinor;
  const rate = BigInt(input.rateBp);
  if (input.pricesIncludeTax) {
    const taxMinor = mulRatio(afterDiscount, rate, RATE_SCALE + rate);
    return { amountMinor, netMinor: afterDiscount - taxMinor, taxMinor, grossMinor: afterDiscount };
  }
  const taxMinor = mulRatio(afterDiscount, rate, RATE_SCALE);
  return { amountMinor, netMinor: afterDiscount, taxMinor, grossMinor: afterDiscount + taxMinor };
}

export interface CreditCheck {
  /** What the customer would owe after the sale, less any advance they hold. */
  exposureMinor: bigint;
  limitMinor: bigint;
  over: boolean;
}

/**
 * Credit limit check (DECISION 7): a sale that leaves an amount on credit is over the limit
 * when the customer's balance, plus that amount, less their advances, exceeds the limit.
 * A limit of zero means cash only. Sales paid in full never need a check.
 */
export function creditCheck(
  balanceMinor: bigint,
  advanceMinor: bigint,
  limitMinor: bigint,
  onCreditMinor: bigint,
): CreditCheck {
  const exposureMinor = balanceMinor - advanceMinor + onCreditMinor;
  return {
    exposureMinor,
    limitMinor,
    over: onCreditMinor > 0n && exposureMinor > limitMinor,
  };
}

/**
 * The part of a sold line's amount (net, tax or cost) that goes with a returned quantity
 * (ACCOUNTING_POLICIES.md §8). It is worked out on the running total returned, so several
 * partial returns add up exactly to the line once everything has come back.
 */
export function returnShare(
  lineMinor: bigint,
  alreadyMinor: bigint,
  soldQtyMilli: bigint,
  alreadyQtyMilli: bigint,
  returnQtyMilli: bigint,
): bigint {
  if (returnQtyMilli <= 0n) {
    throw new SalesError('over_returned', 'Enter a quantity above zero');
  }
  if (alreadyQtyMilli + returnQtyMilli > soldQtyMilli) {
    throw new SalesError('over_returned', 'That is more than was sold and not yet returned');
  }
  return mulRatio(lineMinor, alreadyQtyMilli + returnQtyMilli, soldQtyMilli) - alreadyMinor;
}
