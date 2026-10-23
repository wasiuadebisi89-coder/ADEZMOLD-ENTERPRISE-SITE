import { doc } from 'firebase/firestore';
import { Printer } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { formatRatePercent } from '@bms/domain';
import { useToday } from '../../components/BackdateNotice';
import { Button } from '../../components/ui/button';
import { Badge, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { db } from '../../lib/firebase';
import { useDoc } from '../../lib/firestore-hooks';
import { qty } from '../../lib/inventory';
import { money } from '../../lib/ledger';
import {
  salesOutstanding,
  useRaisedDocs,
  type CreditNoteRow,
  type SalesInvoiceRow,
} from '../../lib/sales';
import { formatDate } from '../../lib/utils';
import { CreditNoteTable } from './CreditNoteDetail';
import { InvoiceStatus } from './CustomerDetail';

function SaleReturns({ invoiceId }: { invoiceId: string }) {
  const { companyId } = useCompany();
  const rows = useRaisedDocs<CreditNoteRow>(companyId, 'creditNotes', { invoiceId });
  if (rows.loading || rows.data.length === 0) return null;
  return (
    <>
      <h2 className="mb-3 mt-6 text-base font-semibold">Returns</h2>
      <Card>
        <CreditNoteTable rows={rows.data as CreditNoteRow[]} />
      </Card>
    </>
  );
}

export default function SalesInvoiceDetail() {
  const { companyId, company, can } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const today = useToday();
  const { invoiceId = '' } = useParams();
  const ref = useMemo(
    () => doc(db, `companies/${companyId}/salesInvoices/${invoiceId}`),
    [companyId, invoiceId],
  );
  const invoice = useDoc<Omit<SalesInvoiceRow, 'id'>>(ref);
  if (invoice.loading) return <Spinner />;
  const i = invoice.data;
  if (!i) return <EmptyState title="Invoice not found" />;
  const left = salesOutstanding(i);
  const p = `/c/${companyId}/sales`;
  const discounts = i.lines.some((l) => l.discountMinor > 0);
  const taxed = i.lines.some((l) => l.taxCode);
  const returned = i.lines.some((l) => l.returnedQtyMilli > 0);
  const returnable = i.kind === 'invoice' && i.lines.some((l) => l.returnedQtyMilli < l.qtyMilli);

  return (
    <>
      <PageHeader
        title={`${i.kind === 'opening' ? 'Opening balance' : 'Sale'} ${i.number}`}
        description={`${i.customerName}${i.reference && i.reference !== i.number ? ` · ${i.reference}` : ''}`}
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link to={p}>All sales</Link>
            </Button>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer className="size-4" aria-hidden /> Print
            </Button>
            {can('sales.receipt.post') && i.customerId && left > 0 && (
              <Button asChild>
                <Link to={`${p}/receipts/new?customer=${i.customerId}`}>Receive payment</Link>
              </Button>
            )}
            {can('sales.return.create') && returnable && (
              <Button variant="secondary" asChild>
                <Link to={`${p}/invoices/${invoiceId}/return`}>Return goods</Link>
              </Button>
            )}
            {can('sales.invoice.post') && (
              <Button asChild>
                <Link to={`${p}/new`}>New sale</Link>
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
              <InvoiceStatus invoice={i} today={today} />
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Date</dt>
            <dd className="font-medium">{formatDate(i.invoiceDate)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Due</dt>
            <dd className="font-medium">{formatDate(i.dueDate)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Outstanding</dt>
            <dd className="font-medium tabular-nums" data-testid="sale-outstanding">
              {money(left, currency)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Customer</dt>
            <dd>
              {i.customerId ? (
                <Link
                  className="font-medium text-brand-700 underline"
                  to={`/c/${companyId}/customers/${i.customerId}`}
                >
                  {i.customerName}
                </Link>
              ) : (
                i.customerName
              )}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Paid</dt>
            <dd className="font-medium tabular-nums">{money(i.paidMinor, currency)}</dd>
          </div>
          {i.creditOverride && (
            <div>
              <dt className="text-slate-500">Credit limit</dt>
              <dd className="font-medium">
                Exceeded,{' '}
                {i.creditOverride.by === 'approval' ? 'approved by a manager' : 'allowed by seller'}
              </dd>
            </div>
          )}
          {i.quotationId && (
            <div>
              <dt className="text-slate-500">From quotation</dt>
              <dd>
                <Link
                  className="font-medium text-brand-700 underline"
                  to={`/c/${companyId}/quotations/${i.quotationId}`}
                >
                  View quotation
                </Link>
              </dd>
            </div>
          )}
          {i.projectId && can('projects.read') && (
            <div>
              <dt className="text-slate-500">Project</dt>
              <dd>
                <Link
                  className="font-medium text-brand-700 underline"
                  to={`/c/${companyId}/projects/${i.projectId}`}
                >
                  View project
                </Link>
              </dd>
            </div>
          )}
          {can('ledger.journal.read') && (
            <div>
              <dt className="text-slate-500">Ledger</dt>
              <dd>
                <Link
                  className="font-medium text-brand-700 underline"
                  to={`/c/${companyId}/journals/${i.journalId}`}
                >
                  View journal
                </Link>
              </dd>
            </div>
          )}
        </dl>
      </Card>
      {i.lines.length > 0 && (
        <Card>
          <Table label="Sale lines">
            <THead>
              <Tr>
                <Th>Product</Th>
                <Th className="text-right">Quantity</Th>
                {returned && <Th className="text-right">Returned</Th>}
                <Th className="text-right">Price</Th>
                {discounts && <Th className="text-right">Discount</Th>}
                {taxed && <Th>Tax</Th>}
                <Th className="text-right">Amount</Th>
              </Tr>
            </THead>
            <TBody>
              {i.lines.map((l) => (
                <Tr key={l.lineNo}>
                  <Td>
                    <span className="font-mono">{l.sku}</span> {l.productName}
                    {l.itemType === 'service' && <Badge tone="blue">Service</Badge>}
                  </Td>
                  <Td className="text-right tabular-nums">{qty(l.qtyMilli, l.unit)}</Td>
                  {returned && (
                    <Td className="text-right tabular-nums">
                      {l.returnedQtyMilli ? qty(l.returnedQtyMilli, l.unit) : '—'}
                    </Td>
                  )}
                  <Td className="text-right tabular-nums">{money(l.unitPriceMinor, currency)}</Td>
                  {discounts && (
                    <Td className="text-right tabular-nums">
                      {l.discountMinor ? money(l.discountMinor, currency) : '—'}
                    </Td>
                  )}
                  {taxed && (
                    <Td>
                      {l.taxCode
                        ? `${l.taxCode} ${formatRatePercent(l.taxRateBp)}%: ${money(l.taxMinor, currency)}`
                        : '—'}
                    </Td>
                  )}
                  <Td className="text-right tabular-nums">{money(l.grossMinor, currency)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <dl className="space-y-1 border-t border-slate-100 p-4 text-right text-sm tabular-nums">
            <div>
              <dt className="inline text-slate-500">Before tax </dt>
              <dd className="inline">{money(i.netMinor, currency)}</dd>
            </div>
            {i.taxMinor > 0 && (
              <div>
                <dt className="inline text-slate-500">
                  Tax{i.pricesIncludeTax ? ' (included in prices)' : ''}{' '}
                </dt>
                <dd className="inline">{money(i.taxMinor, currency)}</dd>
              </div>
            )}
            <div className="font-semibold">
              <dt className="inline">Total </dt>
              <dd className="inline" data-testid="invoice-total">
                {money(i.totalMinor, currency)}
              </dd>
            </div>
            {i.payments.map((pay) => (
              <div key={pay.accountId}>
                <dt className="inline text-slate-500">Paid into {pay.accountName} </dt>
                <dd className="inline">{money(pay.amountMinor, currency)}</dd>
              </div>
            ))}
            {(i.returnedMinor ?? 0) > 0 && (
              <div>
                <dt className="inline text-slate-500">Credited for returns </dt>
                <dd className="inline" data-testid="invoice-returned">
                  {money(i.returnedMinor ?? 0, currency)}
                </dd>
              </div>
            )}
          </dl>
        </Card>
      )}
      <SaleReturns invoiceId={invoiceId} />
    </>
  );
}
