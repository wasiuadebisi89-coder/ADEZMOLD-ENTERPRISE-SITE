import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toDecimalString } from '@bms/domain';
import { BackdateNotice, useBackdate, useToday } from '../../components/BackdateNotice';
import { Button } from '../../components/ui/button';
import { Alert, Card, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input, Select } from '../../components/ui/form';
import { useCompany } from '../../lib/company';
import { money, tryParseMoney, useAccounts } from '../../lib/ledger';
import { outstanding, useOpenInvoices, useSuppliers, type InvoiceRow } from '../../lib/purchasing';
import { useAction } from '../../lib/useAction';
import { formatDate } from '../../lib/utils';
import { usePostingBranches } from './NewJournal';

/** Amount typed against each open invoice, with "oldest first" filling. */
export function AllocationTable({
  invoices,
  values,
  onChange,
  available,
}: {
  invoices: readonly InvoiceRow[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  available: bigint;
}) {
  const { company } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const fillOldest = () => {
    let left = available;
    const next: Record<string, string> = {};
    for (const inv of invoices) {
      const due = BigInt(outstanding(inv));
      const take = left < due ? left : due;
      if (take <= 0n) break;
      next[inv.id] = toDecimalString(take, currency);
      left -= take;
    }
    onChange(next);
  };
  if (invoices.length === 0) {
    return <p className="text-sm text-slate-500">This supplier has no unpaid invoices.</p>;
  }
  return (
    <>
      <div className="relative overflow-x-auto">
        <table className="min-w-full text-sm" aria-label="Allocate to invoices">
          <thead className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2">Invoice</th>
              <th className="px-2 py-2">Their number</th>
              <th className="px-2 py-2">Due</th>
              <th className="px-2 py-2 text-right">Outstanding</th>
              <th className="w-40 px-2 py-2">Pay now</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td className="px-2 py-1.5 font-mono">{inv.number}</td>
                <td className="px-2 py-1.5">{inv.supplierInvoiceNo}</td>
                <td className="px-2 py-1.5">{formatDate(inv.dueDate)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {money(outstanding(inv), currency)}
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    aria-label={`Pay ${inv.number}`}
                    inputMode="decimal"
                    value={values[inv.id] ?? ''}
                    onChange={(e) => onChange({ ...values, [inv.id]: e.target.value })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={fillOldest}>
        Allocate oldest first
      </Button>
    </>
  );
}

export function allocationInput(values: Record<string, string>) {
  return Object.entries(values)
    .filter(([, v]) => v.trim() !== '' && Number(v.replace(/,/g, '')) !== 0)
    .map(([invoiceId, amount]) => ({ invoiceId, amount }));
}

export function allocationTotal(values: Record<string, string>, currency: string) {
  let total = 0n;
  for (const v of Object.values(values)) {
    const parsed = tryParseMoney(v, currency);
    if (parsed === null) return null;
    total += parsed;
  }
  return total;
}

export default function NewSupplierPayment() {
  const { companyId, company } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const today = useToday();
  const suppliers = useSuppliers(companyId);
  const branches = usePostingBranches();
  const accounts = useAccounts(companyId);
  const action = useAction();
  const [supplierId, setSupplierId] = useState(params.get('supplier') ?? '');
  const [branchId, setBranchId] = useState('');
  const [postingDate, setPostingDate] = useState(today);
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const backdate = useBackdate(postingDate);
  const invoices = useOpenInvoices(companyId, supplierId);

  const branch = branchId || branches.data[0]?.id || '';
  const payFrom = accounts.data.filter(
    (a) => a.status === 'active' && a.isPostable && (a.subtype === 'cash' || a.subtype === 'bank'),
  );
  const account = paymentAccountId || payFrom[0]?.id || '';
  const paid = tryParseMoney(amount, currency);
  const allocated = allocationTotal(allocations, currency);
  const advance = paid !== null && allocated !== null ? paid - allocated : null;
  const complete =
    !!supplierId &&
    !!branch &&
    !!account &&
    paid !== null &&
    paid > 0n &&
    advance !== null &&
    advance >= 0n &&
    (!backdate.needsApproval || !!backdate.approvalId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await action.run<{ paymentId: string }>('supplierPayment.post', {
        companyId,
        supplierId,
        branchId: branch,
        postingDate,
        paymentAccountId: account,
        amount,
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        allocations: allocationInput(allocations),
        ...(backdate.approvalId ? { backdateApprovalId: backdate.approvalId } : {}),
      });
      void navigate(`/c/${companyId}/purchases/payments/${res.paymentId}`);
    } catch {
      /* shown below */
    }
  };

  if (suppliers.loading || branches.loading || accounts.loading) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Pay supplier"
        description="Allocate the payment to invoices. Anything not allocated is kept as an advance to use later."
        actions={
          <Button variant="secondary" asChild>
            <Link to={`/c/${companyId}/purchases?tab=payments`}>Cancel</Link>
          </Button>
        }
      />
      <form onSubmit={submit} className="space-y-4" noValidate>
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        <Card className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Supplier">
              <Select
                value={supplierId}
                onChange={(e) => {
                  setSupplierId(e.target.value);
                  setAllocations({});
                }}
              >
                <option value="">Choose a supplier…</option>
                {suppliers.data.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Paid from">
              <Select value={account} onChange={(e) => setPaymentAccountId(e.target.value)}>
                {payFrom.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Amount paid" error={action.error?.fields.amount}>
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label="Date paid" error={action.error?.fields.postingDate}>
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
          {!supplierId ? (
            <p className="text-sm text-slate-500">Choose a supplier to see unpaid invoices.</p>
          ) : invoices.loading ? (
            <Spinner />
          ) : (
            <AllocationTable
              invoices={invoices.data}
              values={allocations}
              onChange={setAllocations}
              available={paid ?? 0n}
            />
          )}
        </Card>
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:justify-end">
          {advance !== null && advance > 0n && (
            <p className="text-sm text-slate-600" role="status">
              {money(advance, currency)} will be kept as an advance to this supplier.
            </p>
          )}
          {advance !== null && advance < 0n && (
            <p className="text-sm font-medium text-red-700" role="status">
              Allocations are {money(-advance, currency)} more than the amount paid.
            </p>
          )}
          <Button type="submit" loading={action.pending} disabled={!complete}>
            Post payment
          </Button>
        </div>
      </form>
    </>
  );
}
