import { doc } from 'firebase/firestore';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../../components/ui/button';
import { Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { db } from '../../lib/firebase';
import { useDoc } from '../../lib/firestore-hooks';
import { qty } from '../../lib/inventory';
import { money } from '../../lib/ledger';
import type { ReturnRow } from '../../lib/purchasing';
import { formatDate } from '../../lib/utils';

export default function SupplierReturnDetail() {
  const { companyId, company } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const { returnId = '' } = useParams();
  const ref = useMemo(
    () => doc(db, `companies/${companyId}/supplierReturns/${returnId}`),
    [companyId, returnId],
  );
  const ret = useDoc<Omit<ReturnRow, 'id'>>(ref);
  if (ret.loading) return <Spinner />;
  const r = ret.data;
  if (!r) return <EmptyState title="Return not found" />;
  const p = `/c/${companyId}/purchases`;

  return (
    <>
      <PageHeader
        title={`Return to supplier ${r.number}`}
        description={r.reason}
        actions={
          <Button variant="secondary" asChild>
            <Link to={`${p}?tab=returns`}>All returns</Link>
          </Button>
        }
      />
      <Card className="mb-4 p-4">
        <dl className="grid gap-4 text-sm sm:grid-cols-4">
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
            <dt className="text-slate-500">Returned on</dt>
            <dd className="font-medium">{formatDate(r.postingDate)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Taken from</dt>
            <dd className="font-medium">{r.locationId}</dd>
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
        <Table label="Return lines">
          <THead>
            <Tr>
              <Th>Product</Th>
              <Th>Received on</Th>
              <Th>Credited against</Th>
              <Th className="text-right">Quantity</Th>
              <Th className="text-right">Stock value out</Th>
              <Th className="text-right">Credit</Th>
            </Tr>
          </THead>
          <TBody>
            {r.lines.map((l) => (
              <Tr key={l.lineNo}>
                <Td>
                  <span className="font-mono">{l.sku}</span> {l.productName}
                </Td>
                <Td className="font-mono">
                  <Link
                    to={`${p}/receipts/${l.goodsReceiptId}`}
                    className="text-brand-700 hover:underline"
                  >
                    {l.receiptNumber}
                  </Link>
                </Td>
                <Td>
                  {l.invoiceId ? (
                    <Link
                      to={`${p}/invoices/${l.invoiceId}`}
                      className="font-mono text-brand-700 hover:underline"
                    >
                      {l.invoiceNumber}
                    </Link>
                  ) : (
                    'Not yet invoiced'
                  )}
                </Td>
                <Td className="text-right tabular-nums">{qty(l.qtyMilli, l.unit)}</Td>
                <Td className="text-right tabular-nums">{money(l.costMinor, currency)}</Td>
                <Td className="text-right tabular-nums">{money(l.creditMinor, currency)}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
        <p className="border-t border-slate-100 p-4 text-right text-sm font-semibold tabular-nums">
          Credit {money(r.creditMinor, currency)}
        </p>
      </Card>
    </>
  );
}
