import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input, Select } from '../../components/ui/form';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { isService, qty, useProducts } from '../../lib/inventory';
import { useBoms } from '../../lib/production';
import { useAction } from '../../lib/useAction';

interface ComponentDraft {
  key: number;
  productId: string;
  quantity: string;
}
let nextKey = 1;
const newComponent = (): ComponentDraft => ({ key: nextKey++, productId: '', quantity: '' });

function NewBomDialog({ onClose }: { onClose: () => void }) {
  const { companyId } = useCompany();
  const products = useProducts(companyId);
  const action = useAction();
  const [productId, setProductId] = useState('');
  const [name, setName] = useState('');
  const [outputQuantity, setOutputQuantity] = useState('');
  const [components, setComponents] = useState<ComponentDraft[]>(() => [newComponent()]);
  const stocked = products.data.filter((p) => p.status === 'active' && !isService(p));
  const unitOf = (id: string) => stocked.find((p) => p.id === id)?.unit;
  const update = (i: number, patch: Partial<ComponentDraft>) =>
    setComponents(components.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await action.run('bom.create', {
        companyId,
        productId,
        name,
        outputQuantity,
        components: components.map((c) => ({ productId: c.productId, quantity: c.quantity })),
      });
      onClose();
    } catch {
      /* shown below */
    }
  };
  const f = action.error?.fields ?? {};
  const complete =
    !!productId &&
    name.trim().length >= 2 &&
    !!outputQuantity.trim() &&
    components.every((c) => c.productId && c.quantity.trim());
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="New bill of materials"
      description="What it takes to make a finished product. A bill is never edited; make a new one and stop using the old one."
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Finished product" error={f.productId}>
            <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Choose…</option>
              {stocked.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} · {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Makes"
            hint={unitOf(productId) ? `In ${unitOf(productId)}` : undefined}
            error={f.outputQuantity}
          >
            <Input
              inputMode="decimal"
              value={outputQuantity}
              onChange={(e) => setOutputQuantity(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Name" error={f.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </Field>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Components</legend>
          {components.map((c, i) => (
            <div key={c.key} className="flex gap-2">
              <Select
                aria-label={`Component ${i + 1}`}
                value={c.productId}
                onChange={(e) => update(i, { productId: e.target.value })}
              >
                <option value="">Choose…</option>
                {stocked
                  .filter((p) => p.id !== productId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} · {p.name}
                    </option>
                  ))}
              </Select>
              <Input
                aria-label={`Component ${i + 1} quantity`}
                className="w-32"
                inputMode="decimal"
                placeholder={unitOf(c.productId) ?? 'Qty'}
                value={c.quantity}
                onChange={(e) => update(i, { quantity: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove component ${i + 1}`}
                disabled={components.length <= 1}
                onClick={() => setComponents(components.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setComponents([...components, newComponent()])}
          >
            <Plus className="size-4" aria-hidden /> Add component
          </Button>
        </fieldset>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={action.pending} disabled={!complete}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function Boms() {
  const { companyId, can } = useCompany();
  const boms = useBoms(companyId);
  const action = useAction();
  const [adding, setAdding] = useState(false);
  const manage = can('production.manage');
  return (
    <>
      <PageHeader
        title="Bills of materials"
        description="The components each finished product is made from."
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link to={`/c/${companyId}/production`}>Production orders</Link>
            </Button>
            {manage && (
              <Button onClick={() => setAdding(true)}>
                <Plus className="size-4" aria-hidden /> New bill
              </Button>
            )}
          </>
        }
      />
      {action.error && <Alert tone="error">{action.error.message}</Alert>}
      {boms.loading ? (
        <Spinner />
      ) : boms.data.length === 0 ? (
        <EmptyState title="No bills of materials yet" />
      ) : (
        <Card>
          <Table label="Bills of materials">
            <THead>
              <Tr>
                <Th>Product</Th>
                <Th>Name</Th>
                <Th className="text-right">Makes</Th>
                <Th>Components</Th>
                <Th>Status</Th>
                {manage && (
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                )}
              </Tr>
            </THead>
            <TBody>
              {boms.data.map((b) => (
                <Tr key={b.id}>
                  <Td>
                    <span className="font-mono">{b.sku}</span> {b.productName}
                  </Td>
                  <Td>{b.name}</Td>
                  <Td className="text-right tabular-nums">{qty(b.outputQtyMilli, b.unit)}</Td>
                  <Td>
                    {b.components
                      .map((c) => `${qty(c.qtyMilli, c.unit)} ${c.productName}`)
                      .join(', ')}
                  </Td>
                  <Td>
                    <Badge tone={b.status === 'active' ? 'green' : 'slate'}>{b.status}</Badge>
                  </Td>
                  {manage && (
                    <Td>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={action.pending}
                        onClick={() =>
                          void action
                            .run('bom.setStatus', {
                              companyId,
                              bomId: b.id,
                              status: b.status === 'active' ? 'inactive' : 'active',
                            })
                            .catch(() => undefined)
                        }
                      >
                        {b.status === 'active' ? 'Stop using' : 'Use again'}
                      </Button>
                    </Td>
                  )}
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
      {adding && <NewBomDialog onClose={() => setAdding(false)} />}
    </>
  );
}
