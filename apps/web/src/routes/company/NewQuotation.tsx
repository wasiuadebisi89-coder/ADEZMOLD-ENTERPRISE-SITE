import { doc } from 'firebase/firestore';
import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { addDays, formatRatePercent, toDecimalString, type SalesLineAmounts } from '@bms/domain';
import { useToday } from '../../components/BackdateNotice';
import { Button } from '../../components/ui/button';
import { Alert, Card, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input, Select, Textarea } from '../../components/ui/form';
import { useCompany } from '../../lib/company';
import { db } from '../../lib/firebase';
import { useDoc } from '../../lib/firestore-hooks';
import { useProducts } from '../../lib/inventory';
import { money } from '../../lib/ledger';
import { useCustomers, useTaxCodes } from '../../lib/sales';
import { projectsFor, useProjects } from '../../lib/services';
import { useAction } from '../../lib/useAction';
import { cn } from '../../lib/utils';
import { usePostingBranches } from './NewJournal';
import { lineAmounts, newLine, type LineDraft } from './NewSale';

export default function NewQuotation() {
  const { companyId, company, can } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const today = useToday();
  const customers = useCustomers(companyId);
  const products = useProducts(companyId);
  const taxCodes = useTaxCodes(companyId);
  const branches = usePostingBranches();
  const canSeeProjects = can('projects.read');
  const projects = useProjects(companyId, canSeeProjects);
  const settingsRef = useMemo(
    () => doc(db, `companies/${companyId}/settings/general`),
    [companyId],
  );
  const settings = useDoc<{ pricesIncludeTax: boolean }>(settingsRef);
  const action = useAction();
  const [customerId, setCustomerId] = useState(params.get('customer') ?? '');
  const [branchId, setBranchId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [quoteDate, setQuoteDate] = useState(today);
  // A starting suggestion only; the person quoting sets how long the offer stands.
  const [validUntil, setValidUntil] = useState(addDays(today, 30));
  const [reference, setReference] = useState('');
  const [memo, setMemo] = useState('');
  const [lines, setLines] = useState<LineDraft[]>(() => [newLine()]);
  const canOverridePrice = can('sales.priceOverride');

  const branch = branchId || branches.data[0]?.id || '';
  const productOf = (id: string) => products.data.find((p) => p.id === id);
  const rateOf = (id: string) => taxCodes.data.find((t) => t.id === id)?.rateBp ?? 0;
  const inclusive = settings.data?.pricesIncludeTax ?? false;
  const amounts = lines.map((l) =>
    lineAmounts(l, productOf(l.productId)?.unit, rateOf(l.taxCodeId), inclusive, currency),
  );
  const sum = (k: keyof SalesLineAmounts) => amounts.reduce((s, a) => s + (a?.[k] ?? 0n), 0n);
  const total = sum('grossMinor');
  const activeTax = taxCodes.data.filter((t) => t.status === 'active');
  const update = (i: number, patch: Partial<LineDraft>) =>
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const chooseProduct = (i: number, productId: string) => {
    const p = productOf(productId);
    update(i, {
      productId,
      unitPrice: p?.salePrice != null ? toDecimalString(BigInt(p.salePrice), currency) : '',
    });
  };
  const complete =
    !!customerId &&
    !!branch &&
    validUntil >= quoteDate &&
    lines.every((l, i) => l.productId && amounts[i] != null) &&
    total > 0n;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await action.run<{ quotationId: string }>('quotation.create', {
        companyId,
        customerId,
        branchId: branch,
        quoteDate,
        validUntil,
        ...(projectId ? { projectId } : {}),
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        ...(memo.trim() ? { memo: memo.trim() } : {}),
        lines: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          ...(canOverridePrice ? { unitPrice: l.unitPrice } : {}),
          ...(canOverridePrice && l.discount.trim() ? { discount: l.discount } : {}),
          ...(l.taxCodeId ? { taxCodeId: l.taxCodeId } : {}),
        })),
      });
      void navigate(`/c/${companyId}/quotations/${res.quotationId}`);
    } catch {
      /* shown below */
    }
  };

  if (customers.loading || products.loading || taxCodes.loading || branches.loading) {
    return <Spinner />;
  }
  const projectChoices = projectsFor(projects.data, customerId || null);
  return (
    <>
      <PageHeader
        title="New quotation"
        description={`An offer to a customer; nothing is posted until it is invoiced. Prices ${inclusive ? 'include' : 'are before'} tax.`}
        actions={
          <Button variant="secondary" asChild>
            <Link to={`/c/${companyId}/quotations`}>Cancel</Link>
          </Button>
        }
      />
      <form onSubmit={submit} className="space-y-4" noValidate>
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        <Card className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Customer" error={action.error?.fields.customerId}>
              <Select
                value={customerId}
                onChange={(e) => {
                  setCustomerId(e.target.value);
                  setProjectId('');
                }}
              >
                <option value="">Choose a customer…</option>
                {customers.data
                  .filter((c) => c.status === 'active')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} · {c.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Branch">
              <Select value={branch} onChange={(e) => setBranchId(e.target.value)}>
                {branches.data.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} · {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date" error={action.error?.fields.quoteDate}>
              <Input type="date" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} />
            </Field>
            <Field label="Valid until" error={action.error?.fields.validUntil}>
              <Input
                type="date"
                value={validUntil}
                min={quoteDate}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </Field>
            <Field label="Reference (optional)" error={action.error?.fields.reference}>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                maxLength={60}
              />
            </Field>
            {canSeeProjects && (
              <Field label="Project (optional)">
                <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="">No project</option>
                  {projectChoices.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} · {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
          <Field label="Notes for the customer (optional)" error={action.error?.fields.memo}>
            <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={300} />
          </Field>
        </Card>
        <Card className="p-4">
          <div className="relative overflow-x-auto">
            <table className="min-w-full text-sm" aria-label="Quotation lines">
              <thead className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="min-w-56 px-2 py-2">Product or service</th>
                  <th className="w-28 px-2 py-2">Quantity</th>
                  <th className="w-32 px-2 py-2">Price</th>
                  {canOverridePrice && <th className="w-28 px-2 py-2">Discount</th>}
                  {activeTax.length > 0 && <th className="w-36 px-2 py-2">Tax</th>}
                  <th className="px-2 py-2 text-right">Amount</th>
                  <th className="w-10 px-2 py-2">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const a = amounts[i];
                  return (
                    <tr
                      key={l.key}
                      className={cn('align-top', action.error?.lineNo === i + 1 && 'bg-red-50')}
                    >
                      <td className="px-2 py-1.5">
                        <Select
                          aria-label={`Line ${i + 1} product`}
                          value={l.productId}
                          onChange={(e) => chooseProduct(i, e.target.value)}
                        >
                          <option value="">Choose…</option>
                          {products.data
                            .filter((p) => p.status === 'active')
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.sku} · {p.name}
                              </option>
                            ))}
                        </Select>
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          aria-label={`Line ${i + 1} quantity`}
                          inputMode="decimal"
                          value={l.quantity}
                          onChange={(e) => update(i, { quantity: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          aria-label={`Line ${i + 1} price`}
                          inputMode="decimal"
                          value={l.unitPrice}
                          readOnly={!canOverridePrice}
                          onChange={(e) => update(i, { unitPrice: e.target.value })}
                        />
                      </td>
                      {canOverridePrice && (
                        <td className="px-2 py-1.5">
                          <Input
                            aria-label={`Line ${i + 1} discount`}
                            inputMode="decimal"
                            value={l.discount}
                            onChange={(e) => update(i, { discount: e.target.value })}
                          />
                        </td>
                      )}
                      {activeTax.length > 0 && (
                        <td className="px-2 py-1.5">
                          <Select
                            aria-label={`Line ${i + 1} tax`}
                            value={l.taxCodeId}
                            onChange={(e) => update(i, { taxCodeId: e.target.value })}
                          >
                            <option value="">No tax</option>
                            {activeTax.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.code} {formatRatePercent(t.rateBp)}%
                              </option>
                            ))}
                          </Select>
                        </td>
                      )}
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {a ? money(a.grossMinor, currency) : '—'}
                      </td>
                      <td className="px-2 py-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={`Remove line ${i + 1}`}
                          disabled={lines.length <= 1}
                          onClick={() => setLines(lines.filter((_, j) => j !== i))}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setLines([...lines, newLine(lines.at(-1)?.taxCodeId ?? '')])}
            >
              <Plus className="size-4" aria-hidden /> Add line
            </Button>
            <p className="text-right text-base font-semibold tabular-nums">
              Total <span data-testid="quote-total">{money(total, currency)}</span>
            </p>
          </div>
        </Card>
        <div className="flex justify-end">
          <Button type="submit" loading={action.pending} disabled={!complete}>
            Save quotation
          </Button>
        </div>
      </form>
    </>
  );
}
