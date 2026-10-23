import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { addDays, formatQuantity, toDecimalString } from '@bms/domain';
import { BackdateNotice, useBackdate, useToday } from '../../components/BackdateNotice';
import { ProjectField } from '../../components/ProjectField';
import { Button } from '../../components/ui/button';
import { Alert, Card, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input, Select } from '../../components/ui/form';
import { useCompany } from '../../lib/company';
import { qty } from '../../lib/inventory';
import { money, postableForJournals, tryParseMoney, useAccounts } from '../../lib/ledger';
import {
  useOpenReceipts,
  useSupplierDocs,
  useSuppliers,
  type ReceiptLineRow,
  type ReceiptRow,
} from '../../lib/purchasing';
import { useAction } from '../../lib/useAction';
import { formatDate } from '../../lib/utils';
import { usePostingBranches } from './NewJournal';

interface GoodsDraft {
  include: boolean;
  quantity: string;
  amount: string;
}

interface ChargeDraft {
  key: string;
  kind: 'expense' | 'landed';
  accountId: string;
  goodsReceiptId: string;
  basis: 'value' | 'quantity';
  description: string;
  amount: string;
}

const newCharge = (): ChargeDraft => ({
  key: crypto.randomUUID(),
  kind: 'expense',
  accountId: '',
  goodsReceiptId: '',
  basis: 'value',
  description: '',
  amount: '',
});

const goodsKey = (receiptId: string, lineNo: number) => `${receiptId}:${lineNo}`;

export default function NewPurchaseInvoice() {
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
  const [branchId, setBranchId] = useState(params.get('branch') ?? '');
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [dueDate, setDueDate] = useState('');
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('');
  const [inputTax, setInputTax] = useState('');
  const [projectId, setProjectId] = useState('');
  const [goods, setGoods] = useState<Record<string, GoodsDraft>>({});
  const [charges, setCharges] = useState<ChargeDraft[]>([]);
  const backdate = useBackdate(invoiceDate);

  const openReceipts = useOpenReceipts(companyId, supplierId);
  const allReceipts = useSupplierDocs<ReceiptRow>(companyId, 'goodsReceipts');
  const branch = branchId || branches.data[0]?.id || '';
  const supplier = suppliers.data.find((s) => s.id === supplierId);
  const receipts = openReceipts.data.filter((r) => r.branchId === branch);
  const landedTargets = allReceipts.data.filter((r) => r.branchId === branch);
  const expenseAccounts = postableForJournals(accounts.data).filter(
    (a) => a.subtype !== 'openingBalanceEquity' && a.subtype !== 'retainedEarnings',
  );

  const remaining = (l: ReceiptLineRow) => ({
    qty: l.qtyMilli - l.clearedQtyMilli,
    value: l.valueMinor - l.clearedValueMinor,
  });
  const toggle = (r: ReceiptRow, l: ReceiptLineRow, include: boolean) => {
    const left = remaining(l);
    setGoods({
      ...goods,
      [goodsKey(r.id, l.lineNo)]: include
        ? {
            include,
            quantity: formatQuantity(left.qty, l.unit).replace(/,/g, ''),
            amount: toDecimalString(BigInt(left.value), currency),
          }
        : { include, quantity: '', amount: '' },
    });
  };
  const setGood = (key: string, patch: Partial<GoodsDraft>) =>
    setGoods({ ...goods, [key]: { ...goods[key]!, ...patch } });
  const setCharge = (i: number, patch: Partial<ChargeDraft>) =>
    setCharges(charges.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  const goodsLines = receipts.flatMap((r) =>
    r.lines
      .filter((l) => goods[goodsKey(r.id, l.lineNo)]?.include)
      .map((l) => ({ r, l, d: goods[goodsKey(r.id, l.lineNo)]! })),
  );
  const amounts = [
    ...goodsLines.map((g) => tryParseMoney(g.d.amount, currency)),
    ...charges.map((c) => tryParseMoney(c.amount, currency)),
  ];
  const tax = tryParseMoney(inputTax, currency);
  const total = amounts.reduce<bigint>((s, a) => s + (a ?? 0n), 0n) + (tax ?? 0n);
  const defaultDue = supplier ? addDays(invoiceDate, supplier.paymentTermsDays) : '';
  const complete =
    !!supplierId &&
    !!branch &&
    supplierInvoiceNo.trim().length > 0 &&
    goodsLines.length + charges.length > 0 &&
    goodsLines.every((g) => g.d.quantity.trim()) &&
    charges.every(
      (c) =>
        c.description.trim().length >= 2 &&
        (c.kind === 'expense' ? !!c.accountId : !!c.goodsReceiptId),
    ) &&
    amounts.every((a) => a !== null) &&
    tax !== null &&
    total > 0n &&
    (!backdate.needsApproval || !!backdate.approvalId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await action.run<{ invoiceId: string }>('purchaseInvoice.post', {
        companyId,
        supplierId,
        branchId: branch,
        invoiceDate,
        ...(dueDate ? { dueDate } : {}),
        supplierInvoiceNo: supplierInvoiceNo.trim(),
        lines: [
          ...goodsLines.map((g) => ({
            kind: 'receipt' as const,
            goodsReceiptId: g.r.id,
            lineNo: g.l.lineNo,
            quantity: g.d.quantity,
            amount: g.d.amount,
          })),
          ...charges.map((c) =>
            c.kind === 'expense'
              ? {
                  kind: 'expense' as const,
                  accountId: c.accountId,
                  description: c.description.trim(),
                  amount: c.amount,
                }
              : {
                  kind: 'landed' as const,
                  goodsReceiptId: c.goodsReceiptId,
                  description: c.description.trim(),
                  basis: c.basis,
                  amount: c.amount,
                },
          ),
        ],
        ...(inputTax.trim() ? { inputTax } : {}),
        ...(projectId ? { projectId } : {}),
        ...(backdate.approvalId ? { backdateApprovalId: backdate.approvalId } : {}),
      });
      void navigate(`/c/${companyId}/purchases/invoices/${res.invoiceId}`);
    } catch {
      /* shown below */
    }
  };

  if (suppliers.loading || branches.loading || accounts.loading) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Record supplier invoice"
        description="Match the invoice to goods already received, and add any other charges on it."
        actions={
          <Button variant="secondary" asChild>
            <Link to={`/c/${companyId}/purchases?tab=invoices`}>Cancel</Link>
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
                  setGoods({});
                }}
              >
                <option value="">Choose a supplier…</option>
                {suppliers.data
                  .filter((s) => s.status === 'active')
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} · {s.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Supplier's invoice number" error={action.error?.fields.supplierInvoiceNo}>
              <Input
                value={supplierInvoiceNo}
                onChange={(e) => setSupplierInvoiceNo(e.target.value)}
                maxLength={60}
              />
            </Field>
            <Field label="Branch">
              <Select
                value={branch}
                onChange={(e) => {
                  setBranchId(e.target.value);
                  setGoods({});
                }}
              >
                {branches.data.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Invoice date" error={action.error?.fields.invoiceDate}>
              <Input
                type="date"
                value={invoiceDate}
                max={today}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </Field>
            <Field
              label="Due date (optional)"
              hint={
                defaultDue
                  ? `Defaults to ${formatDate(defaultDue)} from the supplier's terms.`
                  : undefined
              }
              error={action.error?.fields.dueDate}
            >
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
            <ProjectField
              value={projectId}
              onChange={setProjectId}
              error={action.error?.fields.projectId}
            />
          </div>
          <BackdateNotice date={invoiceDate} state={backdate} />
        </Card>

        <Card className="p-4">
          <h2 className="mb-1 text-base font-semibold">Goods received</h2>
          <p className="mb-3 text-sm text-slate-500">
            Tick the lines this invoice covers. If the invoiced amount differs from the received
            cost, the difference adjusts stock still on hand and the rest goes to cost of sales.
          </p>
          {!supplierId ? (
            <p className="text-sm text-slate-500">
              Choose a supplier to see what is waiting for an invoice.
            </p>
          ) : openReceipts.loading ? (
            <Spinner />
          ) : receipts.length === 0 ? (
            <p className="text-sm text-slate-500">
              Nothing from this supplier is waiting for an invoice at this branch.
            </p>
          ) : (
            <div className="relative overflow-x-auto">
              <table className="min-w-full text-sm" aria-label="Goods to invoice">
                <thead className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-10 px-2 py-2">
                      <span className="sr-only">Include</span>
                    </th>
                    <th className="px-2 py-2">Receipt</th>
                    <th className="min-w-48 px-2 py-2">Product</th>
                    <th className="px-2 py-2 text-right">Waiting</th>
                    <th className="w-32 px-2 py-2">Quantity</th>
                    <th className="w-40 px-2 py-2">Invoiced amount</th>
                    <th className="px-2 py-2 text-right">Received cost</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.flatMap((r) =>
                    r.lines
                      .filter((l) => remaining(l).qty > 0)
                      .map((l) => {
                        const key = goodsKey(r.id, l.lineNo);
                        const d = goods[key];
                        const label = `${r.number} line ${l.lineNo}`;
                        return (
                          <tr key={key}>
                            <td className="px-2 py-1.5">
                              <input
                                type="checkbox"
                                className="size-4"
                                aria-label={`Invoice ${label}`}
                                checked={!!d?.include}
                                onChange={(e) => toggle(r, l, e.target.checked)}
                              />
                            </td>
                            <td className="px-2 py-1.5 font-mono">{r.number}</td>
                            <td className="px-2 py-1.5">
                              <span className="font-mono">{l.sku}</span> {l.productName}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              {qty(remaining(l).qty, l.unit)}
                            </td>
                            <td className="px-2 py-1.5">
                              <Input
                                aria-label={`${label} quantity`}
                                inputMode="decimal"
                                disabled={!d?.include}
                                value={d?.quantity ?? ''}
                                onChange={(e) => setGood(key, { quantity: e.target.value })}
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <Input
                                aria-label={`${label} amount`}
                                inputMode="decimal"
                                disabled={!d?.include}
                                value={d?.amount ?? ''}
                                onChange={(e) => setGood(key, { amount: e.target.value })}
                              />
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              {money(remaining(l).value, currency)}
                            </td>
                          </tr>
                        );
                      }),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="mb-1 text-base font-semibold">Other charges</h2>
          <p className="mb-3 text-sm text-slate-500">
            Services and expenses go to the account you choose. Freight, duty and similar costs of
            bringing goods in can be added to the cost of a receipt instead.
          </p>
          {charges.map((c, i) => {
            const n = i + 1;
            return (
              <div
                key={c.key}
                className="mb-3 grid gap-3 rounded-md border border-slate-200 p-3 sm:grid-cols-12"
              >
                <Field label={`Charge ${n} type`} className="sm:col-span-3">
                  <Select
                    value={c.kind}
                    onChange={(e) => setCharge(i, { kind: e.target.value as ChargeDraft['kind'] })}
                  >
                    <option value="expense">Expense or service</option>
                    <option value="landed">Add to cost of goods received</option>
                  </Select>
                </Field>
                {c.kind === 'expense' ? (
                  <Field label={`Charge ${n} account`} className="sm:col-span-4">
                    <Select
                      value={c.accountId}
                      onChange={(e) => setCharge(i, { accountId: e.target.value })}
                    >
                      <option value="">Choose an account…</option>
                      {expenseAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} · {a.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : (
                  <>
                    <Field label={`Charge ${n} receipt`} className="sm:col-span-2">
                      <Select
                        value={c.goodsReceiptId}
                        onChange={(e) => setCharge(i, { goodsReceiptId: e.target.value })}
                      >
                        <option value="">Choose…</option>
                        {landedTargets.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.number} · {r.supplierName}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={`Charge ${n} spread by`} className="sm:col-span-2">
                      <Select
                        value={c.basis}
                        onChange={(e) =>
                          setCharge(i, { basis: e.target.value as ChargeDraft['basis'] })
                        }
                      >
                        <option value="value">Value</option>
                        <option value="quantity">Quantity</option>
                      </Select>
                    </Field>
                  </>
                )}
                <Field
                  label={`Charge ${n} description`}
                  className={c.kind === 'expense' ? 'sm:col-span-3' : 'sm:col-span-3'}
                >
                  <Input
                    value={c.description}
                    onChange={(e) => setCharge(i, { description: e.target.value })}
                    maxLength={200}
                  />
                </Field>
                <Field label={`Charge ${n} amount`} className="sm:col-span-2">
                  <Input
                    inputMode="decimal"
                    value={c.amount}
                    onChange={(e) => setCharge(i, { amount: e.target.value })}
                  />
                </Field>
                <div className="flex items-end sm:col-span-12 sm:justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setCharges(charges.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="size-4" aria-hidden /> Remove charge {n}
                  </Button>
                </div>
              </div>
            );
          })}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setCharges([...charges, newCharge()])}
          >
            <Plus className="size-4" aria-hidden /> Add charge
          </Button>
        </Card>

        <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:justify-between">
          <Field
            label="Input tax on the invoice (optional)"
            hint="Recoverable tax as shown by the supplier. Nothing is calculated for you."
            className="sm:w-72"
          >
            <Input
              inputMode="decimal"
              value={inputTax}
              onChange={(e) => setInputTax(e.target.value)}
            />
          </Field>
          <p className="text-lg font-semibold tabular-nums" data-testid="invoice-total">
            Total {money(total, currency)}
          </p>
        </Card>
        <div className="flex justify-end">
          <Button type="submit" loading={action.pending} disabled={!complete}>
            Post invoice
          </Button>
        </div>
      </form>
    </>
  );
}
