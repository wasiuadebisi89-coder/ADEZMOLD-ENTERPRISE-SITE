import { doc } from 'firebase/firestore';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../../components/ui/button';
import { Badge, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useToday } from '../../components/BackdateNotice';
import { useCompany } from '../../lib/company';
import { db } from '../../lib/firebase';
import { useDoc } from '../../lib/firestore-hooks';
import { qty } from '../../lib/inventory';
import { money } from '../../lib/ledger';
import { outstanding, type InvoiceRow } from '../../lib/purchasing';
import { formatDate } from '../../lib/utils';

const KIND_LABEL = {
  receipt: 'Goods',
  expense: 'Expense',
  landed: 'Added to stock cost',
  opening: 'Opening balance',
} as const;

export default function PurchaseInvoiceDetail() {
  const { companyId, company, can } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const today = useToday();
  const { invoiceId = '' } = useParams();
  const ref = useMemo(
    () => doc(db, `companies/${companyId}/purchaseInvoices/${invoiceId}`),
    [companyId, invoiceId],
  );
  const invoice = useDoc<Omit<InvoiceRow, 'id'>>(ref);
  if (invoice.loading) return <Spinner />;
  const i = invoice.data;
  if (!i) return <EmptyState title="Invoice not found" />;
  const left = outstanding(i);
  const p = `/c/${companyId}/purchases`;

  return (
    <>
      <PageHeader
        title={`Supplier invoice ${i.number}`}
        description={`${i.supplierName} · their number ${i.supplierInvoiceNo}`}
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link to={`${p}?tab=invoices`}>All invoices</Link>
            </Button>
            {can('purchasing.payment.post') && left > 0 && (
              <Button asChild>
                <Link to={`${p}/payments/new?supplier=${i.supplierId}`}>Pay supplier</Link>
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
              {i.status === 'paid' ? (
                <Badge tone="green">paid</Badge>
              ) : i.dueDate < today ? (
                <Badge tone="red">overdue</Badge>
              ) : (
                <Badge tone="amber">open</Badge>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Invoice date</dt>
            <dd className="font-medium">{formatDate(i.invoiceDate)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Due</dt>
            <dd className="font-medium">{formatDate(i.dueDate)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Outstanding</dt>
            <dd className="font-medium tabular-nums" data-testid="invoice-outstanding">
              {money(left, currency)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Paid</dt>
            <dd className="font-medium tabular-nums">{money(i.paidMinor, currency)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Credited by returns</dt>
            <dd className="font-medium tabular-nums">{money(i.creditedMinor, currency)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Supplier</dt>
            <dd>
              <Link
                className="font-medium text-brand-700 underline"
                to={`/c/${companyId}/suppliers/${i.supplierId}`}
              >
                {i.supplierName}
              </Link>
            </dd>
          </div>
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
        </dl>
      </Card>
      <Card>
        <Table label="Invoice lines">
          <THead>
            <Tr>
              <Th>Type</Th>
              <Th>Details</Th>
              <Th className="text-right">Quantity</Th>
              <Th className="text-right">Amount</Th>
              <Th className="text-right">Received cost</Th>
              <Th className="text-right">Added to stock</Th>
              <Th className="text-right">To cost of sales</Th>
            </Tr>
          </THead>
          <TBody>
            {i.lines.map((l) => (
              <Tr key={l.lineNo}>
                <Td>{KIND_LABEL[l.kind]}</Td>
                <Td>
                  {l.description}
                  {l.receiptNumber && (
                    <>
                      {' · '}
                      <Link
                        to={`${p}/receipts/${l.goodsReceiptId}`}
                        className="font-mono text-brand-700 hover:underline"
                      >
                        {l.receiptNumber}
                      </Link>
                    </>
                  )}
                  {l.accountCode && <span className="text-slate-500"> · {l.accountCode}</span>}
                </Td>
                <Td className="text-right tabular-nums">
                  {l.qtyMilli != null && l.unit ? qty(l.qtyMilli, l.unit) : ''}
                </Td>
                <Td className="text-right tabular-nums">{money(l.amountMinor, currency)}</Td>
                <Td className="text-right tabular-nums">
                  {l.grniMinor != null ? money(l.grniMinor, currency) : '—'}
                </Td>
                <Td className="text-right tabular-nums">
                  {l.inventoryMinor != null ? money(l.inventoryMinor, currency) : '—'}
                </Td>
                <Td className="text-right tabular-nums">
                  {l.cogsMinor != null ? money(l.cogsMinor, currency) : '—'}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
        <dl className="space-y-1 border-t border-slate-100 p-4 text-right text-sm tabular-nums">
          {i.inputTaxMinor > 0 && (
            <div>
              <dt className="inline text-slate-500">Input tax </dt>
              <dd className="inline">{money(i.inputTaxMinor, currency)}</dd>
            </div>
          )}
          <div className="font-semibold">
            <dt className="inline">Total </dt>
            <dd className="inline">{money(i.totalMinor, currency)}</dd>
          </div>
        </dl>
      </Card>
    </>
  );
}
