import { doc } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { DecideDialog } from '../../components/DecideDialog';
import { Button } from '../../components/ui/button';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { db } from '../../lib/firebase';
import { useDoc } from '../../lib/firestore-hooks';
import { STATUS_TONE } from '../../lib/inventory';
import { money } from '../../lib/ledger';
import { useRaisedDocs, type CustomerRefundRow } from '../../lib/sales';
import { formatDate, formatDateTime } from '../../lib/utils';

export const sourcePath = (companyId: string, source: CustomerRefundRow['source']) =>
  `/c/${companyId}/sales/${source.type === 'creditNote' ? 'returns' : 'receipts'}/${source.id}`;

/** Refunds, all or for one receipt or credit note. */
export function RefundTable({ rows }: { rows: readonly CustomerRefundRow[] }) {
  const { companyId, company } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  return (
    <Table label="Refunds">
      <THead>
        <Tr>
          <Th>Number</Th>
          <Th>Raised</Th>
          <Th>Customer</Th>
          <Th>From</Th>
          <Th className="text-right">Amount</Th>
          <Th>Status</Th>
        </Tr>
      </THead>
      <TBody>
        {rows.map((r) => (
          <Tr key={r.id}>
            <Td className="font-mono">
              <Link
                to={`/c/${companyId}/sales/refunds/${r.id}`}
                className="text-brand-700 hover:underline"
              >
                {r.number}
              </Link>
            </Td>
            <Td>{formatDateTime(r.createdAt)}</Td>
            <Td>{r.customerName}</Td>
            <Td className="font-mono">{r.source.number}</Td>
            <Td className="text-right tabular-nums">{money(r.amountMinor, currency)}</Td>
            <Td>
              <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}

export function RefundList({ source }: { source: { type: string; id: string } }) {
  const { companyId } = useCompany();
  const rows = useRaisedDocs<CustomerRefundRow>(companyId, 'customerRefunds', {
    sourceId: source.id,
  });
  const data = rows.data.filter((r) => r.source.type === source.type);
  if (rows.loading || data.length === 0) return null;
  return (
    <>
      <h2 className="mb-3 mt-6 text-base font-semibold">Refunds</h2>
      <Card>
        <RefundTable rows={data} />
      </Card>
    </>
  );
}

export default function CustomerRefundDetail() {
  const { companyId, company, member, can } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const { refundId = '' } = useParams();
  const ref = useMemo(
    () => doc(db, `companies/${companyId}/customerRefunds/${refundId}`),
    [companyId, refundId],
  );
  const refund = useDoc<Omit<CustomerRefundRow, 'id'>>(ref);
  const [deciding, setDeciding] = useState<'approved' | 'rejected' | null>(null);
  if (refund.loading) return <Spinner />;
  const r = refund.data;
  if (!r) return <EmptyState title="Refund not found" />;
  const canDecide =
    r.status === 'pending' && r.createdBy !== member?.uid && can('sales.refund.approve');

  return (
    <>
      <PageHeader
        title={`Refund ${r.number}`}
        description={r.customerName}
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link to={`/c/${companyId}/sales?tab=refunds`}>All refunds</Link>
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
      {r.status === 'pending' && (
        <Alert tone="info" className="mb-4">
          {r.createdBy === member?.uid
            ? 'Waiting for a manager to approve. Nothing is paid until then.'
            : 'Waiting for approval. Nothing is paid until it is approved.'}
        </Alert>
      )}
      <Card className="p-4">
        <dl className="grid gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-slate-500">Status</dt>
            <dd>
              <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Amount</dt>
            <dd className="font-medium tabular-nums" data-testid="refund-amount">
              {money(r.amountMinor, currency)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Paid from</dt>
            <dd className="font-medium">{r.accountName}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Paid back from</dt>
            <dd>
              <Link
                className="font-mono font-medium text-brand-700 underline"
                to={sourcePath(companyId, r.source)}
              >
                {r.source.number}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Customer</dt>
            <dd>
              <Link
                className="font-medium text-brand-700 underline"
                to={`/c/${companyId}/customers/${r.customerId}`}
              >
                {r.customerName}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Reason</dt>
            <dd className="font-medium">{r.reason}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Raised</dt>
            <dd className="font-medium">{formatDateTime(r.createdAt)}</dd>
          </div>
          {r.postingDate && (
            <div>
              <dt className="text-slate-500">Paid on</dt>
              <dd className="font-medium">{formatDate(r.postingDate)}</dd>
            </div>
          )}
          {r.decisionReason && (
            <div>
              <dt className="text-slate-500">Decision</dt>
              <dd className="font-medium">{r.decisionReason}</dd>
            </div>
          )}
          {r.journalId && can('ledger.journal.read') && (
            <div>
              <dt className="text-slate-500">Ledger</dt>
              <dd>
                <Link
                  className="font-medium text-brand-700 underline"
                  to={`/c/${companyId}/journals/${r.journalId}`}
                >
                  View journal
                </Link>
              </dd>
            </div>
          )}
        </dl>
      </Card>
      {deciding && (
        <DecideDialog
          target={{ command: 'customerRefund.decide', refundId }}
          number={r.number}
          decision={deciding}
          postsText={`${money(r.amountMinor, currency)} is paid from ${r.accountName}, dated today.`}
          onClose={() => setDeciding(null)}
        />
      )}
    </>
  );
}
