import { collection, limit, orderBy, query } from 'firebase/firestore';
import { useMemo } from 'react';
import { isExpenseAccount } from '@bms/domain';
import { db } from './firebase';
import { useCollection } from './firestore-hooks';
import type { AccountRow } from './ledger';

type Stamp = { toDate(): Date };

export interface ExpenseLineRow {
  lineNo: number;
  accountId: string;
  accountCode: string;
  accountName: string;
  description: string;
  amountMinor: number;
}

export interface ExpenseRow {
  id: string;
  number: string;
  mode: 'paid' | 'credit';
  branchId: string;
  expenseDate: string;
  payee: string;
  supplierId: string | null;
  paymentAccountId: string | null;
  paymentAccountName: string | null;
  purchaseInvoiceId: string | null;
  purchaseInvoiceNumber: string | null;
  dueDate: string | null;
  reference: string | null;
  memo: string | null;
  lines: ExpenseLineRow[];
  subtotalMinor: number;
  inputTaxMinor: number;
  totalMinor: number;
  projectId: string | null;
  journalId: string;
  postedAt: Stamp;
}

export const EXPENSE_MODE = {
  paid: { label: 'Paid', tone: 'green' },
  credit: { label: 'On credit', tone: 'amber' },
} as const;

/** Accounts an expense can be charged to, in chart order. */
export function expenseAccounts<T extends AccountRow>(accounts: readonly T[]): T[] {
  return accounts.filter((a) => isExpenseAccount(a));
}

/** The latest 200 expenses. */
export function useExpenses(companyId: string) {
  const q = useMemo(
    () =>
      query(
        collection(db, `companies/${companyId}/expenses`),
        orderBy('postedAt', 'desc'),
        limit(200),
      ),
    [companyId],
  );
  return useCollection<Omit<ExpenseRow, 'id'>>(q, `expenses-${companyId}`);
}
