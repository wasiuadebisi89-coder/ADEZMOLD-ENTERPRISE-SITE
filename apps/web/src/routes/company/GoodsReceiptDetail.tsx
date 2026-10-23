import { doc } from 'firebase/firestore';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { COST_SCALE } from '@bms/domain';
import { Button } from '../../components/ui/button';
import { Badge, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { db } from '../../lib/firebase';
import { useDoc } from '../../lib/firestore-hooks';
import { qty } from '../../lib/inventory';
import { money } from '../../lib/ledger';
import { RECEIPT_STATUS, type ReceiptRow } from '../../lib/purchasing';
import { formatDate, formatDateTime } from '../../lib/utils';

export default function GoodsReceiptDetail() {
  const { companyId, company, can } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const { receiptId = '' } = useParams();
  const ref = useMemo(
    () => doc(db, `companies/${companyId}/goodsReceipts/${receiptId}`),
    [companyId, receiptId],
  );
  const receipt = useDoc<Omit<ReceiptRow, 'id'>>(ref);
  if (receipt.loading) return <Spinner />;
  const r = receipt.data;
  if (!r) return <EmptyState title="Goods receipt not found" />;
  const status = RECEIPT_STATUS[r.invoiceStatus];
  const p = `/c/${companyId}/purchases`;

  return (
    <>
      <PageHeader
        title={`Goods received ${r.number}`}
        description={r.supplierName}
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link to={`${p}?tab=receipts`}>All receipts</Link>
            </Button>
            {can('purchasing.invoice.post') && (
              <Button variant="secondary" asChild>
                <Link to={`${p}/returns/new?supplier=${r.supplierId}`}>Return goods</Link>
              </Button>
            )}
            {can('purchasing.invoice.post') && r.invoiceStatus !== 'invoiced' && (
              <Button asChild>
                <Link to={`${p}/invoices/new?supplier=${r.supplierId}&branch=${r.branchId}`}>
                  Record invoice
                </Link>
              </Button>
            )}
          </>
        }
      />
      <Card className="mb-4 p-4">
        <dl className="grid gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-slate-500">Status</dt>
            <dd>
              <Badge tone={status.tone}>{status.label}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Received on</dt>
            <dd className="font-medium">{formatDate(r.postingDate)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Location</dt>
            <dd className="font-medium">{r.locationId}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Delivery note</dt>
            <dd className="font-medium">{r.reference ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Posted</dt>
            <dd className="font-medium">{formatDateTime(r.postedAt)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Supplier</dt>
            <dd>
              <Link
                className="font-medium text-brand-700 underline"
                to={`/c/${companyId}/suppliers/${r.supplierId}`}
              >
                {r.supplierName}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Ledger</dt>
            <dd>
              <Link
                className="font-medium text-brand-700 underline"
                to={`/c/${companyId}/journals/${r.journalId}`}
              >
                View journal
              </Link>
            </dd>
          </div>
        </dl>
      </Card>
      <Card>
        <Table label="Receipt lines">
          <THead>
            <Tr>
              <Th>Product</Th>
              <Th className="text-right">Received</Th>
              <Th className="text-right">Unit cost</Th>
              <Th className="text-right">Value</Th>
              <Th className="text-right">Invoiced or returned</Th>
            </Tr>
          </THead>
          <TBody>
            {r.lines.map((l) => (
              <Tr key={l.lineNo}>
                <Td>
                  <span className="font-mono">{l.sku}</span> {l.productName}
                </Td>
                <Td className="text-right tabular-nums">{qty(l.qtyMilli, l.unit)}</Td>
                <Td className="text-right tabular-nums">
                  {money(BigInt(l.unitCostScaled) / COST_SCALE, currency)}
                </Td>
                <Td className="text-right tabular-nums">{money(l.valueMinor, currency)}</Td>
                <Td className="text-right tabular-nums">{qty(l.clearedQtyMilli, l.unit)}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
        <p className="border-t border-slate-100 p-4 text-right text-sm font-semibold tabular-nums">
          Total {money(r.totalMinor, currency)}
        </p>
      </Card>
    </>
  );
}
