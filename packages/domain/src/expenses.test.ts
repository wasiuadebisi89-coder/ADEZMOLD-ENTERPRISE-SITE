import { describe, expect, it } from 'vitest';
import { isExpenseAccount, type ExpenseAccountCandidate } from './expenses.js';

const account = (over: Partial<ExpenseAccountCandidate> = {}): ExpenseAccountCandidate => ({
  type: 'expense',
  subtype: 'general',
  isPostable: true,
  isControl: false,
  status: 'active',
  ...over,
});

describe('isExpenseAccount', () => {
  it('accepts active, postable operating and direct service cost accounts', () => {
    expect(isExpenseAccount(account())).toBe(true);
    expect(isExpenseAccount(account({ subtype: 'directServiceCost' }))).toBe(true);
  });

  it('leaves out accounts other modules post to', () => {
    for (const subtype of ['cogs', 'inventoryAdjustment', 'purchasePriceVariance', 'depreciation'])
      expect(isExpenseAccount(account({ subtype: subtype as never }))).toBe(false);
  });

  it('refuses headings, control, inactive and non-expense accounts', () => {
    expect(isExpenseAccount(undefined)).toBe(false);
    expect(isExpenseAccount(account({ isPostable: false }))).toBe(false);
    expect(isExpenseAccount(account({ isControl: true }))).toBe(false);
    expect(isExpenseAccount(account({ status: 'inactive' }))).toBe(false);
    expect(isExpenseAccount(account({ type: 'asset', subtype: 'fixedAsset' }))).toBe(false);
  });
});
