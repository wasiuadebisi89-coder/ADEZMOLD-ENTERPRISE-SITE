import { Plus } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import type { Permission } from '@bms/domain';
import { useToday } from '../../components/BackdateNotice';
import { Button } from '../../components/ui/button';
import { Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { money } from '../../lib/ledger';
import {
  salesOutstanding,
  unusedCredit,
  useOwnOnly,
  useRaisedDocs,
  useSalesDocs,
  type CreditNoteRow,
  type CustomerReceiptRow,
  type CustomerRefundRow,
  type SalesInvoiceRow,
} from '../../lib/sales';
import { cn, formatDate } from '../../lib/utils';
import { CreditNoteTable } from './CreditNoteDetail';
import { InvoiceStatus } from './CustomerDetail';
import { RefundTable } from './CustomerRefundDetail';

const TABS = [
  { id: 'invoices', label: 'Sales', create: 'sales.invoice.post', newLabel: 'New sale', to: 'new' },
  {
    id: 'receipts',
    label: 'Payments received',
    create: 'sales.receipt.post',
    newLabel: 'Receive payment',
    to: 'receipts/new',
  },
  // Returns start from the sale, refunds from a payment or return.
  { id: 'returns', label: 'Returns' },
  { id: 'refunds', label: 'Refunds' },
] as const satisfies readonly {
  id: string;
  label: string;
  create?: Permission;
  newLabel?: string;
  to?: string;
}[];
type Tab = (typeof TABS)[number]['id'];

function Invoices() {
  const { companyId, company } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const today = useToday();
  const rows = useSalesDocs<SalesInvoiceRow>(companyId, 'salesInvoices');
  if (rows.loading) return <Spinner />;
  if (rows.data.length === 0) return <EmptyState title="No sales yet" />;
  return (
    <Card>
      <Table label="Sales">
        <THead>
          <Tr>
            <Th>Number</Th>
            <Th>Date</Th>
            <Th>Customer</Th>
            <Th className="text-right">Total</Th>
            <Th className="text-right">Outstanding</Th>
            <Th>Status</Th>
          </Tr>
        </THead>
        <TBody>
          {rows.data.map((i) => (
            <Tr key={i.id}>
              <Td className="font-mono">
                <Link
                  to={`/c/${companyId}/sales/invoices/${i.id}`}
                  className="text-brand-700 hover:underline"
                >
                  {i.number}
                </Link>
              </Td>
              <Td>{formatDate(i.invoiceDate)}</Td>
              <Td>{i.customerName}</Td>
              <Td className="text-right tabular-nums">{money(i.totalMinor, currency)}</Td>
              <Td className="text-right tabular-nums">{money(salesOutstanding(i), currency)}</Td>
              <Td>
                <InvoiceStatus invoice={i} today={today} />
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}

function Receipts() {
  const { companyId, company } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const rows = useSalesDocs<CustomerReceiptRow>(companyId, 'customerReceipts');
  if (rows.loading) return <Spinner />;
  if (rows.data.length === 0) return <EmptyState title="No payments received yet" />;
  return (
    <Card>
      <Table label="Payments received">
        <THead>
          <Tr>
            <Th>Number</Th>
            <Th>Date</Th>
            <Th>Customer</Th>
            <Th>Into</Th>
            <Th className="text-right">Amount</Th>
            <Th className="text-right">Not yet allocated</Th>
          </Tr>
        </THead>
        <TBody>
          {rows.data.map((r) => (
            <Tr key={r.id}>
              <Td className="font-mono">
                <Link
                  to={`/c/${companyId}/sales/receipts/${r.id}`}
                  className="text-brand-700 hover:underline"
                >
                  {r.number}
                </Link>
              </Td>
              <Td>{formatDate(r.postingDate)}</Td>
              <Td>{r.customerName}</Td>
              <Td>{r.depositAccountName}</Td>
              <Td className="text-right tabular-nums">{money(r.amountMinor, currency)}</Td>
              <Td className="text-right tabular-nums">
                {money(unusedCredit(r.amountMinor, r), currency)}
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}

function Returns() {
  const { companyId } = useCompany();
  const rows = useRaisedDocs<CreditNoteRow>(companyId, 'creditNotes');
  if (rows.loading) return <Spinner />;
  if (rows.data.length === 0) {
    return (
      <EmptyState
        title="No returns yet"
        description="To take goods back, open the sale and choose Return goods."
      />
    );
  }
  return (
    <Card>
      <CreditNoteTable rows={rows.data as CreditNoteRow[]} />
    </Card>
  );
}

function Refunds() {
  const { companyId } = useCompany();
  const rows = useRaisedDocs<CustomerRefundRow>(companyId, 'customerRefunds');
  if (rows.loading) return <Spinner />;
  if (rows.data.length === 0) {
    return (
      <EmptyState
        title="No refunds yet"
        description="Refunds pay back money a customer has not used, from a payment or a return."
      />
    );
  }
  return (
    <Card>
      <RefundTable rows={rows.data as CustomerRefundRow[]} />
    </Card>
  );
}

const PANELS: Record<Tab, () => React.JSX.Element> = {
  invoices: Invoices,
  receipts: Receipts,
  returns: Returns,
  refunds: Refunds,
};

export default function Sales() {
  const { companyId, can } = useCompany();
  const own = useOwnOnly();
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.some((t) => t.id === params.get('tab'))
    ? (params.get('tab') as Tab)
    : 'invoices';
  const current = TABS.find((t) => t.id === tab)!;
  const Panel = PANELS[tab];

  return (
    <>
      <PageHeader
        title="Sales"
        description={
          own
            ? 'The sales, payments, returns and refunds you recorded.'
            : 'Sales at the till and on credit, payments received, returns and refunds.'
        }
        actions={
          'create' in current &&
          can(current.create) && (
            <Button asChild>
              <Link to={`/c/${companyId}/sales/${current.to}`}>
                <Plus className="size-4" aria-hidden /> {current.newLabel}
              </Link>
            </Button>
          )
        }
      />
      <div role="tablist" aria-label="Sales records" className="mb-4 flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={t.id === tab}
            onClick={() => setParams({ tab: t.id })}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium',
              t.id === tab
                ? 'border-brand-600 text-brand-800'
                : 'border-transparent text-slate-600 hover:text-slate-900',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <Panel />
    </>
  );
}
