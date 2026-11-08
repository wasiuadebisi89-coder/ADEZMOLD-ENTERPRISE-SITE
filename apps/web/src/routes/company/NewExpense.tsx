import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { addDays } from '@bms/domain';
import { BackdateNotice, useBackdate, useToday } from '../../components/BackdateNotice';
import { ProjectField } from '../../components/ProjectField';
import { Button } from '../../components/ui/button';
import { Alert, Card, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input, Select, Textarea } from '../../components/ui/form';
import { useCompany } from '../../lib/company';
import { expenseAccounts } from '../../lib/expenses';
import {
  money,
  moneyAccountLabel,
  moneyAccounts,
  tryParseMoney,
  useAccounts,
} from '../../lib/ledger';
import { useSuppliers } from '../../lib/purchasing';
import { useAction } from '../../lib/useAction';
import { formatDate } from '../../lib/utils';
import { usePostingBranches } from './NewJournal';

interface LineDraft {
  key: string;
  accountId: string;
  description: string;
  amount: string;
}

const newLine = (): LineDraft => ({
  key: crypto.randomUUID(),
  accountId: '',
  description: '',
  amount: '',
});

type Mode = 'paid' | 'credit';

export default function NewExpense() {
  const { companyId, company, can } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const navigate = useNavigate();
  const today = useToday();
  const branches = usePostingBranches();
  const accounts = useAccounts(companyId);
  const suppliers = useSuppliers(companyId);
  const action = useAction();

  const canPay = can('purchasing.payment.post');
  const canOwe = can('purchasing.invoice.post');
  const [mode, setMode] = useState<Mode>(canPay ? 'paid' : 'credit');
  const [expenseDate, setExpenseDate] = useState(today);
  const [branchId, setBranchId] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [payee, setPayee] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [reference, setReference] = useState('');
  const [inputTax, setInputTax] = useState('');
  const [memo, setMemo] = useState('');
  const [projectId, setProjectId] = useState('');
  const backdate = useBackdate(expenseDate);

  const branch = branchId || branches.data[0]?.id || '';
  const chargeTo = expenseAccounts(accounts.data);
  const payFrom = moneyAccounts(accounts.data);
  const account = paymentAccountId || payFrom[0]?.id || '';
  const activeSuppliers = suppliers.data.filter((s) => s.status === 'active');
  const supplier = suppliers.data.find((s) => s.id === supplierId);
  const setLine = (i: number, patch: Partial<LineDraft>) =>
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const amounts = lines.map((l) => tryParseMoney(l.amount, currency));
  const tax = tryParseMoney(inputTax, currency);
  const total = amounts.reduce<bigint>((s, a) => s + (a ?? 0n), 0n) + (tax ?? 0n);
  const linesOk = lines.every(
    (l, i) => !!l.accountId && l.description.trim().length >= 2 && (amounts[i] ?? 0n) > 0n,
  );
  const complete =
    !!branch &&
    linesOk &&
    tax !== null &&
    (mode === 'paid' ? !!account && (!!supplierId || payee.trim().length >= 2) : !!supplierId) &&
    (!backdate.needsApproval || !!backdate.approvalId);
  const defaultDue = supplier ? addDays(expenseDate, supplier.paymentTermsDays) : '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await action.run<{ expenseId: string }>('expense.post', {
        companyId,
        branchId: branch,
        expenseDate,
        lines: lines.map((l) => ({
          accountId: l.accountId,
          description: l.description.trim(),
          amount: l.amount,
        })),
        ...(inputTax.trim() ? { inputTax } : {}),
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        ...(memo.trim() ? { memo: memo.trim() } : {}),
        payment:
          mode === 'paid'
            ? {
                mode,
                paymentAccountId: account,
                ...(supplierId ? { supplierId } : { payee: payee.trim() }),
              }
            : { mode, supplierId, ...(dueDate ? { dueDate } : {}) },
        ...(projectId ? { projectId } : {}),
        ...(backdate.approvalId ? { backdateApprovalId: backdate.approvalId } : {}),
      });
      void navigate(`/c/${companyId}/expenses/${res.expenseId}`);
    } catch {
      /* shown below */
    }
  };

  if (branches.loading || accounts.loading || suppliers.loading) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Record expense"
        description="For things the company uses up: office supplies, services, repairs and replacement parts. The books are updated for you."
        actions={
          <Button variant="secondary" asChild>
            <Link to={`/c/${companyId}/expenses`}>Cancel</Link>
          </Button>
        }
      />
      <form onSubmit={submit} className="space-y-4" noValidate>
        {action.error && <Alert tone="error">{action.error.message}</Alert>}

        <Card className="p-4">
          <h2 className="mb-1 text-base font-semibold">What was it for?</h2>
          <p className="mb-3 text-sm text-slate-500">
            Choose the kind of expense for each item. Ask your accountant to add a new kind to the
            chart of accounts if none fits.
          </p>
          {lines.map((l, i) => {
            const n = i + 1;
            return (
              <div
                key={l.key}
                className="mb-3 grid gap-3 rounded-md border border-slate-200 p-3 sm:grid-cols-12"
              >
                <Field label={`Item ${n} expense type`} className="sm:col-span-4">
                  <Select
                    value={l.accountId}
                    onChange={(e) => setLine(i, { accountId: e.target.value })}
                  >
                    <option value="">Choose…</option>
                    {chargeTo.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} · {a.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={`Item ${n} description`} className="sm:col-span-5">
                  <Input
                    value={l.description}
                    onChange={(e) => setLine(i, { description: e.target.value })}
                    placeholder="e.g. Printer toner, generator repair"
                    maxLength={200}
                  />
                </Field>
                <Field label={`Item ${n} amount`} className="sm:col-span-3">
                  <Input
                    inputMode="decimal"
                    value={l.amount}
                    onChange={(e) => setLine(i, { amount: e.target.value })}
                  />
                </Field>
                {lines.length > 1 && (
                  <div className="flex sm:col-span-12 sm:justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setLines(lines.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="size-4" aria-hidden /> Remove item {n}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setLines([...lines, newLine()])}
          >
            <Plus className="size-4" aria-hidden /> Add item
          </Button>
          {can('assets.read') && (
            <p className="mt-3 text-sm text-slate-500">
              Bought equipment, furniture or a vehicle the business will use for more than a year?
              That is an asset, not an expense:{' '}
              {can('assets.manage') ? (
                <Link
                  to={`/c/${companyId}/fixed-assets/new`}
                  className="font-medium text-brand-700 underline"
                >
                  record it under Fixed assets
                </Link>
              ) : (
                'ask your accountant to record it under Fixed assets'
              )}
              .
            </p>
          )}
        </Card>

        <Card className="space-y-4 p-4">
          <h2 className="text-base font-semibold">How was it paid?</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Payment">
              <Select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
                {canPay && <option value="paid">Paid now from cash or bank</option>}
                {canOwe && <option value="credit">On credit: pay the supplier later</option>}
              </Select>
            </Field>
            {mode === 'paid' ? (
              <>
                <Field label="Paid from">
                  <Select value={account} onChange={(e) => setPaymentAccountId(e.target.value)}>
                    {payFrom.map((a) => (
                      <option key={a.id} value={a.id}>
                        {moneyAccountLabel(a)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Supplier (optional)">
                  <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                    <option value="">Not a supplier on file</option>
                    {activeSuppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} · {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                {!supplierId && (
                  <Field
                    label="Paid to"
                    hint="The shop, artisan or person you paid"
                    error={action.error?.fields.payee}
                  >
                    <Input
                      value={payee}
                      onChange={(e) => setPayee(e.target.value)}
                      maxLength={120}
                    />
                  </Field>
                )}
              </>
            ) : (
              <>
                <Field label="Supplier">
                  <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                    <option value="">Choose a supplier…</option>
                    {activeSuppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} · {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="Due date (optional)"
                  hint={defaultDue ? `Leave empty for ${formatDate(defaultDue)}` : undefined}
                >
                  <Input
                    type="date"
                    value={dueDate}
                    min={expenseDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </Field>
              </>
            )}
          </div>
          {mode === 'paid' && payFrom.length === 0 && (
            <Alert tone="error">There is no active cash or bank account to pay from.</Alert>
          )}
          {mode === 'credit' && (
            <p className="text-sm text-slate-500">
              A supplier invoice is recorded for this, so it shows in what you owe and can be paid
              from Purchases.{' '}
              {activeSuppliers.length === 0 && 'Add the supplier under Suppliers first.'}
            </p>
          )}
        </Card>

        <Card className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Date" error={action.error?.fields.expenseDate}>
              <Input
                type="date"
                value={expenseDate}
                max={today}
                onChange={(e) => setExpenseDate(e.target.value)}
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
            <Field
              label="Receipt or invoice number (optional)"
              hint={mode === 'credit' ? "The supplier's invoice number" : undefined}
            >
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                maxLength={60}
              />
            </Field>
            <Field
              label="Input tax (optional)"
              hint="Recoverable tax shown on the receipt. Nothing is calculated for you."
              error={action.error?.fields.inputTax}
            >
              <Input
                inputMode="decimal"
                value={inputTax}
                onChange={(e) => setInputTax(e.target.value)}
              />
            </Field>
            <ProjectField value={projectId} onChange={setProjectId} />
          </div>
          <Field label="Note (optional)">
            <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={300} />
          </Field>
          <BackdateNotice date={expenseDate} state={backdate} />
        </Card>

        <div className="flex flex-col items-end gap-3 sm:flex-row sm:items-center sm:justify-end">
          <p className="text-lg font-semibold tabular-nums" data-testid="expense-total">
            Total {money(total, currency)}
          </p>
          <Button type="submit" loading={action.pending} disabled={!complete}>
            Post expense
          </Button>
        </div>
      </form>
    </>
  );
}
