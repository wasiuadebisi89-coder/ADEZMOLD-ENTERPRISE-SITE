/**
 * Fixed asset depreciation (ACCOUNTING_POLICIES.md §11): straight line, monthly. An asset
 * available for use on or before the 15th is depreciated from that month, otherwise from the
 * next (DECISION 10); a disposal on or before the 15th stops before that month, otherwise after
 * it. Charges are worked on the running total, so they add up exactly to cost less residual.
 */
import { mulRatio } from './money.js';
import { isIsoDate } from './periods.js';

export type AssetErrorCode = 'invalid_asset' | 'invalid_month';

export class AssetError extends Error {
  constructor(
    readonly code: AssetErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AssetError';
  }
}

export const MAX_LIFE_MONTHS = 1200;

const isMonth = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

/** "2026-10" plus n months. */
export function addMonths(month: string, n: number): string {
  if (!isMonth(month)) throw new AssetError('invalid_month', `Invalid month: ${month}`);
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + n;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** Months from a to b: 0 when equal, negative when b is earlier. */
export function monthsBetween(a: string, b: string): number {
  if (!isMonth(a) || !isMonth(b)) throw new AssetError('invalid_month', 'Invalid month');
  const index = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7));
  return index(b) - index(a);
}

function day(date: string): number {
  if (!isIsoDate(date)) throw new AssetError('invalid_month', `Invalid date: ${date}`);
  return Number(date.slice(8, 10));
}

/** The first month depreciated for an asset available for use on this date (DECISION 10). */
export function firstDepreciationMonth(availableForUse: string): string {
  const month = availableForUse.slice(0, 7);
  return day(availableForUse) <= 15 ? month : addMonths(month, 1);
}

/** The last month depreciated for an asset disposed of on this date. */
export function lastMonthBeforeDisposal(disposalDate: string): string {
  const month = disposalDate.slice(0, 7);
  return day(disposalDate) <= 15 ? addMonths(month, -1) : month;
}

export interface DepreciationState {
  costMinor: bigint;
  residualMinor: bigint;
  lifeMonths: number;
  /** For assets brought in at go-live: months and depreciation already charged before. */
  baseMonths: number;
  baseAccumulatedMinor: bigint;
  /** The month that gets the first charge after the base. */
  firstMonth: string;
  chargedMonths: number;
  accumulatedMinor: bigint;
}

export function assertValidAsset(s: Omit<DepreciationState, 'chargedMonths' | 'accumulatedMinor'>) {
  const depreciable = s.costMinor - s.residualMinor;
  if (s.costMinor <= 0n) throw new AssetError('invalid_asset', 'Cost must be above zero');
  if (s.residualMinor < 0n || depreciable < 0n) {
    throw new AssetError('invalid_asset', 'Residual value must be between zero and the cost');
  }
  if (!Number.isInteger(s.lifeMonths) || s.lifeMonths < 1 || s.lifeMonths > MAX_LIFE_MONTHS) {
    throw new AssetError('invalid_asset', `Useful life must be 1 to ${MAX_LIFE_MONTHS} months`);
  }
  if (!Number.isInteger(s.baseMonths) || s.baseMonths < 0 || s.baseMonths > s.lifeMonths) {
    throw new AssetError('invalid_asset', 'Months already depreciated cannot exceed the life');
  }
  if (s.baseAccumulatedMinor < 0n || s.baseAccumulatedMinor > depreciable) {
    throw new AssetError(
      'invalid_asset',
      'Depreciation to date must be between zero and cost less residual value',
    );
  }
}

/** Depreciation after k months of life, k between the base and the full life. */
function cumulative(s: DepreciationState, k: number): bigint {
  const remainingLife = s.lifeMonths - s.baseMonths;
  const remaining = s.costMinor - s.residualMinor - s.baseAccumulatedMinor;
  if (remainingLife === 0) return s.baseAccumulatedMinor;
  return (
    s.baseAccumulatedMinor + mulRatio(remaining, BigInt(k - s.baseMonths), BigInt(remainingLife))
  );
}

/** What is due from the last charge through `throughMonth`, never beyond the asset's life. */
export function depreciationDue(
  s: DepreciationState,
  throughMonth: string,
): { months: number; amountMinor: bigint; chargedMonths: number } {
  const elapsed = Math.max(0, monthsBetween(s.firstMonth, throughMonth) + 1);
  const target = Math.min(s.lifeMonths, s.baseMonths + elapsed);
  if (target <= s.chargedMonths) {
    return { months: 0, amountMinor: 0n, chargedMonths: s.chargedMonths };
  }
  return {
    months: target - s.chargedMonths,
    amountMinor: cumulative(s, target) - s.accumulatedMinor,
    chargedMonths: target,
  };
}

/** "2026-02" → "2026-02-28". */
export function lastDayOfMonth(month: string): string {
  const next = addMonths(month, 1);
  const d = new Date(Date.UTC(Number(next.slice(0, 4)), Number(next.slice(5, 7)) - 1, 0));
  return d.toISOString().slice(0, 10);
}

/** The last month whose charge has been posted since the base, or null if none yet. */
export function lastChargedMonth(s: DepreciationState): string | null {
  const charged = s.chargedMonths - s.baseMonths;
  return charged > 0 ? addMonths(s.firstMonth, charged - 1) : null;
}
