import { doc } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { BackdateNotice, useBackdate, useToday } from '../../components/BackdateNotice';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input, Select } from '../../components/ui/form';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { db } from '../../lib/firebase';
import { useDoc } from '../../lib/firestore-hooks';
import { money } from '../../lib/ledger';
import {
  salesOutstanding,
  useOwnOnly,
  useSalesDocs,
  type CustomerReceiptRow,
  type CustomerRow,
  type SalesInvoiceRow,
  unusedCredit,
  useRaisedDocs,
  type CreditNoteRow,
  type CustomerRefundRow,
} from '../../lib/sales';
import { useAction } from '../../lib/useAction';
import { formatDate } from '../../lib/utils';
import { usePostingBranches } from './NewJournal';
import { CreditNoteTable } from './CreditNoteDetail';
import { CustomerDialog } from './Customers';
import { RefundTable } from './CustomerRefundDetail';

function OpeningBalanceDialog({
  customer,
  onClose,
}: {
  customer: CustomerRow;
  onClose: () => void;
}) {
  const { companyId } = useCompany();
  const today = useToday();
  const branches = usePostingBranches();
  const action = useAction();
  const [branchId, setBranchId] = useState('');
  const [asAtDate, setAsAtDate] = useState(today);
  const [dueDate, setDueDate] = useState('');
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState('');
  const backdate = useBackdate(asAtDate);
  const branch = branchId || branches.data[0]?.id || '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await action.run('customerOpeningBalance.post', {
        companyId,
        customerId: customer.id,
        branchId: branch,
        asAtDate,
        ...(dueDate ? { dueDate } : {}),
        reference,
        amount,
        ...(backdate.approvalId ? { backdateApprovalId: backdate.approvalId } : {}),
      });
      onClose();
    } catch {
      /* shown below */
    }
  };
  const f = action.error?.fields ?? {};
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Opening balance for ${customer.name}`}
      description="An unpaid invoice from before you started using the system. It is owed by the customer and set against opening balance equity."
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Old invoice number" error={f.reference}>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <Field label="Amount still owed" error={f.amount}>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="As at" error={f.asAtDate}>
            <Input
              type="date"
              value={asAtDate}
              max={today}
              onChange={(e) => setAsAtDate(e.target.value)}
            />
          </Field>
          <Field label="Due date (optional)" error={f.dueDate}>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label="Branch">
            <Select value={branch} onChange={(e) => setBranchId(e.target.value)}>
              {branches.data.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <BackdateNotice date={asAtDate} state={backdate} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={action.pending}
            disabled={
              !reference.trim() ||
              !amount.trim() ||
              (backdate.needsApproval && !backdate.approvalId)
            }
          >
            Record balance
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function InvoiceStatus({
  invoice,
  today,
}: {
  invoice: Pick<SalesInvoiceRow, 'status' | 'dueDate'>;
  today: string;
}) {
  if (invoice.status === 'paid') return <Badge tone="green">paid</Badge>;
  if (invoice.dueDate < today) return <Badge tone="red">overdue</Badge>;
  return <Badge tone="amber">open</Badge>;
}

export default function CustomerDetail() {
  const { companyId, company, can } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const today = useToday();
  const own = useOwnOnly();
  const { customerId = '' } = useParams();
  const ref = useMemo(
    () => doc(db, `companies/${companyId}/customers/${customerId}`),
    [companyId, customerId],
  );
  const customer = useDoc<Omit<CustomerRow, 'id'>>(ref);
  const invoices = useSalesDocs<SalesInvoiceRow>(companyId, 'salesInvoices', customerId);
  const receipts = useSalesDocs<CustomerReceiptRow>(companyId, 'customerReceipts', customerId);
  const returns = useRaisedDocs<CreditNoteRow>(companyId, 'creditNotes', { customerId });
  const refunds = useRaisedDocs<CustomerRefundRow>(companyId, 'customerRefunds', { customerId });
  const [editing, setEditing] = useState(false);
  const [opening, setOpening] = useState(false);

  if (customer.loading) return <Spinner />;
  const c = customer.data;
  if (!c) return <EmptyState title="Customer not found" />;
  const p = `/c/${companyId}/sales`;
  const q = `?customer=${customerId}`;
  const available = c.creditLimitMinor - c.balanceMinor + c.advanceMinor;

  return (
    <>
      <PageHeader
        title={`${c.code} · ${c.name}`}
        description={[c.contactName, c.phone, c.email].filter(Boolean).join(' · ') || undefined}
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link to={`/c/${companyId}/customers`}>All customers</Link>
            </Button>
            {can('sales.customers.manage') && (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
            {can('ledger.journal.post') && (
              <Button variant="secondary" onClick={() => setOpening(true)}>
                Opening balance
              </Button>
            )}
            {can('sales.receipt.post') && (
              <Button variant="secondary" asChild>
                <Link to={`${p}/receipts/new${q}`}>Receive payment</Link>
              </Button>
            )}
            {can('sales.invoice.post') && c.status === 'active' && (
              <Button asChild>
                <Link to={`${p}/new${q}`}>New sale</Link>
              </Button>
            )}
          </>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-slate-500">Owes</p>
          <p className="text-xl font-semibold tabular-nums" data-testid="customer-owes">
            {money(c.balanceMinor, currency)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">Paid in advance</p>
          <p className="text-xl font-semibold tabular-nums" data-testid="customer-advance">
            {money(c.advanceMinor, currency)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">Credit limit</p>
          <p className="text-xl font-semibold tabular-nums">
            {c.creditLimitMinor === 0 ? 'Cash only' : money(c.creditLimitMinor, currency)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">Credit available</p>
          <p
            className={`text-xl font-semibold tabular-nums ${available < 0 ? 'text-red-700' : ''}`}
            data-testid="customer-available"
          >
            {money(available, currency)}
          </p>
          <p className="text-xs text-slate-500">
            {c.paymentTermsDays} days ·{' '}
            <Badge tone={c.status === 'active' ? 'green' : 'slate'}>{c.status}</Badge>
          </p>
        </Card>
      </div>
      {own && (
        <p className="mb-3 text-sm text-slate-500">
          You see the sales and receipts you recorded yourself.
        </p>
      )}

      <h2 className="mb-3 text-base font-semibold">Invoices</h2>
      <Card className="mb-6">
        {invoices.loading ? (
          <Spinner />
        ) : invoices.data.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No invoices yet.</p>
        ) : (
          <Table label="Customer invoices">
            <THead>
              <Tr>
                <Th>Number</Th>
                <Th>Date</Th>
                <Th>Due</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Outstanding</Th>
                <Th>Status</Th>
              </Tr>
            </THead>
            <TBody>
              {invoices.data.map((i) => (
                <Tr key={i.id}>
                  <Td className="font-mono">
                    <Link to={`${p}/invoices/${i.id}`} className="text-brand-700 hover:underline">
                      {i.number}
                    </Link>
                  </Td>
                  <Td>{formatDate(i.invoiceDate)}</Td>
                  <Td>{formatDate(i.dueDate)}</Td>
                  <Td className="text-right tabular-nums">{money(i.totalMinor, currency)}</Td>
                  <Td className="text-right tabular-nums">
                    {money(salesOutstanding(i), currency)}
                  </Td>
                  <Td>
                    <InvoiceStatus invoice={i} today={today} />
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <h2 className="mb-3 text-base font-semibold">Payments received</h2>
      <Card>
        {receipts.data.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No payments received yet.</p>
        ) : (
          <Table label="Payments received">
            <THead>
              <Tr>
                <Th>Number</Th>
                <Th>Date</Th>
                <Th>Into</Th>
                <Th className="text-right">Amount</Th>
                <Th className="text-right">Not yet used</Th>
              </Tr>
            </THead>
            <TBody>
              {receipts.data.map((r) => (
                <Tr key={r.id}>
                  <Td className="font-mono">
                    <Link to={`${p}/receipts/${r.id}`} className="text-brand-700 hover:underline">
                      {r.number}
                    </Link>
                  </Td>
                  <Td>{formatDate(r.postingDate)}</Td>
                  <Td>{r.depositAccountName}</Td>
                  <Td className="text-right tabular-nums">{money(r.amountMinor, currency)}</Td>
                  <Td className="text-right tabular-nums">
                    {money(unusedCredit(r.amountMinor, r), currency)}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      {returns.data.length > 0 && (
        <>
          <h2 className="mb-3 mt-6 text-base font-semibold">Returns</h2>
          <Card>
            <CreditNoteTable rows={returns.data as CreditNoteRow[]} />
          </Card>
        </>
      )}
      {refunds.data.length > 0 && (
        <>
          <h2 className="mb-3 mt-6 text-base font-semibold">Refunds</h2>
          <Card>
            <RefundTable rows={refunds.data as CustomerRefundRow[]} />
          </Card>
        </>
      )}
      {editing && <CustomerDialog customer={c} onClose={() => setEditing(false)} />}
      {opening && <OpeningBalanceDialog customer={c} onClose={() => setOpening(false)} />}
    </>
  );
}
