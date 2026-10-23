import { doc } from 'firebase/firestore';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { formatQuantity } from '@bms/domain';
import { useToday } from '../../components/BackdateNotice';
import { Button } from '../../components/ui/button';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { db } from '../../lib/firebase';
import { useDoc } from '../../lib/firestore-hooks';
import { money } from '../../lib/ledger';
import { QUOTATION_TONE, type QuotationRow, type QuotationStatus } from '../../lib/services';
import { useAction } from '../../lib/useAction';
import { formatDate } from '../../lib/utils';

type Settable = 'sent' | 'accepted' | 'declined' | 'cancelled';

const ACTIONS: Record<QuotationStatus, { status: Settable; label: string }[]> = {
  draft: [
    { status: 'sent', label: 'Mark as sent' },
    { status: 'accepted', label: 'Mark as accepted' },
    { status: 'cancelled', label: 'Cancel' },
  ],
  sent: [
    { status: 'accepted', label: 'Mark as accepted' },
    { status: 'declined', label: 'Mark as declined' },
    { status: 'cancelled', label: 'Cancel' },
  ],
  accepted: [{ status: 'cancelled', label: 'Cancel' }],
  declined: [],
  cancelled: [],
  invoiced: [],
};

export default function QuotationDetail() {
  const { companyId, company, can } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const today = useToday();
  const { quotationId = '' } = useParams();
  const ref = useMemo(
    () => doc(db, `companies/${companyId}/quotations/${quotationId}`),
    [companyId, quotationId],
  );
  const quote = useDoc<Omit<QuotationRow, 'id'>>(ref);
  const action = useAction();
  if (quote.loading) return <Spinner />;
  const q = quote.data;
  if (!q) return <EmptyState title="Quotation not found" />;
  const canManage = can('sales.quotation.manage');
  const invoiceable = (q.status === 'sent' || q.status === 'accepted') && can('sales.invoice.post');
  const expired = q.validUntil < today && q.status !== 'invoiced';
  return (
    <>
      <PageHeader
        title={`Quotation ${q.number}`}
        description={`For ${q.customerName}, dated ${formatDate(q.quoteDate)}, valid until ${formatDate(q.validUntil)}.`}
        actions={
          <>
            {invoiceable && (
              <Button asChild>
                <Link to={`/c/${companyId}/sales/new?quotation=${quotationId}`}>
                  Create invoice
                </Link>
              </Button>
            )}
            {canManage &&
              ACTIONS[q.status].map((a) => (
                <Button
                  key={a.status}
                  variant="secondary"
                  loading={action.pending}
                  onClick={() =>
                    void action
                      .run('quotation.setStatus', { companyId, quotationId, status: a.status })
                      .catch(() => undefined)
                  }
                >
                  {a.label}
                </Button>
              ))}
            <Button variant="secondary" asChild>
              <Link to={`/c/${companyId}/quotations`}>All quotations</Link>
            </Button>
          </>
        }
      />
      <p className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={QUOTATION_TONE[q.status]}>{q.status}</Badge>
        {expired && <Badge tone="amber">Past its validity date</Badge>}
        {q.invoiceId && (
          <Link
            to={`/c/${companyId}/sales/invoices/${q.invoiceId}`}
            className="text-brand-700 hover:underline"
          >
            Invoiced as {q.invoiceNumber}
          </Link>
        )}
      </p>
      {action.error && (
        <Alert tone="error" className="mb-4">
          {action.error.message}
        </Alert>
      )}
      {q.memo && <p className="mb-4 text-sm text-slate-700">{q.memo}</p>}
      <Card>
        <Table label="Quotation lines">
          <THead>
            <Tr>
              <Th>Item</Th>
              <Th className="text-right">Quantity</Th>
              <Th className="text-right">Price</Th>
              <Th className="text-right">Discount</Th>
              <Th>Tax</Th>
              <Th className="text-right">Amount</Th>
            </Tr>
          </THead>
          <TBody>
            {q.lines.map((l) => (
              <Tr key={l.lineNo}>
                <Td>
                  {l.sku} · {l.productName}{' '}
                  {l.itemType === 'service' && <Badge tone="blue">Service</Badge>}
                </Td>
                <Td className="text-right tabular-nums">
                  {formatQuantity(l.qtyMilli, l.unit)} {l.unit}
                </Td>
                <Td className="text-right tabular-nums">{money(l.unitPriceMinor, currency)}</Td>
                <Td className="text-right tabular-nums">
                  {l.discountMinor ? money(l.discountMinor, currency) : '—'}
                </Td>
                <Td>{l.taxCode ?? '—'}</Td>
                <Td className="text-right tabular-nums">{money(l.grossMinor, currency)}</Td>
              </Tr>
            ))}
            {q.taxMinor > 0 && (
              <Tr>
                <Td colSpan={5} className="text-right text-slate-500">
                  Tax
                </Td>
                <Td className="text-right tabular-nums">{money(q.taxMinor, currency)}</Td>
              </Tr>
            )}
            <Tr>
              <Td colSpan={5} className="text-right font-semibold">
                Total
              </Td>
              <Td className="text-right font-semibold tabular-nums">
                {money(q.totalMinor, currency)}
              </Td>
            </Tr>
          </TBody>
        </Table>
      </Card>
    </>
  );
}
