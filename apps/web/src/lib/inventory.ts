import { collection, query, where } from 'firebase/firestore';
import { useMemo } from 'react';
import { UNITS, formatQuantity, type UnitCode } from '@bms/domain';
import { db } from './firebase';
import { useCollection } from './firestore-hooks';

export interface ProductRow {
  id: string;
  sku: string;
  name: string;
  unit: UnitCode;
  categoryId: string | null;
  description: string;
  salePrice: number | null;
  reorderLevelMilli: number | null;
  status: 'active' | 'inactive';
  hasMovements: boolean;
}

export interface CategoryRow {
  id: string;
  name: string;
  status: 'active' | 'inactive';
}

export interface LocationRow {
  id: string;
  branchId: string;
  name: string;
  type: 'store' | 'quarantine';
  status: 'active' | 'inactive';
}

export interface StockBalanceRow {
  id: string;
  productId: string;
  locationId: string;
  branchId: string;
  qtyMilli: number;
  valueMinor: number;
}

export interface MovementRow {
  id: string;
  productId: string;
  locationId: string;
  qtyMilli: number;
  valueMinor: number;
  movementType: keyof typeof MOVEMENT_LABEL;
  postingDate: string;
  sourceType:
    | 'stockAdjustment'
    | 'goodsReceipt'
    | 'purchaseInvoice'
    | 'supplierReturn'
    | 'salesInvoice'
    | 'creditNote';
  sourceId: string;
  sourceNumber: string;
  balanceQtyMilli: number;
  balanceValueMinor: number;
  postedAt: { toDate(): Date };
}

export interface AdjustmentLineRow {
  lineNo: number;
  productId: string;
  sku: string;
  productName: string;
  unit: UnitCode;
  enteredMilli: number;
  expectedMilli: number | null;
  deltaMilli: number;
  unitCostScaled: number | null;
  valueMinor: number | null;
}

export interface AdjustmentRow {
  id: string;
  number: string;
  kind: 'adjustment' | 'count' | 'opening';
  locationId: string;
  branchId: string;
  reason: string;
  lines: AdjustmentLineRow[];
  status: 'pending' | 'posted' | 'rejected';
  createdAt: { toDate(): Date };
  createdBy: string;
  decidedBy: string | null;
  decisionReason: string | null;
  postingDate: string | null;
  journalId: string | null;
  valueMinor: number | null;
}

export const KIND_LABEL: Record<AdjustmentRow['kind'], string> = {
  adjustment: 'Adjustment',
  count: 'Stock count',
  opening: 'Opening stock',
};

export const MOVEMENT_LABEL = {
  ...KIND_LABEL,
  receipt: 'Goods received',
  purchase_return: 'Returned to supplier',
  cost_adjustment: 'Cost adjusted',
  sale: 'Sold',
  sales_return: 'Returned by customer',
} as const;

/** Where a stock movement's source document lives in the app. */
export function movementSourcePath(
  companyId: string,
  m: Pick<MovementRow, 'sourceType' | 'sourceId'>,
) {
  const base = `/c/${companyId}`;
  switch (m.sourceType) {
    case 'goodsReceipt':
      return `${base}/purchases/receipts/${m.sourceId}`;
    case 'purchaseInvoice':
      return `${base}/purchases/invoices/${m.sourceId}`;
    case 'supplierReturn':
      return `${base}/purchases/returns/${m.sourceId}`;
    case 'salesInvoice':
      return `${base}/sales/invoices/${m.sourceId}`;
    case 'creditNote':
      return `${base}/sales/returns/${m.sourceId}`;
    default:
      return `${base}/stock-adjustments/${m.sourceId}`;
  }
}

export const STATUS_TONE = { pending: 'amber', posted: 'green', rejected: 'slate' } as const;

export function qty(milli: number | bigint, unit: UnitCode): string {
  return `${formatQuantity(milli, unit)} ${UNITS[unit].code}`;
}

export function useProducts(companyId: string) {
  const q = useMemo(() => collection(db, `companies/${companyId}/products`), [companyId]);
  const res = useCollection<Omit<ProductRow, 'id'>>(q, `products-${companyId}`);
  const data = useMemo(
    () => [...res.data].sort((a, b) => a.sku.localeCompare(b.sku, 'en', { numeric: true })),
    [res.data],
  );
  return { ...res, data };
}

export function useCategories(companyId: string) {
  const q = useMemo(() => collection(db, `companies/${companyId}/categories`), [companyId]);
  return useCollection<Omit<CategoryRow, 'id'>>(q, `categories-${companyId}`);
}

export function useLocations(companyId: string) {
  const q = useMemo(() => collection(db, `companies/${companyId}/locations`), [companyId]);
  const res = useCollection<Omit<LocationRow, 'id'>>(q, `locations-${companyId}`);
  const data = useMemo(
    () =>
      [...res.data].sort(
        (a, b) => a.branchId.localeCompare(b.branchId) || a.type.localeCompare(b.type) * -1,
      ),
    [res.data],
  );
  return { ...res, data };
}

/** Stock balances, optionally for one product. Needs stock report access. */
export function useStockBalances(companyId: string, productId?: string, enabled = true) {
  const q = useMemo(() => {
    if (!enabled) return null;
    const base = collection(db, `companies/${companyId}/stockBalances`);
    return productId ? query(base, where('productId', '==', productId)) : base;
  }, [companyId, productId, enabled]);
  return useCollection<Omit<StockBalanceRow, 'id'>>(
    q,
    `balances-${companyId}-${productId ?? 'all'}`,
  );
}

export function locationLabel(l: Pick<LocationRow, 'branchId' | 'name'>, branchName?: string) {
  return `${branchName ?? l.branchId} · ${l.name}`;
}
