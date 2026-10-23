import { doc } from 'firebase/firestore';
import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  InventoryError,
  MoneyError,
  SalesError,
  branchAllowed,
  creditCheck,
  formatRatePercent,
  parseQuantity,
  salesLine,
  toDecimalString,
  type SalesLineAmounts,
  type UnitCode,
} from '@bms/domain';
import { BackdateNotice, useBackdate, useToday } from '../../components/BackdateNotice';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { Alert, Card, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input, Select, Textarea } from '../../components/ui/form';
import { useCompany } from '../../lib/company';
import { db } from '../../lib/firebase';
import { useDoc } from '../../lib/firestore-hooks';
import { isService, qty, useLocations, useProducts } from '../../lib/inventory';
import { money, tryParseMoney, useAccounts } from '../../lib/ledger';
import {
  useAvailability,
  useCustomers,
  useMyCreditApprovals,
  useTaxCodes,
  type CustomerRow,
} from '../../lib/sales';
import { projectsFor, useProjects, type QuotationRow } from '../../lib/services';
import { useAction } from '../../lib/useAction';
import { cn } from '../../lib/utils';

export interface LineDraft {
  key: string;
  productId: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  taxCodeId: string;
}

export const newLine = (taxCodeId = ''): LineDraft => ({
  key: crypto.randomUUID(),
  productId: '',
  quantity: '1',
  unitPrice: '',
  discount: '',
  taxCodeId,
});

/** The amounts of a line as typed, or null while it is incomplete or invalid. */
export function lineAmounts(
  l: LineDraft,
  unit: UnitCode | undefined,
  rateBp: number,
  pricesIncludeTax: boolean,
  currency: string,
): SalesLineAmounts | null {
  if (!unit || !l.quantity.trim() || !l.unitPrice.trim()) return null;
  const price = tryParseMoney(l.unitPrice, currency);
  const discount = tryParseMoney(l.discount, currency);
  if (price === null || discount === null) return null;
  try {
    const q = parseQuantity(l.quantity, unit);
    if (q <= 0n) return null;
    return salesLine({
      qtyMilli: q,
      unitPriceMinor: price,
      discountMinor: discount,
      rateBp,
      pricesIncludeTax,
    });
  } catch (e) {
    if (e instanceof InventoryError || e instanceof MoneyError || e instanceof SalesError) {
      return null;
    }
    throw e;
  }
}

/** Explains a sale over the customer's limit and lets the seller ask for an override. */
function CreditNotice({
  customer,
  onCredit,
  exposure,
  approvalState,
}: {
  customer: CustomerRow;
  onCredit: bigint;
  exposure: bigint;
  approvalState: 'override' | 'approved' | 'pending' | 'none';
}) {
  const { companyId, company } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const action = useAction();
  const limit = BigInt(customer.creditLimitMinor);
  const what =
    limit === 0n
      ? `${customer.name} is cash only, and ${money(onCredit, currency)} would go on credit.`
      : `${customer.name} would owe ${money(exposure, currency)}, over their credit limit of ${money(limit, currency)}.`;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await action.run('approval.request', {
        companyId,
        action: 'sales.creditOverride',
        target: { customerId: customer.id, amount: toDecimalString(onCredit, currency) },
        reason,
      });
      setAsking(false);
    } catch {
      /* shown below */
    }
  };
  if (approvalState === 'override') {
    return <Alert tone="info">{what} You can allow this; it is recorded in the audit log.</Alert>;
  }
  if (approvalState === 'approved') {
    return <Alert tone="success">{what} An approved request covers it and will be used.</Alert>;
  }
  return (
    <>
      <Alert tone="error">
        {what} Take more payment now, or{' '}
        {approvalState === 'pending' ? (
          'wait: your request is with a manager. This page updates when it is approved.'
        ) : (
          <Button size="sm" variant="secondary" type="button" onClick={() => setAsking(true)}>
            Ask a manager to approve
          </Button>
        )}
      </Alert>
      {asking && (
        <Dialog
          open
          onOpenChange={(o) => !o && setAsking(false)}
          title={`Sell ${money(onCredit, currency)} on credit to ${customer.name}`}
          description="A manager must approve it. The approval covers this amount once."
        >
          <form onSubmit={submit} className="space-y-4">
            {action.error && <Alert tone="error">{action.error.message}</Alert>}
            <Field
              label="Reason"
              hint="Recorded in the audit log."
              error={action.error?.fields.reason}
            >
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" type="button" onClick={() => setAsking(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={action.pending} disabled={reason.trim().length < 3}>
                Send request
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

export default function NewSale() {
  const { companyId, company, member, can } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const today = useToday();
  const customers = useCustomers(companyId);
  const products = useProducts(companyId);
  const locations = useLocations(companyId);
  const accounts = useAccounts(companyId);
  const taxCodes = useTaxCodes(companyId);
  const settingsRef = useMemo(
    () => doc(db, `companies/${companyId}/settings/general`),
    [companyId],
  );
  const settings = useDoc<{ pricesIncludeTax: boolean }>(settingsRef);
  const approvals = useMyCreditApprovals(companyId, member?.uid);
  const canSeeProjects = can('projects.read');
  const projects = useProjects(companyId, canSeeProjects);
  const quotationId = params.get('quotation') ?? '';
  const quoteRef = useMemo(
    () => (quotationId ? doc(db, `companies/${companyId}/quotations/${quotationId}`) : null),
    [companyId, quotationId],
  );
  const quote = useDoc<Omit<QuotationRow, 'id'>>(quoteRef);
  const action = useAction();
  const [customerId, setCustomerId] = useState(params.get('customer') ?? '');
  const [projectId, setProjectId] = useState(params.get('project') ?? '');
  const [locationId, setLocationId] = useState('');
  const [postingDate, setPostingDate] = useState(today);
  const [reference, setReference] = useState('');
  const [lines, setLines] = useState<LineDraft[]>(() => [newLine()]);
  const [received, setReceived] = useState('');
  const [accountId, setAccountId] = useState('');
  const backdate = useBackdate(postingDate);
  const canOverridePrice = can('sales.priceOverride');

  // An invoice from a quotation starts with the quotation's customer, project and lines.
  const fromQuote = quote.data;
  const [filledFrom, setFilledFrom] = useState('');
  // Set while rendering, once per quotation, so the form shows the quotation straight away.
  if (fromQuote && filledFrom !== fromQuote.id) {
    setFilledFrom(fromQuote.id);
    setCustomerId(fromQuote.customerId);
    setProjectId(fromQuote.projectId ?? '');
    setReference(fromQuote.number);
    setLines(
      fromQuote.lines.map((q) => ({
        key: crypto.randomUUID(),
        productId: q.productId,
        quantity: (q.qtyMilli / 1000).toString(),
        unitPrice: toDecimalString(BigInt(q.unitPriceMinor), currency),
        discount: q.discountMinor ? toDecimalString(BigInt(q.discountMinor), currency) : '',
        taxCodeId: q.taxCodeId ?? '',
      })),
    );
  }
  const quotedPrices = !!fromQuote;
  const showDiscount = canOverridePrice || lines.some((l) => l.discount.trim() !== '');

  const usable = locations.data.filter(
    (l) =>
      l.status === 'active' &&
      l.type === 'store' &&
      member &&
      branchAllowed(member.branchScope, l.branchId),
  );
  const location = locationId || usable[0]?.id || '';
  const availability = useAvailability(companyId, location);
  const payInto = accounts.data.filter(
    (a) => a.status === 'active' && a.isPostable && (a.subtype === 'cash' || a.subtype === 'bank'),
  );
  const account = accountId || payInto[0]?.id || '';
  const activeCustomers = customers.data.filter((c) => c.status === 'active');
  const customer = customers.data.find((c) => c.id === customerId) ?? null;
  const activeProducts = products.data.filter((p) => p.status === 'active');
  const activeTax = taxCodes.data.filter((t) => t.status === 'active');
  const productOf = (id: string) => products.data.find((p) => p.id === id);
  const rateOf = (id: string) => taxCodes.data.find((t) => t.id === id)?.rateBp ?? 0;
  const inclusive = settings.data?.pricesIncludeTax ?? false;

  const amounts = lines.map((l) =>
    lineAmounts(l, productOf(l.productId)?.unit, rateOf(l.taxCodeId), inclusive, currency),
  );
  const sum = (k: keyof SalesLineAmounts) => amounts.reduce((s, a) => s + (a?.[k] ?? 0n), 0n);
  const net = sum('netMinor');
  const tax = sum('taxMinor');
  const total = sum('grossMinor');
  const receivedMinor = tryParseMoney(received, currency);
  const paid = receivedMinor === null ? null : receivedMinor > total ? total : receivedMinor;
  const change = receivedMinor !== null && receivedMinor > total ? receivedMinor - total : 0n;
  const onCredit = paid === null ? null : total - paid;

  const check =
    customer && onCredit !== null
      ? creditCheck(
          BigInt(customer.balanceMinor),
          BigInt(customer.advanceMinor),
          BigInt(customer.creditLimitMinor),
          onCredit,
        )
      : null;
  const approval =
    check?.over && customer && onCredit !== null
      ? approvals.data.find(
          (a) =>
            a.target.customerId === customer.id &&
            (a.status === 'pending' || BigInt(a.target.amountMinor) >= onCredit),
        )
      : undefined;
  const approvalState: 'override' | 'approved' | 'pending' | 'none' = can(
    'sales.creditLimit.override',
  )
    ? 'override'
    : approval?.status === 'approved'
      ? 'approved'
      : approval?.status === 'pending'
        ? 'pending'
        : 'none';
  const creditOk = !check?.over || approvalState === 'override' || approvalState === 'approved';

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
    !!location &&
    lines.every((l, i) => l.productId && amounts[i] != null) &&
    total > 0n &&
    paid !== null &&
    (paid === 0n || !!account) &&
    (customer ? true : paid === total) &&
    creditOk &&
    (!backdate.needsApproval || !!backdate.approvalId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (paid === null) return;
    try {
      const res = await action.run<{ invoiceId: string }>('salesInvoice.post', {
        companyId,
        ...(customerId ? { customerId } : {}),
        locationId: location,
        postingDate,
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        lines: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          ...(canOverridePrice || quotedPrices ? { unitPrice: l.unitPrice } : {}),
          ...((canOverridePrice || quotedPrices) && l.discount.trim()
            ? { discount: l.discount }
            : {}),
          ...(l.taxCodeId ? { taxCodeId: l.taxCodeId } : {}),
        })),
        ...(projectId ? { projectId } : {}),
        ...(fromQuote ? { quotationId: fromQuote.id } : {}),
        payments:
          paid > 0n ? [{ accountId: account, amount: toDecimalString(paid, currency) }] : [],
        ...(approvalState === 'approved' && approval ? { creditApprovalId: approval.id } : {}),
        ...(backdate.approvalId ? { backdateApprovalId: backdate.approvalId } : {}),
      });
      void navigate(`/c/${companyId}/sales/invoices/${res.invoiceId}`);
    } catch {
      /* shown below */
    }
  };

  if (
    customers.loading ||
    products.loading ||
    locations.loading ||
    accounts.loading ||
    taxCodes.loading ||
    settings.loading ||
    quote.loading
  ) {
    return <Spinner />;
  }
  const projectChoices = projectsFor(projects.data, customerId || null);

  return (
    <>
      <PageHeader
        title={fromQuote ? `Invoice ${fromQuote.number}` : 'New sale'}
        description={`Prices ${inclusive ? 'include' : 'are before'} tax. Anything not paid now is owed by the customer.`}
        actions={
          <Button variant="secondary" asChild>
            <Link to={`/c/${companyId}/sales`}>Cancel</Link>
          </Button>
        }
      />
      <form onSubmit={submit} className="space-y-4" noValidate>
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        <Card className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Customer">
              <Select
                value={customerId}
                disabled={!!fromQuote}
                onChange={(e) => {
                  setCustomerId(e.target.value);
                  setProjectId('');
                }}
              >
                <option value="">Walk-in customer (pays now)</option>
                {activeCustomers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Sell from">
              <Select value={location} onChange={(e) => setLocationId(e.target.value)}>
                {usable.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.branchId} · {l.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date" error={action.error?.fields.postingDate}>
              <Input
                type="date"
                value={postingDate}
                max={today}
                onChange={(e) => setPostingDate(e.target.value)}
              />
            </Field>
            <Field label="Reference (optional)" error={action.error?.fields.reference}>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                maxLength={60}
              />
            </Field>
          </div>
          {canSeeProjects && (projectChoices.length > 0 || projectId) && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            </div>
          )}
          {customer && (
            <p className="text-sm text-slate-600">
              Owes {money(customer.balanceMinor, currency)}
              {customer.advanceMinor > 0 &&
                `, paid in advance ${money(customer.advanceMinor, currency)}`}
              {' · '}
              {customer.creditLimitMinor === 0
                ? 'Cash only'
                : `Credit limit ${money(customer.creditLimitMinor, currency)}`}
            </p>
          )}
          <BackdateNotice date={postingDate} state={backdate} />
        </Card>

        <Card className="p-4">
          <div className="relative overflow-x-auto">
            <table className="min-w-full text-sm" aria-label="Sale lines">
              <thead className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="min-w-56 px-2 py-2">Product</th>
                  <th className="w-28 px-2 py-2">Quantity</th>
                  <th className="w-32 px-2 py-2">Price</th>
                  {showDiscount && <th className="w-28 px-2 py-2">Discount</th>}
                  {activeTax.length > 0 && <th className="w-36 px-2 py-2">Tax</th>}
                  <th className="px-2 py-2 text-right">Amount</th>
                  <th className="w-10 px-2 py-2">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const product = productOf(l.productId);
                  const onHand = l.productId ? availability.byProduct.get(l.productId) : undefined;
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
                          <option value="">Choose a product…</option>
                          {activeProducts.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.sku} · {p.name}
                            </option>
                          ))}
                        </Select>
                        {product && (
                          <p className="mt-1 text-xs text-slate-500">
                            {isService(product)
                              ? `Service, by the ${product.unit}`
                              : `${qty(onHand ?? 0, product.unit)} available`}
                          </p>
                        )}
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
                        {product && product.salePrice == null && !canOverridePrice && (
                          <p className="mt-1 text-xs text-red-700">No price set for this product</p>
                        )}
                      </td>
                      {showDiscount && (
                        <td className="px-2 py-1.5">
                          <Input
                            aria-label={`Line ${i + 1} discount`}
                            inputMode="decimal"
                            value={l.discount}
                            readOnly={!canOverridePrice}
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
              <Plus className="size-4" aria-hidden /> Add product
            </Button>
            <dl className="space-y-1 text-right text-sm tabular-nums">
              <div>
                <dt className="inline text-slate-500">Before tax </dt>
                <dd className="inline">{money(net, currency)}</dd>
              </div>
              {tax > 0n && (
                <div>
                  <dt className="inline text-slate-500">Tax </dt>
                  <dd className="inline">{money(tax, currency)}</dd>
                </div>
              )}
              <div className="text-base font-semibold">
                <dt className="inline">Total </dt>
                <dd className="inline" data-testid="sale-total">
                  {money(total, currency)}
                </dd>
              </div>
            </dl>
          </div>
        </Card>

        <Card className="space-y-4 p-4">
          <h2 className="text-base font-semibold">Payment</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Amount received"
              hint={customer ? 'Leave at 0 to sell fully on credit.' : undefined}
              error={action.error?.fields['payments.0.amount']}
            >
              <Input
                inputMode="decimal"
                value={received}
                onChange={(e) => setReceived(e.target.value)}
              />
            </Field>
            <Field label="Received into">
              <Select value={account} onChange={(e) => setAccountId(e.target.value)}>
                {payInto.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} · {acc.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="self-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setReceived(toDecimalString(total, currency))}
                disabled={total <= 0n}
              >
                Paid in full
              </Button>
            </div>
          </div>
          <div role="status" className="space-y-1 text-sm">
            {change > 0n && (
              <p className="font-semibold" data-testid="sale-change">
                Change to give: {money(change, currency)}
              </p>
            )}
            {onCredit !== null && onCredit > 0n && customer && (
              <p className="text-slate-600">
                {money(onCredit, currency)} will be owed by {customer.name}.
              </p>
            )}
            {onCredit !== null && onCredit > 0n && !customer && total > 0n && (
              <p className="font-medium text-red-700">
                A walk-in sale must be paid in full: {money(onCredit, currency)} is still to pay.
              </p>
            )}
          </div>
          {check?.over && customer && onCredit !== null && (
            <CreditNotice
              customer={customer}
              onCredit={onCredit}
              exposure={check.exposureMinor}
              approvalState={approvalState}
            />
          )}
        </Card>
        <div className="flex justify-end">
          <Button type="submit" loading={action.pending} disabled={!complete}>
            Complete sale
          </Button>
        </div>
      </form>
    </>
  );
}
