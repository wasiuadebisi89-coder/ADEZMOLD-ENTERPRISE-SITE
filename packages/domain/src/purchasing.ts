/**
 * Purchasing rules (ACCOUNTING_POLICIES.md §5–6): clearing goods received not invoiced,
 * splitting invoice price differences between stock and cost of sales, and spreading landed
 * costs over receipt lines. Pure functions on bigint minor units and milli-quantities.
 */
import { allocate, mulRatio } from './money.js';

export type PurchasingErrorCode =
  'over_cleared' | 'invalid_quantity' | 'invalid_amount' | 'over_allocated';

export class PurchasingError extends Error {
  constructor(
    readonly code: PurchasingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PurchasingError';
  }
}

/** A goods-receipt line as GRNI sees it: what was received and how much has been cleared. */
export interface ReceiptLineState {
  qtyMilli: bigint;
  valueMinor: bigint;
  /** Quantity already invoiced or returned before invoicing. */
  clearedQtyMilli: bigint;
  /** GRNI value already released for that quantity. */
  clearedValueMinor: bigint;
}

/**
 * The GRNI value released when `qtyMilli` more of a receipt line is invoiced or returned.
 * Computed cumulatively, so partial clearings never release more than the line's value and the
 * last clearing releases exactly what is left.
 */
export function clearingValue(line: ReceiptLineState, qtyMilli: bigint): bigint {
  if (qtyMilli <= 0n) throw new PurchasingError('invalid_quantity', 'Quantity must be positive');
  const remaining = line.qtyMilli - line.clearedQtyMilli;
  if (qtyMilli > remaining) {
    throw new PurchasingError(
      'over_cleared',
      'More than the quantity received and not yet invoiced or returned',
    );
  }
  const cumulative = mulRatio(line.valueMinor, line.clearedQtyMilli + qtyMilli, line.qtyMilli);
  return cumulative - line.clearedValueMinor;
}

/**
 * Splits the difference between the invoiced amount and the GRNI value it clears. The share for
 * goods still on hand adjusts stock value; the rest goes to cost of sales (§5). The stock share
 * never takes the stock value below zero.
 */
export function splitPriceDifference(
  differenceMinor: bigint,
  invoicedQtyMilli: bigint,
  onHandQtyMilli: bigint,
  stockValueMinor: bigint,
): { inventory: bigint; cogs: bigint } {
  if (invoicedQtyMilli <= 0n) {
    throw new PurchasingError('invalid_quantity', 'Quantity must be positive');
  }
  if (differenceMinor === 0n) return { inventory: 0n, cogs: 0n };
  const onHand =
    onHandQtyMilli <= 0n
      ? 0n
      : onHandQtyMilli > invoicedQtyMilli
        ? invoicedQtyMilli
        : onHandQtyMilli;
  let inventory = mulRatio(differenceMinor, onHand, invoicedQtyMilli);
  if (inventory < -stockValueMinor) inventory = -stockValueMinor;
  return { inventory, cogs: differenceMinor - inventory };
}

export type LandedCostBasis = 'value' | 'quantity';

/** Spreads a capitalisable charge over receipt lines by value or quantity; parts sum exactly. */
export function allocateLandedCost(
  amountMinor: bigint,
  basis: LandedCostBasis,
  lines: readonly { qtyMilli: bigint; valueMinor: bigint }[],
): bigint[] {
  if (amountMinor <= 0n) throw new PurchasingError('invalid_amount', 'Amount must be positive');
  const weights = lines.map((l) => (basis === 'value' ? l.valueMinor : l.qtyMilli));
  if (weights.length === 0 || weights.every((w) => w <= 0n)) {
    throw new PurchasingError('invalid_amount', `Nothing to spread the cost over by ${basis}`);
  }
  return allocate(
    amountMinor,
    weights.map((w) => (w < 0n ? 0n : w)),
  );
}

/** What is still owed on a supplier document. */
export function outstanding(doc: { totalMinor: bigint; settledMinor: bigint }): bigint {
  return doc.totalMinor - doc.settledMinor;
}

/**
 * Checks a set of allocations against what each document still owes and the amount available.
 * Returns the total allocated.
 */
export function assertAllocations(
  available: bigint,
  allocations: readonly { amountMinor: bigint; outstandingMinor: bigint; label: string }[],
): bigint {
  let total = 0n;
  for (const a of allocations) {
    if (a.amountMinor <= 0n) {
      throw new PurchasingError('invalid_amount', `${a.label}: amount must be positive`);
    }
    if (a.amountMinor > a.outstandingMinor) {
      throw new PurchasingError('over_allocated', `${a.label}: more than is outstanding`);
    }
    total += a.amountMinor;
  }
  if (total > available) {
    throw new PurchasingError('over_allocated', 'Allocations exceed the amount available');
  }
  return total;
}
