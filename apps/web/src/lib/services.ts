import {
  collection,
  getAggregateFromServer,
  limit,
  orderBy,
  query,
  sum,
  where,
} from 'firebase/firestore';
import { useMemo } from 'react';
import type { UnitCode } from '@bms/domain';
import { db } from './firebase';
import { useCollection } from './firestore-hooks';
import type { AccountRow } from './ledger';

type Stamp = { toDate(): Date };

export interface ProjectRow {
  id: string;
  code: string;
  name: string;
  customerId: string | null;
  customerName: string | null;
  description: string;
  status: 'active' | 'completed' | 'cancelled';
  createdAt: Stamp;
}

export interface QuotationLineRow {
  lineNo: number;
  itemType: 'stock' | 'service';
  productId: string;
  sku: string;
  productName: string;
  unit: UnitCode;
  qtyMilli: number;
  listPriceMinor: number | null;
  unitPriceMinor: number;
  discountMinor: number;
  netMinor: number;
  taxCodeId: string | null;
  taxCode: string | null;
  taxRateBp: number;
  taxMinor: number;
  grossMinor: number;
}

export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'cancelled' | 'invoiced';

export interface QuotationRow {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  branchId: string;
  projectId: string | null;
  quoteDate: string;
  validUntil: string;
  reference: string | null;
  memo: string | null;
  pricesIncludeTax: boolean;
  lines: QuotationLineRow[];
  netMinor: number;
  taxMinor: number;
  totalMinor: number;
  status: QuotationStatus;
  invoiceId: string | null;
  invoiceNumber: string | null;
  createdAt: Stamp;
  createdBy: string;
}

export const PROJECT_TONE = { active: 'green', completed: 'blue', cancelled: 'slate' } as const;
export const QUOTATION_TONE = {
  draft: 'slate',
  sent: 'blue',
  accepted: 'green',
  declined: 'red',
  cancelled: 'slate',
  invoiced: 'green',
} as const;

export function useProjects(companyId: string, enabled = true) {
  const q = useMemo(
    () =>
      enabled ? query(collection(db, `companies/${companyId}/projects`), orderBy('code')) : null,
    [companyId, enabled],
  );
  return useCollection<Omit<ProjectRow, 'id'>>(q, `projects-${companyId}`);
}

/** Active projects a document for this customer may be tagged with. */
export const projectsFor = (projects: readonly ProjectRow[], customerId: string | null) =>
  projects.filter(
    (p) => p.status === 'active' && (p.customerId === null || p.customerId === customerId),
  );

/**
 * Quotations, newest first. Sales officers read only their own, so their query must say so or
 * the security rules refuse it.
 */
export function useQuotations(companyId: string, own: { uid: string } | null) {
  const q = useMemo(() => {
    const coll = collection(db, `companies/${companyId}/quotations`);
    return own
      ? query(coll, where('createdBy', '==', own.uid), orderBy('number', 'desc'), limit(200))
      : query(coll, orderBy('number', 'desc'), limit(200));
  }, [companyId, own]);
  return useCollection<Omit<QuotationRow, 'id'>>(q, `quotations-${companyId}-${own?.uid ?? 'all'}`);
}

export interface ProjectLine {
  account: AccountRow;
  /** Positive for income earned and for costs incurred. */
  amount: bigint;
}

/** The project's income and costs, from server-side sums over its tagged ledger entries. */
export async function loadProjectResult(
  companyId: string,
  projectId: string,
  accounts: readonly AccountRow[],
) {
  const entries = collection(db, `companies/${companyId}/ledgerEntries`);
  const rows = await Promise.all(
    accounts
      .filter((a) => a.isPostable && a.hasPostings && (a.type === 'income' || a.type === 'expense'))
      .map(async (account) => {
        const snap = await getAggregateFromServer(
          query(entries, where('projectId', '==', projectId), where('accountId', '==', account.id)),
          { debit: sum('debit'), credit: sum('credit') },
        );
        const debit = BigInt(snap.data().debit ?? 0);
        const credit = BigInt(snap.data().credit ?? 0);
        return { account, amount: account.type === 'income' ? credit - debit : debit - credit };
      }),
  );
  const lines = rows.filter((r) => r.amount !== 0n);
  const income = lines.filter((l) => l.account.type === 'income');
  const costs = lines.filter((l) => l.account.type === 'expense');
  const total = (ls: ProjectLine[]) => ls.reduce((s, l) => s + l.amount, 0n);
  return {
    income,
    costs,
    totalIncome: total(income),
    totalCosts: total(costs),
    margin: total(income) - total(costs),
  };
}
