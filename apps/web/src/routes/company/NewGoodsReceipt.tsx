import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  InventoryError,
  MoneyError,
  branchAllowed,
  parseQuantity,
  parseUnitCost,
  valueAt,
} from '@bms/domain';
import { BackdateNotice, useBackdate, useToday } from '../../components/BackdateNotice';
import { Button } from '../../components/ui/button';
import { Alert, Card, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input, Select } from '../../components/ui/form';
import { useCompany } from '../../lib/company';
import { useLocations, useProducts } from '../../lib/inventory';
import { money } from '../../lib/ledger';
import { useSuppliers } from '../../lib/purchasing';
import { useAction } from '../../lib/useAction';
import { cn } from '../../lib/utils';

interface LineDraft {
  key: string;
  productId: string;
  quantity: string;
  unitCost: string;
}

const newLine = (): LineDraft => ({
  key: crypto.randomUUID(),
  productId: '',
  quantity: '',
  unitCost: '',
});

/** The value of a line as typed, or null while it is incomplete or invalid. */
function lineValue(
  quantity: string,
  unitCost: string,
  unit: Parameters<typeof parseQuantity>[1] | undefined,
  currency: string,
): bigint | null {
  if (!unit || !quantity.trim() || !unitCost.trim()) return null;
  try {
    const q = parseQuantity(quantity, unit);
    if (q <= 0n) return null;
    return valueAt(q, parseUnitCost(unitCost, currency));
  } catch (e) {
    if (e instanceof InventoryError || e instanceof MoneyError) return null;
    throw e;
  }
}

export default function NewGoodsReceipt() {
  const { companyId, company, member } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const today = useToday();
  const suppliers = useSuppliers(companyId);
  const products = useProducts(companyId);
  const locations = useLocations(companyId);
  const action = useAction();
  const [supplierId, setSupplierId] = useState(params.get('supplier') ?? '');
  const [locationId, setLocationId] = useState('');
  const [postingDate, setPostingDate] = useState(today);
  const [reference, setReference] = useState('');
  const [lines, setLines] = useState<LineDraft[]>(() => [newLine()]);
  const backdate = useBackdate(postingDate);

  const usable = locations.data.filter(
    (l) => l.status === 'active' && member && branchAllowed(member.branchScope, l.branchId),
  );
  const location = locationId || usable[0]?.id || '';
  const activeSuppliers = suppliers.data.filter((s) => s.status === 'active');
  const activeProducts = products.data.filter((p) => p.status === 'active');
  const unitOf = (id: string) => products.data.find((p) => p.id === id)?.unit;
  const values = lines.map((l) => lineValue(l.quantity, l.unitCost, unitOf(l.productId), currency));
  const total = values.reduce<bigint>((s, v) => s + (v ?? 0n), 0n);
  const update = (i: number, patch: Partial<LineDraft>) =>
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const complete =
    !!supplierId &&
    !!location &&
    lines.every((l, i) => l.productId && values[i] !== null) &&
    total > 0n &&
    (!backdate.needsApproval || !!backdate.approvalId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await action.run<{ goodsReceiptId: string }>('goodsReceipt.post', {
        companyId,
        supplierId,
        locationId: location,
        postingDate,
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        lines: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitCost: l.unitCost,
        })),
        ...(backdate.approvalId ? { backdateApprovalId: backdate.approvalId } : {}),
      });
      void navigate(`/c/${companyId}/purchases/receipts/${res.goodsReceiptId}`);
    } catch {
      /* shown below */
    }
  };

  if (suppliers.loading || products.loading || locations.loading) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Receive goods"
        description="Stock goes in at the cost you enter and is owed to the supplier once their invoice is recorded."
        actions={
          <Button variant="secondary" asChild>
            <Link to={`/c/${companyId}/purchases?tab=receipts`}>Cancel</Link>
          </Button>
        }
      />
      <form onSubmit={submit} className="space-y-4" noValidate>
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        <Card className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            <Field label="Location">
              <Select value={location} onChange={(e) => setLocationId(e.target.value)}>
                {usable.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.branchId} · {l.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date received" error={action.error?.fields.postingDate}>
              <Input
                type="date"
                value={postingDate}
                max={today}
                onChange={(e) => setPostingDate(e.target.value)}
              />
            </Field>
            <Field label="Delivery note (optional)" error={action.error?.fields.reference}>
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
          <div className="relative overflow-x-auto">
            <table className="min-w-full text-sm" aria-label="Receipt lines">
              <thead className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="min-w-56 px-2 py-2">Product</th>
                  <th className="w-32 px-2 py-2">Quantity</th>
                  <th className="w-36 px-2 py-2">Unit cost</th>
                  <th className="px-2 py-2 text-right">Value</th>
                  <th className="w-10 px-2 py-2">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.key} className={cn(action.error?.lineNo === i + 1 && 'bg-red-50')}>
                    <td className="px-2 py-1.5">
                      <Select
                        aria-label={`Line ${i + 1} product`}
                        value={l.productId}
                        onChange={(e) => update(i, { productId: e.target.value })}
                      >
                        <option value="">Choose a product…</option>
                        {activeProducts.map((p) => (
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
                        aria-label={`Line ${i + 1} unit cost`}
                        inputMode="decimal"
                        value={l.unitCost}
                        onChange={(e) => update(i, { unitCost: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {values[i] != null ? money(values[i], currency) : '—'}
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
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setLines([...lines, newLine()])}
            >
              <Plus className="size-4" aria-hidden /> Add product
            </Button>
            <p className="text-sm font-semibold tabular-nums" data-testid="receipt-total">
              Total {money(total, currency)}
            </p>
          </div>
        </Card>
        <div className="flex justify-end">
          <Button type="submit" loading={action.pending} disabled={!complete}>
            Post receipt
          </Button>
        </div>
      </form>
    </>
  );
}
