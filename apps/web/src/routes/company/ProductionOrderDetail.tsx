import { doc } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { formatQuantity } from '@bms/domain';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input, Select, Textarea } from '../../components/ui/form';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { db } from '../../lib/firebase';
import { useDoc } from '../../lib/firestore-hooks';
import { qty } from '../../lib/inventory';
import { money, useAccounts, type AccountRow } from '../../lib/ledger';
import { ORDER_TONE, type ProductionOrderRow } from '../../lib/production';
import { useAction } from '../../lib/useAction';
import { formatDate } from '../../lib/utils';

type Order = ProductionOrderRow;

const usable = (a: AccountRow) => a.isPostable && a.status === 'active' && !a.isControl;

function WriteOffSelect({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (id: string) => void;
  error?: string | undefined;
}) {
  const { companyId } = useCompany();
  const accounts = useAccounts(companyId);
  return (
    <Field label="Write off to" error={error}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose an expense account…</option>
        {accounts.data
          .filter((a) => usable(a) && a.type === 'expense')
          .map((a) => (
            <option key={a.id} value={a.id}>
              {a.code} · {a.name}
            </option>
          ))}
      </Select>
    </Field>
  );
}

function MaterialsDialog({
  orderId,
  order,
  direction,
  onClose,
}: {
  orderId: string;
  order: Order;
  direction: 'issue' | 'return';
  onClose: () => void;
}) {
  const { companyId } = useCompany();
  const action = useAction();
  const issuing = direction === 'issue';
  // Issuing suggests what the bill still calls for; returning starts empty.
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      order.components.map((c) => {
        const left = c.requiredQtyMilli - c.issuedQtyMilli;
        return [c.productId, issuing && left > 0 ? formatQuantity(left, c.unit) : ''];
      }),
    ),
  );
  const lines = order.components
    .filter((c) => (quantities[c.productId] ?? '').trim() !== '')
    .map((c) => ({
      productId: c.productId,
      quantity: quantities[c.productId]!.replaceAll(',', ''),
    }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await action.run('productionOrder.moveMaterials', { companyId, orderId, direction, lines });
      onClose();
    } catch {
      /* shown below */
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={issuing ? 'Issue materials' : 'Return unused materials'}
      description={
        issuing
          ? 'Materials leave the store at their current cost and are added to the order.'
          : 'Materials go back to the store at what they cost the order.'
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        {order.components.map((c) => (
          <Field
            key={c.productId}
            label={`${c.sku} · ${c.productName}`}
            hint={`Needed ${qty(c.requiredQtyMilli, c.unit)}, issued ${qty(c.issuedQtyMilli, c.unit)}`}
          >
            <Input
              inputMode="decimal"
              value={quantities[c.productId] ?? ''}
              onChange={(e) => setQuantities({ ...quantities, [c.productId]: e.target.value })}
            />
          </Field>
        ))}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={action.pending} disabled={lines.length === 0}>
            {issuing ? 'Issue' : 'Return'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function CostDialog({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const { companyId } = useCompany();
  const accounts = useAccounts(companyId);
  const action = useAction();
  const [accountId, setAccountId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const choices = accounts.data.filter(
    (a) => usable(a) && (a.type === 'asset' || a.type === 'liability' || a.type === 'expense'),
  );
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await action.run('productionOrder.addCost', {
        companyId,
        orderId,
        accountId,
        description,
        amount,
      });
      onClose();
    } catch {
      /* shown below */
    }
  };
  const f = action.error?.fields ?? {};
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Add a direct cost"
      description="Labour or other costs of this order. The order is debited and the account you choose is credited."
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        <Field
          label="Paid from or owed on"
          hint="Cash or bank if paid, an accrual if owed, or the expense account to move the cost out of."
          error={f.accountId}
        >
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Choose an account…</option>
            {choices.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} · {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Description" error={f.description}>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={200}
          />
        </Field>
        <Field label="Amount" error={f.amount}>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={action.pending}
            disabled={!accountId || description.trim().length < 3 || !amount.trim()}
          >
            Post cost
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function CompleteDialog({
  orderId,
  order,
  onClose,
}: {
  orderId: string;
  order: Order;
  onClose: () => void;
}) {
  const { companyId } = useCompany();
  const action = useAction();
  const [good, setGood] = useState('');
  const [normal, setNormal] = useState('');
  const [abnormal, setAbnormal] = useState('');
  const [writeOffAccountId, setWriteOffAccountId] = useState('');
  const hasAbnormal = abnormal.trim() !== '' && Number(abnormal.replaceAll(',', '')) !== 0;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await action.run('productionOrder.complete', {
        companyId,
        orderId,
        goodQuantity: good,
        ...(normal.trim() ? { normalLossQuantity: normal } : {}),
        ...(hasAbnormal ? { abnormalLossQuantity: abnormal, writeOffAccountId } : {}),
      });
      onClose();
    } catch {
      /* shown below */
    }
  };
  const f = action.error?.fields ?? {};
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Complete the order"
      description={`The order's cost goes into ${order.productName} stock. Expected loss is spread over the good output; loss beyond that is written off.`}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={`Good output (${order.unit})`} error={f.goodQuantity}>
            <Input inputMode="decimal" value={good} onChange={(e) => setGood(e.target.value)} />
          </Field>
          <Field label="Normal loss (optional)" error={f.normalLossQuantity}>
            <Input inputMode="decimal" value={normal} onChange={(e) => setNormal(e.target.value)} />
          </Field>
          <Field label="Abnormal loss (optional)" error={f.abnormalLossQuantity}>
            <Input
              inputMode="decimal"
              value={abnormal}
              onChange={(e) => setAbnormal(e.target.value)}
            />
          </Field>
        </div>
        {hasAbnormal && (
          <WriteOffSelect
            value={writeOffAccountId}
            onChange={setWriteOffAccountId}
            error={f.writeOffAccountId}
          />
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={action.pending}
            disabled={!good.trim() || (hasAbnormal && !writeOffAccountId)}
          >
            Complete
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function CancelDialog({
  orderId,
  order,
  onClose,
}: {
  orderId: string;
  order: Order;
  onClose: () => void;
}) {
  const { companyId, company } = useCompany();
  const action = useAction();
  const [reason, setReason] = useState('');
  const [writeOffAccountId, setWriteOffAccountId] = useState('');
  const holdsCost = order.wipMinor > 0;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await action.run('productionOrder.cancel', {
        companyId,
        orderId,
        reason,
        ...(holdsCost ? { writeOffAccountId } : {}),
      });
      onClose();
    } catch {
      /* shown below */
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Cancel the order">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        {holdsCost && (
          <Alert tone="info">
            The order still holds {money(order.wipMinor, company?.baseCurrency ?? 'NGN')}. Return
            unused materials first; whatever is left is written off.
          </Alert>
        )}
        <Field label="Reason" error={action.error?.fields.reason}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        </Field>
        {holdsCost && (
          <WriteOffSelect
            value={writeOffAccountId}
            onChange={setWriteOffAccountId}
            error={action.error?.fields.writeOffAccountId}
          />
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Keep the order
          </Button>
          <Button
            type="submit"
            variant="danger"
            loading={action.pending}
            disabled={reason.trim().length < 3 || (holdsCost && !writeOffAccountId)}
          >
            Cancel order
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

type Open = 'issue' | 'return' | 'cost' | 'complete' | 'cancel' | null;

export default function ProductionOrderDetail() {
  const { companyId, company, can } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const { orderId = '' } = useParams();
  const ref = useMemo(
    () => doc(db, `companies/${companyId}/productionOrders/${orderId}`),
    [companyId, orderId],
  );
  const order = useDoc<Omit<Order, 'id'>>(ref);
  const [open, setOpen] = useState<Open>(null);
  if (order.loading) return <Spinner />;
  const o = order.data ? ({ ...order.data, id: orderId } as Order) : null;
  if (!o) return <EmptyState title="Production order not found" />;
  const manage = can('production.manage') && o.status === 'open';
  const issued = o.components.some((c) => c.issuedQtyMilli > 0);
  const close = () => setOpen(null);

  return (
    <>
      <PageHeader
        title={`Production ${o.number}`}
        description={`${o.sku} · ${o.productName}${o.memo ? ` · ${o.memo}` : ''}`}
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link to={`/c/${companyId}/production`}>All orders</Link>
            </Button>
            {manage && (
              <>
                <Button variant="secondary" onClick={() => setOpen('issue')}>
                  Issue materials
                </Button>
                {issued && (
                  <Button variant="secondary" onClick={() => setOpen('return')}>
                    Return materials
                  </Button>
                )}
              </>
            )}
            {can('production.cost.post') && o.status === 'open' && (
              <Button variant="secondary" onClick={() => setOpen('cost')}>
                Add cost
              </Button>
            )}
            {manage && (
              <>
                <Button variant="secondary" onClick={() => setOpen('cancel')}>
                  Cancel order
                </Button>
                <Button onClick={() => setOpen('complete')} disabled={o.wipMinor <= 0}>
                  Complete
                </Button>
              </>
            )}
          </>
        }
      />
      <Card className="mb-4 p-4">
        <dl className="grid gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-slate-500">Status</dt>
            <dd>
              <Badge tone={ORDER_TONE[o.status]}>{o.status}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Planned</dt>
            <dd className="font-medium tabular-nums">{qty(o.plannedQtyMilli, o.unit)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Materials</dt>
            <dd className="font-medium tabular-nums">{money(o.materialsMinor, currency)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Direct costs</dt>
            <dd className="font-medium tabular-nums">{money(o.directCostMinor, currency)}</dd>
          </div>
          {o.status === 'open' ? (
            <div>
              <dt className="text-slate-500">In work in progress</dt>
              <dd className="font-medium tabular-nums" data-testid="order-wip">
                {money(o.wipMinor, currency)}
              </dd>
            </div>
          ) : (
            <>
              <div>
                <dt className="text-slate-500">Closed</dt>
                <dd className="font-medium">{o.closedDate ? formatDate(o.closedDate) : '—'}</dd>
              </div>
              {o.status === 'completed' && o.goodQtyMilli !== null && (
                <>
                  <div>
                    <dt className="text-slate-500">Made</dt>
                    <dd className="font-medium tabular-nums">
                      {qty(o.goodQtyMilli, o.unit)}
                      {o.normalLossQtyMilli
                        ? `, normal loss ${qty(o.normalLossQtyMilli, o.unit)}`
                        : ''}
                      {o.abnormalLossQtyMilli
                        ? `, abnormal loss ${qty(o.abnormalLossQtyMilli, o.unit)}`
                        : ''}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Finished goods cost</dt>
                    <dd className="font-medium tabular-nums" data-testid="order-finished-cost">
                      {money(o.finishedCostMinor ?? 0, currency)}
                    </dd>
                  </div>
                </>
              )}
              {(o.writtenOffMinor ?? 0) > 0 && (
                <div>
                  <dt className="text-slate-500">Written off</dt>
                  <dd className="font-medium tabular-nums">
                    {money(o.writtenOffMinor ?? 0, currency)}
                  </dd>
                </div>
              )}
              {o.closeReason && (
                <div>
                  <dt className="text-slate-500">Reason</dt>
                  <dd>{o.closeReason}</dd>
                </div>
              )}
            </>
          )}
        </dl>
      </Card>
      <h2 className="mb-3 text-base font-semibold">Materials</h2>
      <Card className="mb-4">
        <Table label="Materials">
          <THead>
            <Tr>
              <Th>Component</Th>
              <Th className="text-right">Needed</Th>
              <Th className="text-right">Issued</Th>
              <Th className="text-right">Cost</Th>
            </Tr>
          </THead>
          <TBody>
            {o.components.map((c) => (
              <Tr key={c.productId}>
                <Td>
                  <span className="font-mono">{c.sku}</span> {c.productName}
                </Td>
                <Td className="text-right tabular-nums">{qty(c.requiredQtyMilli, c.unit)}</Td>
                <Td className="text-right tabular-nums">{qty(c.issuedQtyMilli, c.unit)}</Td>
                <Td className="text-right tabular-nums">{money(c.issuedValueMinor, currency)}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
      <h2 className="mb-3 text-base font-semibold">Direct costs</h2>
      {o.costs.length === 0 ? (
        <p className="mb-4 text-sm text-slate-500">No direct costs yet.</p>
      ) : (
        <Card className="mb-4">
          <Table label="Direct costs">
            <THead>
              <Tr>
                <Th>Date</Th>
                <Th>Description</Th>
                <Th>Credited to</Th>
                <Th className="text-right">Amount</Th>
              </Tr>
            </THead>
            <TBody>
              {o.costs.map((c) => (
                <Tr key={c.journalId}>
                  <Td>{formatDate(c.postingDate)}</Td>
                  <Td>{c.description}</Td>
                  <Td>
                    {c.accountCode} {c.accountName}
                  </Td>
                  <Td className="text-right tabular-nums">{money(c.amountMinor, currency)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
      {can('ledger.journal.read') && o.journalIds.length > 0 && (
        <p className="text-sm">
          Journals:{' '}
          {o.journalIds.map((id, i) => (
            <span key={id}>
              {i > 0 && ', '}
              <Link className="text-brand-700 underline" to={`/c/${companyId}/journals/${id}`}>
                {i + 1}
              </Link>
            </span>
          ))}
        </p>
      )}
      {(open === 'issue' || open === 'return') && (
        <MaterialsDialog orderId={orderId} order={o} direction={open} onClose={close} />
      )}
      {open === 'cost' && <CostDialog orderId={orderId} onClose={close} />}
      {open === 'complete' && <CompleteDialog orderId={orderId} order={o} onClose={close} />}
      {open === 'cancel' && <CancelDialog orderId={orderId} order={o} onClose={close} />}
    </>
  );
}
