import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input, Select, Textarea } from '../../components/ui/form';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { qty, useLocations } from '../../lib/inventory';
import { money } from '../../lib/ledger';
import { ORDER_TONE, useBoms, useProductionOrders } from '../../lib/production';
import { useAction } from '../../lib/useAction';
import { formatDate } from '../../lib/utils';

function NewOrderDialog({ onClose }: { onClose: () => void }) {
  const { companyId, member } = useCompany();
  const navigate = useNavigate();
  const boms = useBoms(companyId);
  const locations = useLocations(companyId);
  const action = useAction();
  const [bomId, setBomId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [memo, setMemo] = useState('');
  const activeBoms = boms.data.filter((b) => b.status === 'active');
  const stores = locations.data.filter(
    (l) =>
      l.type === 'store' &&
      l.status === 'active' &&
      (member?.branchScope === 'all' || member?.branchScope.includes(l.branchId)),
  );
  const location = locationId || stores[0]?.id || '';
  const bom = activeBoms.find((b) => b.id === bomId);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await action.run<{ orderId: string }>('productionOrder.create', {
        companyId,
        bomId,
        locationId: location,
        quantity,
        ...(memo.trim() ? { memo: memo.trim() } : {}),
      });
      void navigate(`/c/${companyId}/production/${res.orderId}`);
    } catch {
      /* shown below */
    }
  };
  const f = action.error?.fields ?? {};
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="New production order"
      description="Materials are issued from the store and the finished goods go back into it."
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        {activeBoms.length === 0 && !boms.loading && (
          <Alert tone="info">
            Set up a bill of materials first, under{' '}
            <Link className="underline" to={`/c/${companyId}/production/boms`}>
              Bills of materials
            </Link>
            .
          </Alert>
        )}
        <Field label="Bill of materials" error={f.bomId}>
          <Select value={bomId} onChange={(e) => setBomId(e.target.value)}>
            <option value="">Choose…</option>
            {activeBoms.map((b) => (
              <option key={b.id} value={b.id}>
                {b.sku} · {b.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Store" error={f.locationId}>
            <Select value={location} onChange={(e) => setLocationId(e.target.value)}>
              {stores.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.branchId} · {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Quantity to make"
            hint={bom ? `The bill makes ${qty(bom.outputQtyMilli, bom.unit)}.` : undefined}
            error={f.quantity}
          >
            <Input
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Notes (optional)" error={f.memo}>
          <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={300} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={action.pending}
            disabled={!bomId || !location || !quantity.trim()}
          >
            Create order
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function Production() {
  const { companyId, company, can } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const orders = useProductionOrders(companyId);
  const [adding, setAdding] = useState(false);
  return (
    <>
      <PageHeader
        title="Production"
        description="Orders that turn materials into finished goods at actual cost."
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link to={`/c/${companyId}/production/boms`}>Bills of materials</Link>
            </Button>
            {can('production.manage') && (
              <Button onClick={() => setAdding(true)}>
                <Plus className="size-4" aria-hidden /> New order
              </Button>
            )}
          </>
        }
      />
      {orders.loading ? (
        <Spinner />
      ) : orders.data.length === 0 ? (
        <EmptyState title="No production orders yet" />
      ) : (
        <Card>
          <Table label="Production orders">
            <THead>
              <Tr>
                <Th>Number</Th>
                <Th>Product</Th>
                <Th className="text-right">Planned</Th>
                <Th className="text-right">Made</Th>
                <Th className="text-right">Cost</Th>
                <Th>Status</Th>
                <Th>Closed</Th>
              </Tr>
            </THead>
            <TBody>
              {orders.data.map((o) => (
                <Tr key={o.id}>
                  <Td className="font-mono">
                    <Link
                      to={`/c/${companyId}/production/${o.id}`}
                      className="text-brand-700 hover:underline"
                    >
                      {o.number}
                    </Link>
                  </Td>
                  <Td>
                    <span className="font-mono">{o.sku}</span> {o.productName}
                  </Td>
                  <Td className="text-right tabular-nums">{qty(o.plannedQtyMilli, o.unit)}</Td>
                  <Td className="text-right tabular-nums">
                    {o.goodQtyMilli !== null ? qty(o.goodQtyMilli, o.unit) : '—'}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {money(
                      o.status === 'completed' ? (o.finishedCostMinor ?? 0) : o.wipMinor,
                      currency,
                    )}
                  </Td>
                  <Td>
                    <Badge tone={ORDER_TONE[o.status]}>{o.status}</Badge>
                  </Td>
                  <Td>{o.closedDate ? formatDate(o.closedDate) : '—'}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
      {adding && <NewOrderDialog onClose={() => setAdding(false)} />}
    </>
  );
}
