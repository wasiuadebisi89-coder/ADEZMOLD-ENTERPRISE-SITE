import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  AllocationTable,
  allocationInput,
  allocationTotal,
} from '../../components/AllocationTable';
import { BackdateNotice, useBackdate, useToday } from '../../components/BackdateNotice';
import { Button } from '../../components/ui/button';
import { Alert, Card, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input, Select } from '../../components/ui/form';
import { useCompany } from '../../lib/company';
import { money, tryParseMoney, useAccounts } from '../../lib/ledger';
import {
  salesOutstanding,
  useCustomers,
  useOpenSalesInvoices,
  useOwnOnly,
  type SalesInvoiceRow,
} from '../../lib/sales';
import { useAction } from '../../lib/useAction';
import { usePostingBranches } from './NewJournal';

export const openInvoices = (rows: readonly SalesInvoiceRow[]) =>
  rows.map((i) => ({
    id: i.id,
    number: i.number,
    reference: i.reference,
    dueDate: i.dueDate,
    outstandingMinor: salesOutstanding(i),
  }));

export default function NewCustomerReceipt() {
  const { companyId, company } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const today = useToday();
  const own = useOwnOnly();
  const customers = useCustomers(companyId);
  const branches = usePostingBranches();
  const accounts = useAccounts(companyId);
  const action = useAction();
  const [customerId, setCustomerId] = useState(params.get('customer') ?? '');
  const [branchId, setBranchId] = useState('');
  const [postingDate, setPostingDate] = useState(today);
  const [depositAccountId, setDepositAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const backdate = useBackdate(postingDate);
  const invoices = useOpenSalesInvoices(companyId, customerId);

  const branch = branchId || branches.data[0]?.id || '';
  const into = accounts.data.filter(
    (a) => a.status === 'active' && a.isPostable && (a.subtype === 'cash' || a.subtype === 'bank'),
  );
  const account = depositAccountId || into[0]?.id || '';
  const received = tryParseMoney(amount, currency);
  const allocated = allocationTotal(allocations, currency);
  const advance = received !== null && allocated !== null ? received - allocated : null;
  const complete =
    !!customerId &&
    !!branch &&
    !!account &&
    received !== null &&
    received > 0n &&
    advance !== null &&
    advance >= 0n &&
    (!backdate.needsApproval || !!backdate.approvalId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await action.run<{ receiptId: string }>('customerReceipt.post', {
        companyId,
        customerId,
        branchId: branch,
        postingDate,
        depositAccountId: account,
        amount,
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        allocations: allocationInput(allocations),
        ...(backdate.approvalId ? { backdateApprovalId: backdate.approvalId } : {}),
      });
      void navigate(`/c/${companyId}/sales/receipts/${res.receiptId}`);
    } catch {
      /* shown below */
    }
  };

  if (customers.loading || branches.loading || accounts.loading) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Receive payment"
        description="Allocate the money to the customer's invoices. Anything not allocated is kept as an advance to use later."
        actions={
          <Button variant="secondary" asChild>
            <Link to={`/c/${companyId}/sales?tab=receipts`}>Cancel</Link>
          </Button>
        }
      />
      <form onSubmit={submit} className="space-y-4" noValidate>
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        <Card className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Customer">
              <Select
                value={customerId}
                onChange={(e) => {
                  setCustomerId(e.target.value);
                  setAllocations({});
                }}
              >
                <option value="">Choose a customer…</option>
                {customers.data.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Received into">
              <Select value={account} onChange={(e) => setDepositAccountId(e.target.value)}>
                {into.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Amount received" error={action.error?.fields.amount}>
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label="Date received" error={action.error?.fields.postingDate}>
              <Input
                type="date"
                value={postingDate}
                max={today}
                onChange={(e) => setPostingDate(e.target.value)}
              />
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
            <Field label="Reference (optional)">
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                maxLength={60}
              />
            </Field>
          </div>
          <BackdateNotice date={postingDate} state={backdate} />
        </Card>
        <Card className="p-4">
          <h2 className="mb-3 text-base font-semibold">Invoices</h2>
          {own && (
            <p className="mb-3 text-sm text-slate-500">
              Only invoices you recorded are shown. Anything not allocated is kept as an advance
              that an accountant can apply.
            </p>
          )}
          {!customerId ? (
            <p className="text-sm text-slate-500">Choose a customer to see unpaid invoices.</p>
          ) : invoices.loading ? (
            <Spinner />
          ) : (
            <AllocationTable
              invoices={openInvoices(invoices.data)}
              values={allocations}
              onChange={setAllocations}
              available={received ?? 0n}
              referenceLabel="Reference"
              emptyText="This customer has no unpaid invoices."
              actionLabel="Settle"
            />
          )}
        </Card>
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:justify-end">
          {advance !== null && advance > 0n && (
            <p className="text-sm text-slate-600" role="status">
              {money(advance, currency)} will be kept as an advance from this customer.
            </p>
          )}
          {advance !== null && advance < 0n && (
            <p className="text-sm font-medium text-red-700" role="status">
              Allocations are {money(-advance, currency)} more than the amount received.
            </p>
          )}
          <Button type="submit" loading={action.pending} disabled={!complete}>
            Post receipt
          </Button>
        </div>
      </form>
    </>
  );
}
