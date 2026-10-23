import { collection, limit, orderBy, query, where, type QueryConstraint } from 'firebase/firestore';
import { useMemo } from 'react';
import type { UnitCode } from '@bms/domain';
import { useCompany } from './company';
import { db } from './firebase';
import { useCollection } from './firestore-hooks';

type Stamp = { toDate(): Date };

export interface CustomerRow {
  id: string;
  code: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxId: string | null;
  paymentTermsDays: number;
  creditLimitMinor: number;
  status: 'active' | 'inactive';
  balanceMinor: number;
  advanceMinor: number;
}

export interface TaxCodeRow {
  id: string;
  code: string;
  name: string;
  rateBp: number;
  status: 'active' | 'inactive';
}

export interface SalesLineRow {
  lineNo: number;
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
  costMinor: number;
  returnedQtyMilli: number;
}

export interface SalesInvoiceRow {
  id: string;
  number: string;
  kind: 'invoice' | 'opening';
  customerId: string | null;
  customerName: string;
  branchId: string;
  locationId: string | null;
  invoiceDate: string;
  dueDate: string;
  reference: string | null;
  memo: string | null;
  pricesIncludeTax: boolean;
  lines: SalesLineRow[];
  netMinor: number;
  taxMinor: number;
  totalMinor: number;
  costMinor: number;
  payments: { accountId: string; accountName: string; amountMinor: number }[];
  paidMinor: number;
  creditedMinor: number;
  status: 'open' | 'paid';
  creditOverride: { by: 'permission' | 'approval'; approvalId: string | null } | null;
  journalId: string;
  postedAt: Stamp;
  postedBy: string;
}

export interface CustomerReceiptRow {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  branchId: string;
  postingDate: string;
  depositAccountId: string;
  depositAccountName: string;
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
  postedBy: string;
}

export const salesOutstanding = (
  i: Pick<SalesInvoiceRow, 'totalMinor' | 'paidMinor' | 'creditedMinor'>,
) => i.totalMinor - i.paidMinor - i.creditedMinor;

/**
 * Users with sales.readOwn but not sales.read may only read documents they posted, so their
 * queries must say so or the security rules refuse them.
 */
export function useOwnOnly(): string | null {
  const { can, member } = useCompany();
  return !can('sales.read') && can('sales.readOwn') ? (member?.uid ?? null) : null;
}

export function useCustomers(companyId: string) {
  const q = useMemo(() => collection(db, `companies/${companyId}/customers`), [companyId]);
  const res = useCollection<Omit<CustomerRow, 'id'>>(q, `customers-${companyId}`);
  const data = useMemo(
    () => [...res.data].sort((a, b) => a.name.localeCompare(b.name)),
    [res.data],
  );
  return { ...res, data };
}

export function useTaxCodes(companyId: string) {
  const q = useMemo(() => collection(db, `companies/${companyId}/taxCodes`), [companyId]);
  const res = useCollection<Omit<TaxCodeRow, 'id'>>(q, `taxCodes-${companyId}`);
  const data = useMemo(
    () => [...res.data].sort((a, b) => a.code.localeCompare(b.code)),
    [res.data],
  );
  return { ...res, data };
}

/** Quantities on hand at one location, by product id. */
export function useAvailability(companyId: string, locationId: string) {
  const q = useMemo(
    () =>
      locationId
        ? query(
            collection(db, `companies/${companyId}/stockAvailability`),
            where('locationId', '==', locationId),
          )
        : null,
    [companyId, locationId],
  );
  const res = useCollection<{ productId: string; qtyMilli: number }>(
    q,
    `availability-${companyId}-${locationId}`,
  );
  const byProduct = useMemo(
    () => new Map(res.data.map((a) => [a.productId, a.qtyMilli])),
    [res.data],
  );
  return { ...res, byProduct };
}

type SalesCollection = 'salesInvoices' | 'customerReceipts';

/** The latest 100 documents of a kind, optionally for one customer. */
export function useSalesDocs<T extends { id: string }>(
  companyId: string,
  coll: SalesCollection,
  customerId?: string,
) {
  const own = useOwnOnly();
  const q = useMemo(() => {
    const constraints: QueryConstraint[] = [orderBy('postedAt', 'desc'), limit(100)];
    if (own) constraints.unshift(where('postedBy', '==', own));
    if (customerId) constraints.unshift(where('customerId', '==', customerId));
    return query(collection(db, `companies/${companyId}/${coll}`), ...constraints);
  }, [companyId, coll, customerId, own]);
  return useCollection<Omit<T, 'id'>>(
    q,
    `${coll}-${companyId}-${customerId ?? 'all'}-${own ?? 'any'}`,
  );
}

/** A customer's invoices still owing, oldest due first. */
export function useOpenSalesInvoices(companyId: string, customerId: string) {
  const own = useOwnOnly();
  const q = useMemo(() => {
    if (!customerId) return null;
    const constraints: QueryConstraint[] = [
      where('customerId', '==', customerId),
      ...(own ? [where('postedBy', '==', own)] : []),
      where('status', '==', 'open'),
      orderBy('dueDate'),
    ];
    return query(collection(db, `companies/${companyId}/salesInvoices`), ...constraints);
  }, [companyId, customerId, own]);
  return useCollection<Omit<SalesInvoiceRow, 'id'>>(
    q,
    `open-sales-${companyId}-${customerId}-${own ?? 'any'}`,
  );
}

/** The member's approved credit overrides, for using one on a sale. */
export function useMyCreditApprovals(companyId: string, uid: string | undefined) {
  const q = useMemo(
    () =>
      uid
        ? query(
            collection(db, `companies/${companyId}/approvalRequests`),
            where('requestedBy', '==', uid),
            where('action', '==', 'sales.creditOverride'),
            where('status', 'in', ['pending', 'approved']),
          )
        : null,
    [companyId, uid],
  );
  return useCollection<{
    status: 'pending' | 'approved';
    target: { customerId: string; customerName: string; amountMinor: number };
  }>(q, `credit-approvals-${companyId}-${uid}`);
}
