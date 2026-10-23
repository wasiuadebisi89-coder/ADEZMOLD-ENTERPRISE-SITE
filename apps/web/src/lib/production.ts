import { collection, orderBy, query } from 'firebase/firestore';
import { useMemo } from 'react';
import type { UnitCode } from '@bms/domain';
import { db } from './firebase';
import { useCollection } from './firestore-hooks';

type Stamp = { toDate(): Date };

export interface BomRow {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  unit: UnitCode;
  name: string;
  outputQtyMilli: number;
  components: {
    productId: string;
    sku: string;
    productName: string;
    unit: UnitCode;
    qtyMilli: number;
  }[];
  status: 'active' | 'inactive';
  createdAt: Stamp;
}

export interface ProductionComponentRow {
  productId: string;
  sku: string;
  productName: string;
  unit: UnitCode;
  requiredQtyMilli: number;
  issuedQtyMilli: number;
  issuedValueMinor: number;
}

export interface ProductionCostRow {
  description: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  amountMinor: number;
  journalId: string;
  postingDate: string;
}

export type ProductionStatus = 'open' | 'completed' | 'cancelled';

export interface ProductionOrderRow {
  id: string;
  number: string;
  bomId: string;
  productId: string;
  sku: string;
  productName: string;
  unit: UnitCode;
  locationId: string;
  branchId: string;
  plannedQtyMilli: number;
  memo: string | null;
  components: ProductionComponentRow[];
  costs: ProductionCostRow[];
  materialsMinor: number;
  directCostMinor: number;
  wipMinor: number;
  status: ProductionStatus;
  goodQtyMilli: number | null;
  normalLossQtyMilli: number | null;
  abnormalLossQtyMilli: number | null;
  finishedCostMinor: number | null;
  writtenOffMinor: number | null;
  closingJournalId: string | null;
  closedDate: string | null;
  closeReason: string | null;
  journalIds: string[];
  createdAt: Stamp;
}

export const ORDER_TONE = { open: 'amber', completed: 'green', cancelled: 'slate' } as const;

export function useBoms(companyId: string) {
  const q = useMemo(
    () => query(collection(db, `companies/${companyId}/boms`), orderBy('sku')),
    [companyId],
  );
  return useCollection<Omit<BomRow, 'id'>>(q, `boms-${companyId}`);
}

export function useProductionOrders(companyId: string) {
  const q = useMemo(
    () =>
      query(collection(db, `companies/${companyId}/productionOrders`), orderBy('number', 'desc')),
    [companyId],
  );
  return useCollection<Omit<ProductionOrderRow, 'id'>>(q, `production-orders-${companyId}`);
}
