/**
 * Business expenses (DECISION 24): office purchases, services, repairs and replacements
 * recorded without writing a journal. The person picks what it was for (an expense account),
 * and whether it was paid now from cash or bank or is owed to a supplier; the system posts.
 */
import type { AccountSubtype, AccountType } from './ledger.js';

/**
 * Expense accounts an expense may be charged to. Cost of goods sold, stock adjustments, price
 * variances and depreciation are posted by their own modules and are left out.
 */
export const EXPENSE_SUBTYPES: readonly AccountSubtype[] = ['general', 'directServiceCost'];

export interface ExpenseAccountCandidate {
  type: AccountType;
  subtype: AccountSubtype;
  isPostable: boolean;
  isControl: boolean;
  status: 'active' | 'inactive';
}

export function isExpenseAccount(a: ExpenseAccountCandidate | undefined): boolean {
  return (
    !!a &&
    a.type === 'expense' &&
    EXPENSE_SUBTYPES.includes(a.subtype) &&
    a.isPostable &&
    !a.isControl &&
    a.status === 'active'
  );
}

export const EXPENSE_PAYMENT_MODES = ['paid', 'credit'] as const;
export type ExpensePaymentMode = (typeof EXPENSE_PAYMENT_MODES)[number];
