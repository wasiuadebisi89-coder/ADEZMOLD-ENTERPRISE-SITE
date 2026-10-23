import { Plus } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import type { Permission } from '@bms/domain';
import { Button } from '../../components/ui/button';
import { Badge, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { money } from '../../lib/ledger';
import {
  RECEIPT_STATUS,
  outstanding,
  useSupplierDocs,
  type InvoiceRow,
  type PaymentRow,
  type ReceiptRow,
  type ReturnRow,
} from '../../lib/purchasing';
import { cn, formatDate } from '../../lib/utils';
import { useToday } from '../../components/BackdateNotice';

const TABS = [
  {
    id: 'receipts',
    label: 'Goods received',
    create: 'purchasing.receipt.post',
    newLabel: 'Receive goods',
  },
  {
    id: 'invoices',
    label: 'Invoices',
    create: 'purchasing.invoice.post',
    newLabel: 'Record invoice',
  },
  {
    id: 'payments',
    label: 'Payments',
    create: 'purchasing.payment.post',
    newLabel: 'Pay supplier',
  },
  { id: 'returns', label: 'Returns', create: 'purchasing.invoice.post', newLabel: 'Return goods' },
] as const satisfies readonly { id: string; label: string; create: Permission; newLabel: string }[];
type Tab = (typeof TABS)[number]['id'];

function Receipts() {
  const { companyId, company } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const rows = useSupplierDocs<ReceiptRow>(companyId, 'goodsReceipts');
  if (rows.loading) return <Spinner />;
  if (rows.data.length === 0) return <EmptyState title="No goods received yet" />;
  return (
    <Card>
      <Table label="Goods received">
        <THead>
          <Tr>
            <Th>Number</Th>
            <Th>Date</Th>
            <Th>Supplier</Th>
            <Th>Reference</Th>
            <Th className="text-right">Value</Th>
            <Th>Status</Th>
          </Tr>
        </THead>
        <TBody>
          {rows.data.map((r) => (
            <Tr key={r.id}>
              <Td className="font-mono">
                <Link
                  to={`/c/${companyId}/purchases/receipts/${r.id}`}
                  className="text-brand-700 hover:underline"
                >
                  {r.number}
                </Link>
              </Td>
              <Td>{formatDate(r.postingDate)}</Td>
              <Td>{r.supplierName}</Td>
              <Td>{r.reference ?? '—'}</Td>
              <Td className="text-right tabular-nums">{money(r.totalMinor, currency)}</Td>
              <Td>
                <Badge tone={RECEIPT_STATUS[r.invoiceStatus].tone}>
                  {RECEIPT_STATUS[r.invoiceStatus].label}
                </Badge>
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}

function Invoices() {
  const { companyId, company } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const today = useToday();
  const rows = useSupplierDocs<InvoiceRow>(companyId, 'purchaseInvoices');
  if (rows.loading) return <Spinner />;
  if (rows.data.length === 0) return <EmptyState title="No supplier invoices yet" />;
  return (
    <Card>
      <Table label="Supplier invoices">
        <THead>
          <Tr>
            <Th>Number</Th>
            <Th>Supplier</Th>
            <Th>Their number</Th>
            <Th>Date</Th>
            <Th>Due</Th>
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
                  to={`/c/${companyId}/purchases/invoices/${i.id}`}
                  className="text-brand-700 hover:underline"
                >
                  {i.number}
                </Link>
              </Td>
              <Td>{i.supplierName}</Td>
              <Td>{i.supplierInvoiceNo}</Td>
              <Td>{formatDate(i.invoiceDate)}</Td>
              <Td>{formatDate(i.dueDate)}</Td>
              <Td className="text-right tabular-nums">{money(i.totalMinor, currency)}</Td>
              <Td className="text-right tabular-nums">{money(outstanding(i), currency)}</Td>
              <Td>
                {i.status === 'paid' ? (
                  <Badge tone="green">paid</Badge>
                ) : i.dueDate < today ? (
                  <Badge tone="red">overdue</Badge>
                ) : (
                  <Badge tone="amber">open</Badge>
                )}
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}

function Payments() {
  const { companyId, company } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const rows = useSupplierDocs<PaymentRow>(companyId, 'supplierPayments');
  if (rows.loading) return <Spinner />;
  if (rows.data.length === 0) return <EmptyState title="No supplier payments yet" />;
  return (
    <Card>
      <Table label="Supplier payments">
        <THead>
          <Tr>
            <Th>Number</Th>
            <Th>Date</Th>
            <Th>Supplier</Th>
            <Th>Paid from</Th>
            <Th className="text-right">Amount</Th>
            <Th className="text-right">Not yet allocated</Th>
          </Tr>
        </THead>
        <TBody>
          {rows.data.map((x) => (
            <Tr key={x.id}>
              <Td className="font-mono">
                <Link
                  to={`/c/${companyId}/purchases/payments/${x.id}`}
                  className="text-brand-700 hover:underline"
                >
                  {x.number}
                </Link>
              </Td>
              <Td>{formatDate(x.postingDate)}</Td>
              <Td>{x.supplierName}</Td>
              <Td>{x.paymentAccountName}</Td>
              <Td className="text-right tabular-nums">{money(x.amountMinor, currency)}</Td>
              <Td className="text-right tabular-nums">
                {money(x.amountMinor - x.allocatedMinor, currency)}
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}

function Returns() {
  const { companyId, company } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const rows = useSupplierDocs<ReturnRow>(companyId, 'supplierReturns');
  if (rows.loading) return <Spinner />;
  if (rows.data.length === 0) return <EmptyState title="No returns to suppliers yet" />;
  return (
    <Card>
      <Table label="Returns to suppliers">
        <THead>
          <Tr>
            <Th>Number</Th>
            <Th>Date</Th>
            <Th>Supplier</Th>
            <Th>Reason</Th>
            <Th className="text-right">Credit</Th>
          </Tr>
        </THead>
        <TBody>
          {rows.data.map((x) => (
            <Tr key={x.id}>
              <Td className="font-mono">
                <Link
                  to={`/c/${companyId}/purchases/returns/${x.id}`}
                  className="text-brand-700 hover:underline"
                >
                  {x.number}
                </Link>
              </Td>
              <Td>{formatDate(x.postingDate)}</Td>
              <Td>{x.supplierName}</Td>
              <Td className="max-w-xs truncate">{x.reason}</Td>
              <Td className="text-right tabular-nums">{money(x.creditMinor, currency)}</Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}

export default function Purchases() {
  const { companyId, can } = useCompany();
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.some((t) => t.id === params.get('tab'))
    ? (params.get('tab') as Tab)
    : 'receipts';
  const current = TABS.find((t) => t.id === tab)!;
  return (
    <>
      <PageHeader
        title="Purchases"
        description="Goods come in on a receipt, the supplier's invoice is matched to it, and payments and returns settle what is owed."
        actions={
          can(current.create) && (
            <Button asChild>
              <Link to={`/c/${companyId}/purchases/${tab}/new`}>
                <Plus className="size-4" aria-hidden /> {current.newLabel}
              </Link>
            </Button>
          )
        }
      />
      <div
        role="tablist"
        aria-label="Purchase documents"
        className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={t.id === tab}
            onClick={() => setParams({ tab: t.id })}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium',
              t.id === tab
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={current.label}>
        {tab === 'receipts' && <Receipts />}
        {tab === 'invoices' && <Invoices />}
        {tab === 'payments' && <Payments />}
        {tab === 'returns' && <Returns />}
      </div>
    </>
  );
}
