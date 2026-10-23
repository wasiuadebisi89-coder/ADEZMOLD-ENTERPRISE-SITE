import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { branchAllowed } from '@bms/domain';
import { Button } from '../../components/ui/button';
import { Alert, Card, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input, Select, Textarea } from '../../components/ui/form';
import { useCompany } from '../../lib/company';
import {
  KIND_LABEL,
  qty,
  useLocations,
  useProducts,
  useStockBalances,
  type AdjustmentRow,
} from '../../lib/inventory';
import { useAction } from '../../lib/useAction';
import { cn } from '../../lib/utils';

type Kind = AdjustmentRow['kind'];

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

const QUANTITY_LABEL: Record<Kind, string> = {
  adjustment: 'Change (+ found, − lost)',
  count: 'Counted quantity',
  opening: 'Quantity on hand',
};

export default function NewStockAdjustment() {
  const { companyId, member, can } = useCompany();
  const navigate = useNavigate();
  const products = useProducts(companyId);
  const locations = useLocations(companyId);
  const balances = useStockBalances(companyId, undefined, can('reports.stock.read'));
  const action = useAction();
  const kinds = (['adjustment', 'count', 'opening'] as Kind[]).filter((k) =>
    can(k === 'count' ? 'inventory.count.create' : 'inventory.adjustment.create'),
  );
  const [kind, setKind] = useState<Kind>(kinds[0] ?? 'adjustment');
  const [locationId, setLocationId] = useState('');
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<LineDraft[]>(() => [newLine()]);

  const usable = locations.data.filter(
    (l) => l.status === 'active' && member && branchAllowed(member.branchScope, l.branchId),
  );
  const location = locationId || usable[0]?.id || '';
  const activeProducts = products.data.filter((p) => p.status === 'active');
  const productById = new Map(products.data.map((p) => [p.id, p]));
  const onHand = (productId: string) =>
    balances.data.find((b) => b.productId === productId && b.locationId === location)?.qtyMilli ??
    0;
  const update = (i: number, patch: Partial<LineDraft>) =>
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const complete =
    !!location &&
    reason.trim().length >= 3 &&
    lines.every(
      (l) => l.productId && l.quantity.trim() && (kind !== 'opening' || l.unitCost.trim()),
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await action.run<{ adjustmentId: string }>('stockAdjustment.create', {
        companyId,
        kind,
        locationId: location,
        reason: reason.trim(),
        lines: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          ...(l.unitCost.trim() ? { unitCost: l.unitCost } : {}),
        })),
      });
      void navigate(`/c/${companyId}/stock-adjustments/${res.adjustmentId}`);
    } catch {
      /* shown below */
    }
  };

  if (products.loading || locations.loading) return <Spinner />;

  return (
    <>
      <PageHeader
        title="New stock adjustment"
        description="Nothing changes until a second person approves it. Stock is valued at the costing method when approved."
        actions={
          <Button variant="secondary" asChild>
            <Link to={`/c/${companyId}/stock-adjustments`}>Cancel</Link>
          </Button>
        }
      />
      <form onSubmit={submit} className="space-y-4" noValidate>
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        <Card className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type">
              <Select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
                {kinds.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
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
          </div>
          <Field
            label="Reason"
            hint="Shown to the approver and kept in the audit log."
            error={action.error?.fields.reason}
          >
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {kind === 'opening' && (
            <Alert tone="info">
              Opening stock is for stock held before you started using the system. It is valued at
              the cost you enter and credited to opening balance equity.
            </Alert>
          )}
          {kind !== 'opening' && (
            <p className="text-sm text-slate-500">
              Leave the unit cost empty to use the current average cost.
            </p>
          )}
        </Card>
        <Card className="p-4">
          <div className="relative overflow-x-auto">
            <table className="min-w-full text-sm" aria-label="Adjustment lines">
              <thead className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="min-w-56 px-2 py-2">Product</th>
                  {kind === 'count' && <th className="px-2 py-2 text-right">On hand now</th>}
                  <th className="w-40 px-2 py-2">{QUANTITY_LABEL[kind]}</th>
                  <th className="w-40 px-2 py-2">
                    Unit cost{kind === 'opening' ? '' : ' (optional)'}
                  </th>
                  <th className="w-10 px-2 py-2">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const product = productById.get(l.productId);
                  const bad = action.error?.lineNo === i + 1;
                  return (
                    <tr key={l.key} className={cn(bad && 'bg-red-50')}>
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
                      {kind === 'count' && (
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {product ? qty(onHand(product.id), product.unit) : ''}
                        </td>
                      )}
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
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => setLines([...lines, newLine()])}
          >
            <Plus className="size-4" aria-hidden /> Add product
          </Button>
        </Card>
        <div className="flex justify-end">
          <Button type="submit" loading={action.pending} disabled={!complete}>
            Send for approval
          </Button>
        </div>
      </form>
    </>
  );
}
