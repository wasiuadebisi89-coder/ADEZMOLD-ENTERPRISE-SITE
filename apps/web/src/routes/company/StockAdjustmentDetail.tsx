import { doc } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { COST_SCALE } from '@bms/domain';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Textarea } from '../../components/ui/form';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { db } from '../../lib/firebase';
import { useDoc } from '../../lib/firestore-hooks';
import { KIND_LABEL, STATUS_TONE, qty, type AdjustmentRow } from '../../lib/inventory';
import { money } from '../../lib/ledger';
import { useAction } from '../../lib/useAction';
import { formatDate, formatDateTime } from '../../lib/utils';

function DecideDialog({
  adjustment,
  decision,
  onClose,
}: {
  adjustment: AdjustmentRow;
  decision: 'approved' | 'rejected';
  onClose: () => void;
}) {
  const { companyId } = useCompany();
  const action = useAction();
  const [reason, setReason] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await action.run('stockAdjustment.decide', {
        companyId,
        adjustmentId: adjustment.id,
        decision,
        reason,
      });
      onClose();
    } catch {
      /* shown below */
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${decision === 'approved' ? 'Approve and post' : 'Reject'} ${adjustment.number}?`}
      description={
        decision === 'approved'
          ? 'Stock and the ledger are updated today, valued with the company costing method.'
          : 'Nothing is posted. The request stays on record as rejected.'
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        <Field label="Reason" hint="Recorded in the audit log." error={action.error?.fields.reason}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant={decision === 'approved' ? 'primary' : 'danger'}
            loading={action.pending}
            disabled={reason.trim().length < 3}
          >
            {decision === 'approved' ? 'Approve and post' : 'Reject'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function StockAdjustmentDetail() {
  const { companyId, company, member, can } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const { adjustmentId = '' } = useParams();
  const ref = useMemo(
    () => doc(db, `companies/${companyId}/stockAdjustments/${adjustmentId}`),
    [companyId, adjustmentId],
  );
  const adjustment = useDoc<Omit<AdjustmentRow, 'id'>>(ref);
  const [deciding, setDeciding] = useState<'approved' | 'rejected' | null>(null);

  if (adjustment.loading) return <Spinner />;
  const a = adjustment.data;
  if (!a) return <EmptyState title="Adjustment not found" />;
  const canDecide =
    a.status === 'pending' &&
    a.createdBy !== member?.uid &&
    can(a.kind === 'count' ? 'inventory.count.approve' : 'inventory.adjustment.approve');

  return (
    <>
      <PageHeader
        title={`${KIND_LABEL[a.kind]} ${a.number}`}
        description={a.reason}
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link to={`/c/${companyId}/stock-adjustments`}>All adjustments</Link>
            </Button>
            {canDecide && (
              <>
                <Button variant="secondary" onClick={() => setDeciding('rejected')}>
                  Reject
                </Button>
                <Button onClick={() => setDeciding('approved')}>Approve and post</Button>
              </>
            )}
          </>
        }
      />
      {a.status === 'pending' && a.createdBy === member?.uid && (
        <Alert tone="info" className="mb-4">
          Waiting for another person with approval rights.
        </Alert>
      )}
      <Card className="mb-4 p-4">
        <dl className="grid gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-slate-500">Status</dt>
            <dd>
              <Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Location</dt>
            <dd className="font-medium">{a.locationId}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Raised</dt>
            <dd className="font-medium">{formatDateTime(a.createdAt)}</dd>
          </div>
          {a.postingDate && (
            <div>
              <dt className="text-slate-500">Posted on</dt>
              <dd className="font-medium">{formatDate(a.postingDate)}</dd>
            </div>
          )}
          {a.decisionReason && (
            <div className="sm:col-span-2">
              <dt className="text-slate-500">Decision note</dt>
              <dd className="font-medium">{a.decisionReason}</dd>
            </div>
          )}
          {a.journalId && (
            <div>
              <dt className="text-slate-500">Ledger</dt>
              <dd>
                <Link
                  className="font-medium text-brand-700 underline"
                  to={`/c/${companyId}/journals/${a.journalId}`}
                >
                  View journal
                </Link>
              </dd>
            </div>
          )}
        </dl>
      </Card>
      <Card>
        <Table label="Adjustment lines">
          <THead>
            <Tr>
              <Th>Product</Th>
              {a.kind === 'count' && <Th className="text-right">Expected</Th>}
              {a.kind === 'count' && <Th className="text-right">Counted</Th>}
              <Th className="text-right">Change</Th>
              <Th className="text-right">Unit cost</Th>
              <Th className="text-right">Value</Th>
            </Tr>
          </THead>
          <TBody>
            {a.lines.map((l) => (
              <Tr key={l.lineNo}>
                <Td>
                  <span className="font-mono">{l.sku}</span> {l.productName}
                </Td>
                {a.kind === 'count' && (
                  <Td className="text-right tabular-nums">{qty(l.expectedMilli ?? 0, l.unit)}</Td>
                )}
                {a.kind === 'count' && (
                  <Td className="text-right tabular-nums">{qty(l.enteredMilli, l.unit)}</Td>
                )}
                <Td className="text-right tabular-nums">
                  {l.deltaMilli > 0 ? '+' : ''}
                  {qty(l.deltaMilli, l.unit)}
                </Td>
                <Td className="text-right tabular-nums">
                  {l.unitCostScaled != null
                    ? money(BigInt(l.unitCostScaled) / COST_SCALE, currency)
                    : 'Average'}
                </Td>
                <Td className="text-right tabular-nums">
                  {l.valueMinor != null ? money(l.valueMinor, currency) : '—'}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
      {deciding && (
        <DecideDialog adjustment={a} decision={deciding} onClose={() => setDeciding(null)} />
      )}
    </>
  );
}
