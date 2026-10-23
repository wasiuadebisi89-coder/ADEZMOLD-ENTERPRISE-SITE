import { collection, query, where } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import type { Permission } from '@bms/domain';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Textarea } from '../../components/ui/form';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { db } from '../../lib/firebase';
import { useCollection } from '../../lib/firestore-hooks';
import { money } from '../../lib/ledger';
import { useAction } from '../../lib/useAction';
import { formatDate, formatDateTime } from '../../lib/utils';

export type ApprovalRow = {
  id: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'used';
  requestedBy: string;
  requestedAt: { toDate(): Date };
} & (
  | { action: 'period.reopen'; target: { periodId: string } }
  | { action: 'ledger.backdate'; target: { postingDate: string } }
  | {
      action: 'sales.creditOverride';
      target: { customerId: string; customerName: string; amountMinor: number };
    }
);

const APPROVE: Record<ApprovalRow['action'], Permission> = {
  'period.reopen': 'settings.periods.reopen.approve',
  'ledger.backdate': 'ledger.backdate.approve',
  'sales.creditOverride': 'sales.creditLimit.override',
};

export function describeApproval(a: ApprovalRow, currency = 'NGN'): string {
  switch (a.action) {
    case 'period.reopen':
      return `Reopen period ${a.target.periodId}`;
    case 'ledger.backdate':
      return `Post on ${formatDate(a.target.postingDate)}`;
    case 'sales.creditOverride':
      return `Sell ${money(a.target.amountMinor, currency)} on credit to ${a.target.customerName}, over their limit`;
  }
}

/** Open requests: all of them for approvers, otherwise the member's own. */
export function useOpenApprovals() {
  const { companyId, can, member } = useCompany();
  const all = can('approvals.read');
  const q = useMemo(() => {
    const base = collection(db, `companies/${companyId}/approvalRequests`);
    return all
      ? query(base, where('status', 'in', ['pending', 'approved']))
      : query(base, where('requestedBy', '==', member!.uid));
  }, [companyId, all, member]);
  const res = useCollection<Omit<ApprovalRow, 'id'>>(q, `approvals-${companyId}-${all}`);
  const data = (res.data as ApprovalRow[]).filter(
    (a) => a.status === 'pending' || a.status === 'approved',
  );
  return { ...res, data };
}

function DecideDialog({
  approval,
  decision,
  onClose,
}: {
  approval: ApprovalRow;
  decision: 'approved' | 'rejected';
  onClose: () => void;
}) {
  const { companyId, company } = useCompany();
  const action = useAction();
  const [reason, setReason] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await action.run('approval.decide', {
        companyId,
        approvalRequestId: approval.id,
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
      title={`${decision === 'approved' ? 'Approve' : 'Reject'}: ${describeApproval(approval, company?.baseCurrency)}`}
      description={`Reason given: “${approval.reason}”`}
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
            {decision === 'approved' ? 'Approve' : 'Reject'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function Approvals() {
  const { can, member, company } = useCompany();
  const approvals = useOpenApprovals();
  const [deciding, setDeciding] = useState<{
    approval: ApprovalRow;
    decision: 'approved' | 'rejected';
  } | null>(null);

  return (
    <>
      <PageHeader
        title="Approvals"
        description="Requests that need a second person: reopening closed periods, posting beyond the backdating window and selling over a customer's credit limit."
      />
      {approvals.loading ? (
        <Spinner />
      ) : approvals.data.length === 0 ? (
        <EmptyState title="No open requests" />
      ) : (
        <Card>
          <Table label="Open approval requests">
            <THead>
              <Tr>
                <Th>Request</Th>
                <Th>Reason</Th>
                <Th>Requested</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </Tr>
            </THead>
            <TBody>
              {approvals.data.map((a) => {
                const mine = a.requestedBy === member?.uid;
                return (
                  <Tr key={a.id}>
                    <Td>{describeApproval(a, company?.baseCurrency)}</Td>
                    <Td className="max-w-xs truncate whitespace-normal">{a.reason}</Td>
                    <Td>{formatDateTime(a.requestedAt)}</Td>
                    <Td>
                      <Badge tone={a.status === 'approved' ? 'green' : 'amber'}>{a.status}</Badge>
                    </Td>
                    <Td className="text-right">
                      {a.status === 'pending' && !mine && can(APPROVE[a.action]) && (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            onClick={() => setDeciding({ approval: a, decision: 'approved' })}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeciding({ approval: a, decision: 'rejected' })}
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                      {a.status === 'pending' && mine && (
                        <span className="text-xs text-slate-500">Waiting for another approver</span>
                      )}
                      {a.status === 'approved' && mine && a.action !== 'period.reopen' && (
                        <span className="text-xs text-slate-500">
                          Ready to use for one {a.action === 'ledger.backdate' ? 'posting' : 'sale'}
                        </span>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}
      {deciding && <DecideDialog {...deciding} onClose={() => setDeciding(null)} />}
    </>
  );
}
