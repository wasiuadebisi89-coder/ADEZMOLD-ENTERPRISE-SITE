import { describe, expect, it } from 'vitest';
import {
  AssetError,
  addMonths,
  assertValidAsset,
  depreciationDue,
  firstDepreciationMonth,
  lastChargedMonth,
  lastDayOfMonth,
  lastMonthBeforeDisposal,
  monthsBetween,
  type DepreciationState,
} from './assets.js';

const asset = (over: Partial<DepreciationState> = {}): DepreciationState => ({
  costMinor: 100_000n,
  residualMinor: 10_000n,
  lifeMonths: 36,
  baseMonths: 0,
  baseAccumulatedMinor: 0n,
  firstMonth: '2026-01',
  chargedMonths: 0,
  accumulatedMinor: 0n,
  ...over,
});

describe('months', () => {
  it('adds and counts months across years', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(monthsBetween('2025-12', '2026-02')).toBe(2);
    expect(monthsBetween('2026-02', '2025-12')).toBe(-2);
  });
});

describe('first and last month (DECISION 10)', () => {
  it('starts the month of use on or before the 15th, otherwise the next', () => {
    expect(firstDepreciationMonth('2026-03-15')).toBe('2026-03');
    expect(firstDepreciationMonth('2026-03-16')).toBe('2026-04');
    expect(firstDepreciationMonth('2026-12-31')).toBe('2027-01');
  });
  it('stops before the month of disposal on or before the 15th, otherwise after it', () => {
    expect(lastMonthBeforeDisposal('2026-03-15')).toBe('2026-02');
    expect(lastMonthBeforeDisposal('2026-03-16')).toBe('2026-03');
  });
});

describe('straight-line depreciation', () => {
  it('charges cost less residual evenly, rounding on the running total', () => {
    // 90,000 over 36 months = 2,500 each
    expect(depreciationDue(asset(), '2026-01')).toEqual({
      months: 1,
      amountMinor: 2_500n,
      chargedMonths: 1,
    });
    // Odd amount: 1,000.00 over 3 months
    const odd = asset({ costMinor: 100_000n, residualMinor: 0n, lifeMonths: 3 });
    const m1 = depreciationDue(odd, '2026-01');
    const m2 = depreciationDue(
      { ...odd, chargedMonths: 1, accumulatedMinor: m1.amountMinor },
      '2026-02',
    );
    const m3 = depreciationDue(
      { ...odd, chargedMonths: 2, accumulatedMinor: m1.amountMinor + m2.amountMinor },
      '2026-03',
    );
    expect([m1.amountMinor, m2.amountMinor, m3.amountMinor]).toEqual([33_333n, 33_334n, 33_333n]);
  });
  it('catches up missed months and never goes beyond the life', () => {
    expect(depreciationDue(asset(), '2026-06')).toMatchObject({ months: 6, amountMinor: 15_000n });
    const all = depreciationDue(asset(), '2030-01');
    expect(all).toMatchObject({ months: 36, amountMinor: 90_000n, chargedMonths: 36 });
    expect(
      depreciationDue({ ...asset(), chargedMonths: 36, accumulatedMinor: 90_000n }, '2031-01'),
    ).toMatchObject({ months: 0, amountMinor: 0n });
  });
  it('charges nothing before the first month', () => {
    expect(depreciationDue(asset({ firstMonth: '2026-05' }), '2026-04').months).toBe(0);
  });
  it('continues an asset brought in part-depreciated over its remaining life', () => {
    const opening = asset({
      baseMonths: 12,
      baseAccumulatedMinor: 40_000n,
      chargedMonths: 12,
      accumulatedMinor: 40_000n,
      firstMonth: '2026-11',
    });
    // 50,000 left over 24 months
    expect(depreciationDue(opening, '2026-11').amountMinor).toBe(2_083n);
    expect(depreciationDue(opening, '2030-01')).toMatchObject({ months: 24, amountMinor: 50_000n });
  });
});

describe('validation', () => {
  it('refuses impossible assets', () => {
    const base = { ...asset() };
    expect(() => assertValidAsset({ ...base, residualMinor: 200_000n })).toThrow(AssetError);
    expect(() => assertValidAsset({ ...base, lifeMonths: 0 })).toThrow(AssetError);
    expect(() => assertValidAsset({ ...base, baseMonths: 40 })).toThrow(AssetError);
    expect(() => assertValidAsset({ ...base, baseAccumulatedMinor: 95_000n })).toThrow(AssetError);
    expect(() => assertValidAsset(base)).not.toThrow();
  });
});

describe('month ends and charged months', () => {
  it('finds the last day, including leap years', () => {
    expect(lastDayOfMonth('2026-02')).toBe('2026-02-28');
    expect(lastDayOfMonth('2028-02')).toBe('2028-02-29');
    expect(lastDayOfMonth('2026-12')).toBe('2026-12-31');
  });
  it('names the last month charged since the base', () => {
    expect(lastChargedMonth(asset())).toBeNull();
    expect(lastChargedMonth(asset({ chargedMonths: 3 }))).toBe('2026-03');
    expect(lastChargedMonth(asset({ baseMonths: 10, chargedMonths: 10 }))).toBeNull();
    expect(lastChargedMonth(asset({ baseMonths: 10, chargedMonths: 12 }))).toBe('2026-02');
  });
});
