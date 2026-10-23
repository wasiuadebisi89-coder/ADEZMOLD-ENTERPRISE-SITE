import {
  collection,
  getAggregateFromServer,
  limit,
  orderBy,
  query,
  sum,
  where,
  type QueryConstraint,
} from 'firebase/firestore';
import { useMemo } from 'react';
import { db } from './firebase';
import { useCollection } from './firestore-hooks';
import type { AccountRow } from './ledger';

type Stamp = { toDate(): Date };

export interface FixedAssetRow {
  id: string;
  number: string;
  name: string;
  branchId: string;
  assetAccountId: string;
  assetAccountName: string;
  accumulatedAccountId: string;
  expenseAccountId: string;
  costMinor: number;
  residualMinor: number;
  usefulLifeMonths: number;
  availableForUseDate: string;
  firstMonth: string;
  baseMonths: number;
  baseAccumulatedMinor: number;
  chargedMonths: number;
  accumulatedMinor: number;
  depreciatedThrough: string | null;
  status: 'active' | 'disposed';
  acquisition: {
    kind: 'purchase' | 'opening';
    date: string;
    creditAccountId: string | null;
    journalId: string;
  };
  disposal: {
    date: string;
    proceedsMinor: number;
    proceedsAccountId: string | null;
    gainLossAccountId: string;
    gainMinor: number;
    reason: string;
    journalId: string;
  } | null;
  reference: string | null;
  createdAt: Stamp;
}

export interface DepreciationRunRow {
  id: string;
  branchId: string;
  month: string;
  postingDate: string;
  totalMinor: number;
  assets: { assetId: string; number: string; months: number; amountMinor: number }[];
  journalId: string;
  journalNumber: string;
  postedAt: Stamp;
}

export const ASSET_TONE = { active: 'green', disposed: 'slate' } as const;

export function useFixedAssets(companyId: string) {
  const q = useMemo(
    () => query(collection(db, `companies/${companyId}/fixedAssets`), orderBy('number')),
    [companyId],
  );
  return useCollection<Omit<FixedAssetRow, 'id'>>(q, `fixed-assets-${companyId}`);
}

export function useDepreciationRuns(companyId: string) {
  const q = useMemo(
    () =>
      query(
        collection(db, `companies/${companyId}/depreciationRuns`),
        orderBy('postedAt', 'desc'),
        limit(24),
      ),
    [companyId],
  );
  return useCollection<Omit<DepreciationRunRow, 'id'>>(q, `depreciation-runs-${companyId}`);
}

export const bookValue = (a: Pick<FixedAssetRow, 'costMinor' | 'accumulatedMinor'>) =>
  a.costMinor - a.accumulatedMinor;

/** "2026-10" → "October 2026". */
export function monthLabel(month: string): string {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1));
  return d.toLocaleDateString('en-NG', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Debit and credit totals per account from server-side sums over ledger entries
 * (docs/bms/adr/0004), optionally between two posting dates inclusive.
 */
export async function loadMovements(
  companyId: string,
  accounts: readonly AccountRow[],
  range: { from?: string; to: string },
) {
  const entries = collection(db, `companies/${companyId}/ledgerEntries`);
  return Promise.all(
    accounts
      .filter((a) => a.isPostable && a.hasPostings)
      .map(async (account) => {
        const constraints: QueryConstraint[] = [
          where('accountId', '==', account.id),
          ...(range.from ? [where('postingDate', '>=', range.from)] : []),
          where('postingDate', '<=', range.to),
        ];
        const snap = await getAggregateFromServer(query(entries, ...constraints), {
          debit: sum('debit'),
          credit: sum('credit'),
        });
        return {
          account,
          debit: BigInt(snap.data().debit ?? 0),
          credit: BigInt(snap.data().credit ?? 0),
        };
      }),
  );
}
