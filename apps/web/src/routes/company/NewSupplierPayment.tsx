import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { BackdateNotice, useBackdate, useToday } from '../../components/BackdateNotice';
import { Button } from '../../components/ui/button';
import { Alert, Card, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input, Select } from '../../components/ui/form';
import { useCompany } from '../../lib/company';
import {
  AllocationTable,
  allocationInput,
  allocationTotal,
} from '../../components/AllocationTable';
import { money, tryParseMoney, useAccounts } from '../../lib/ledger';
import { outstanding, useOpenInvoices, useSuppliers } from '../../lib/purchasing';
import { useAction } from '../../lib/useAction';
import { usePostingBranches } from './NewJournal';

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
              invoices={invoices.data.map((i) => ({
                id: i.id,
                number: i.number,
                reference: i.supplierInvoiceNo,
                dueDate: i.dueDate,
                outstandingMinor: outstanding(i),
              }))}
              referenceLabel="Their number"
              emptyText="This supplier has no unpaid invoices."
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
