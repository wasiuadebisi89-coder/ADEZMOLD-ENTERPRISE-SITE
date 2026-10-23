import { collection, limit, orderBy, query, where, type QueryConstraint } from 'firebase/firestore';
import { useMemo } from 'react';
import type { UnitCode } from '@bms/domain';
import { db } from './firebase';
import { useCollection } from './firestore-hooks';

type Stamp = { toDate(): Date };

export interface SupplierRow {
  id: string;
  code: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxId: string | null;
  paymentTermsDays: number;
  status: 'active' | 'inactive';
  balanceMinor: number;
  advanceMinor: number;
}

export interface ReceiptLineRow {
  lineNo: number;
  productId: string;
  sku: string;
  productName: string;
  unit: UnitCode;
  qtyMilli: number;
  unitCostScaled: number;
  valueMinor: number;
  clearedQtyMilli: number;
  clearedValueMinor: number;
}

export interface ReceiptRow {
  id: string;
  number: string;
  supplierId: string;
  supplierName: string;
  locationId: string;
  branchId: string;
  postingDate: string;
  reference: string | null;
  memo: string | null;
  lines: ReceiptLineRow[];
  totalMinor: number;
  invoiceStatus: 'not_invoiced' | 'partly_invoiced' | 'invoiced';
  journalId: string;
  postedAt: Stamp;
}

export interface InvoiceLineRow {
  lineNo: number;
  kind: 'receipt' | 'expense' | 'landed' | 'opening';
  description: string;
  amountMinor: number;
  goodsReceiptId: string | null;
  receiptNumber: string | null;
  receiptLineNo: number | null;
  productId: string | null;
  sku: string | null;
  unit: UnitCode | null;
  qtyMilli: number | null;
  grniMinor: number | null;
  returnedQtyMilli: number | null;
  returnedCreditMinor: number | null;
  inventoryMinor: number | null;
  cogsMinor: number | null;
  basis: 'value' | 'quantity' | null;
  accountId: string | null;
  accountCode: string | null;
}

export interface InvoiceRow {
  id: string;
  number: string;
  kind: 'invoice' | 'opening';
  supplierId: string;
  supplierName: string;
  supplierInvoiceNo: string;
  branchId: string;
  invoiceDate: string;
  dueDate: string;
  memo: string | null;
  lines: InvoiceLineRow[];
  inputTaxMinor: number;
  totalMinor: number;
  paidMinor: number;
  creditedMinor: number;
  status: 'open' | 'paid';
  journalId: string;
  postedAt: Stamp;
}

export interface PaymentRow {
  id: string;
  number: string;
  supplierId: string;
  supplierName: string;
  branchId: string;
  postingDate: string;
  paymentAccountId: string;
  paymentAccountName: string;
  amountMinor: number;
  allocatedMinor: number;
  reference: string | null;
  memo: string | null;
  allocations: {
    invoiceId: string;
    invoiceNumber: string;
    amountMinor: number;
    journalId: string;
    allocatedAt: Stamp;
  }[];
  journalId: string;
  postedAt: Stamp;
}

export interface ReturnLineRow {
  lineNo: number;
  goodsReceiptId: string;
  receiptNumber: string;
  receiptLineNo: number;
  invoiceId: string | null;
  invoiceNumber: string | null;
  productId: string;
  sku: string;
  productName: string;
  unit: UnitCode;
  qtyMilli: number;
  costMinor: number;
  creditMinor: number;
}

export interface ReturnRow {
  id: string;
  number: string;
  supplierId: string;
  supplierName: string;
  locationId: string;
  branchId: string;
  postingDate: string;
  reason: string;
  lines: ReturnLineRow[];
  costMinor: number;
  creditMinor: number;
  journalId: string;
  postedAt: Stamp;
}

export const RECEIPT_STATUS = {
  not_invoiced: { label: 'Awaiting invoice', tone: 'amber' },
  partly_invoiced: { label: 'Partly invoiced', tone: 'blue' },
  invoiced: { label: 'Complete', tone: 'green' },
} as const;

export const outstanding = (i: Pick<InvoiceRow, 'totalMinor' | 'paidMinor' | 'creditedMinor'>) =>
  i.totalMinor - i.paidMinor - i.creditedMinor;

export function useSuppliers(companyId: string) {
  const q = useMemo(() => collection(db, `companies/${companyId}/suppliers`), [companyId]);
  const res = useCollection<Omit<SupplierRow, 'id'>>(q, `suppliers-${companyId}`);
  const data = useMemo(
    () => [...res.data].sort((a, b) => a.name.localeCompare(b.name)),
    [res.data],
  );
  return { ...res, data };
}

type DocCollection = 'goodsReceipts' | 'purchaseInvoices' | 'supplierPayments' | 'supplierReturns';

/** The latest 100 documents of a kind, optionally for one supplier. */
export function useSupplierDocs<T extends { id: string }>(
  companyId: string,
  coll: DocCollection,
  supplierId?: string,
) {
  const q = useMemo(() => {
    const constraints: QueryConstraint[] = [orderBy('postedAt', 'desc'), limit(100)];
    if (supplierId) constraints.unshift(where('supplierId', '==', supplierId));
    return query(collection(db, `companies/${companyId}/${coll}`), ...constraints);
  }, [companyId, coll, supplierId]);
  return useCollection<Omit<T, 'id'>>(q, `${coll}-${companyId}-${supplierId ?? 'all'}`);
}

/** Invoices still owing, oldest due first. */
export function useOpenInvoices(companyId: string, supplierId: string) {
  const q = useMemo(
    () =>
      supplierId
        ? query(
            collection(db, `companies/${companyId}/purchaseInvoices`),
            where('supplierId', '==', supplierId),
            where('status', '==', 'open'),
            orderBy('dueDate'),
          )
        : null,
    [companyId, supplierId],
  );
  return useCollection<Omit<InvoiceRow, 'id'>>(q, `open-invoices-${companyId}-${supplierId}`);
}

/** Receipts with lines not yet invoiced. */
export function useOpenReceipts(companyId: string, supplierId: string) {
  const q = useMemo(
    () =>
      supplierId
        ? query(
            collection(db, `companies/${companyId}/goodsReceipts`),
            where('supplierId', '==', supplierId),
            where('invoiceStatus', 'in', ['not_invoiced', 'partly_invoiced']),
            orderBy('postedAt', 'desc'),
          )
        : null,
    [companyId, supplierId],
  );
  return useCollection<Omit<ReceiptRow, 'id'>>(q, `open-receipts-${companyId}-${supplierId}`);
}
