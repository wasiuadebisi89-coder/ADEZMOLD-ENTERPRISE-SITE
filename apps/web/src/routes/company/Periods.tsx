import { collection, orderBy, query, where } from 'firebase/firestore';
import { CalendarPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { BackdateNotice, useBackdate, useToday } from '../../components/BackdateNotice';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Select, Textarea } from '../../components/ui/form';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { db } from '../../lib/firebase';
import { useCollection } from '../../lib/firestore-hooks';
import { useAction } from '../../lib/useAction';
import { formatDate, formatDateTime } from '../../lib/utils';
import { usePostingBranches } from './NewJournal';

export const PERIOD_STATUS = {
  open: { label: 'Open', tone: 'green' },
  soft_closed: { label: 'Soft-closed', tone: 'amber' },
  closed: { label: 'Closed', tone: 'slate' },
} as const;

type Status = keyof typeof PERIOD_STATUS;

interface PeriodRow {
  id: string;
  fiscalYearId: string;
  startDate: string;
  endDate: string;
  status: Status;
  statusChangedAt: { toDate(): Date };
}
interface FiscalYearRow {
  id: string;
  startDate: string;
  endDate: string;
  closingJournalIds?: string[];
}
interface ApprovalRow {
  id: string;
  action: 'period.reopen';
  target: { periodId: string };
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'used';
  requestedBy: string;
  requestedAt: { toDate(): Date };
}

type Pending =
  | { kind: 'status'; period: PeriodRow; to: Status; approvalRequestId?: string }
  | { kind: 'request'; period: PeriodRow }
  | { kind: 'decide'; approval: ApprovalRow; decision: 'approved' | 'rejected' };

function ActionDialog({ pending, onClose }: { pending: Pending; onClose: () => void }) {
  const { companyId } = useCompany();
  const action = useAction();
  const [reason, setReason] = useState('');
  const reasonRequired = pending.kind !== 'status' || !!pending.approvalRequestId;

  const { title, description, confirm, danger } = (() => {
    switch (pending.kind) {
      case 'status': {
        const label = pending.period.id;
        if (pending.to === 'closed')
          return {
            title: `Close ${label}?`,
            description: 'No one can post to a closed period. Reopening needs an approved request.',
            confirm: 'Close period',
            danger: true,
          };
        if (pending.to === 'soft_closed')
          return {
            title: `Soft-close ${label}?`,
            description: 'Only users allowed to post to soft-closed periods can post.',
            confirm: 'Soft-close',
            danger: false,
          };
        return {
          title: `Reopen ${label}?`,
          description: 'Postings will be allowed again.',
          confirm: 'Reopen',
          danger: false,
        };
      }
      case 'request':
        return {
          title: `Request to reopen ${pending.period.id}`,
          description:
            'Another approver must accept this request before the period can be reopened.',
          confirm: 'Send request',
          danger: false,
        };
      case 'decide':
        return {
          title: `${pending.decision === 'approved' ? 'Approve' : 'Reject'} reopening ${pending.approval.target.periodId}?`,
          description: `Reason given: “${pending.approval.reason}”`,
          confirm: pending.decision === 'approved' ? 'Approve' : 'Reject',
          danger: pending.decision === 'rejected',
        };
    }
  })();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (pending.kind === 'status') {
        await action.run('period.setStatus', {
          companyId,
          periodId: pending.period.id,
          status: pending.to,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
          ...(pending.approvalRequestId ? { approvalRequestId: pending.approvalRequestId } : {}),
        });
      } else if (pending.kind === 'request') {
        await action.run('approval.request', {
          companyId,
          action: 'period.reopen',
          target: { periodId: pending.period.id },
          reason,
        });
      } else {
        await action.run('approval.decide', {
          companyId,
          approvalRequestId: pending.approval.id,
          decision: pending.decision,
          reason,
        });
      }
      onClose();
    } catch {
      /* shown below */
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={title} description={description}>
      <form onSubmit={submit} className="space-y-4">
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        <Field
          label={reasonRequired ? 'Reason' : 'Note (optional)'}
          hint="Recorded in the audit log."
          error={action.error?.fields.reason}
        >
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant={danger ? 'danger' : 'primary'}
            loading={action.pending}
            disabled={reasonRequired && reason.trim().length < 3}
          >
            {confirm}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Moves the year's income and expenses into retained earnings (ACCOUNTING_POLICIES §14). */
function YearEndClose({ year, periods }: { year: FiscalYearRow; periods: PeriodRow[] }) {
  const { companyId, can } = useCompany();
  const today = useToday();
  const branches = usePostingBranches();
  const backdate = useBackdate(year.endDate);
  const action = useAction();
  const [done, setDone] = useState<{ journalId: string; number: string } | null>(null);
  const closings = year.closingJournalIds ?? [];
  const ended = year.endDate < today;
  const open = periods.filter((p) => p.status === 'open');
  const branch = branches.data[0]?.id ?? '';
  const run = async () => {
    setDone(null);
    try {
      setDone(
        await action.run<{ journalId: string; number: string }>('fiscalYear.close', {
          companyId,
          fiscalYearId: year.id,
          branchId: branch,
          ...(backdate.approvalId ? { backdateApprovalId: backdate.approvalId } : {}),
        }),
      );
    } catch {
      /* shown below */
    }
  };
  return (
    <Card className="mb-4 space-y-3 p-4">
      <h2 className="text-base font-semibold">Year-end close</h2>
      <p className="text-sm text-slate-600">
        Moves this year&apos;s income and expenses into retained earnings with one journal dated{' '}
        {formatDate(year.endDate)}. Profit and loss reports leave it out. If anything is posted to
        the year later, close it again to move that too.
      </p>
      {closings.length > 0 && (
        <p className="text-sm" data-testid="year-closed">
          Closed {closings.length} time{closings.length === 1 ? '' : 's'}.
        </p>
      )}
      {action.error && <Alert tone="error">{action.error.message}</Alert>}
      {done && (
        <Alert tone="success">
          {done.number} posted.{' '}
          {can('ledger.journal.read') && (
            <Link className="underline" to={`/c/${companyId}/journals/${done.journalId}`}>
              View journal
            </Link>
          )}
        </Alert>
      )}
      {!ended ? (
        <p className="text-sm text-slate-500">The year can be closed after it ends.</p>
      ) : open.length > 0 ? (
        <p className="text-sm text-slate-500">
          Close or soft-close every month first ({open.length} still open).
        </p>
      ) : (
        <>
          <BackdateNotice date={year.endDate} state={backdate} />
          <Button
            onClick={() => void run()}
            loading={action.pending}
            disabled={!branch || (backdate.needsApproval && !backdate.approvalId)}
          >
            {closings.length > 0 ? 'Close the year again' : 'Close the year'}
          </Button>
        </>
      )}
    </Card>
  );
}

export default function Periods() {
  const { companyId, can, member } = useCompany();
  const yearsQ = useMemo(
    () => query(collection(db, `companies/${companyId}/fiscalYears`), orderBy('startDate', 'desc')),
    [companyId],
  );
  const years = useCollection<Omit<FiscalYearRow, 'id'>>(yearsQ, `fy-${companyId}`);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const yearId = selectedYear ?? years.data[0]?.id ?? null;
  const periodsQ = useMemo(
    () =>
      yearId
        ? query(
            collection(db, `companies/${companyId}/periods`),
            where('fiscalYearId', '==', yearId),
          )
        : null,
    [companyId, yearId],
  );
  const periods = useCollection<Omit<PeriodRow, 'id'>>(periodsQ, `periods-${companyId}-${yearId}`);
  const canSeeAllApprovals = can('approvals.read');
  const approvalsQ = useMemo(() => {
    const base = collection(db, `companies/${companyId}/approvalRequests`);
    return canSeeAllApprovals
      ? query(base, where('status', 'in', ['pending', 'approved']))
      : query(base, where('requestedBy', '==', member!.uid));
  }, [companyId, canSeeAllApprovals, member]);
  const approvals = useCollection<Omit<ApprovalRow, 'id'>>(
    approvalsQ,
    `approvals-${companyId}-${canSeeAllApprovals}`,
  );
  const createYear = useAction();
  const [pending, setPending] = useState<Pending | null>(null);

  const canClose = can('settings.periods.close');
  const canRequest = can('settings.periods.reopen.request');
  const canApprove = can('settings.periods.reopen.approve');
  const rows = [...periods.data].sort((a, b) => a.id.localeCompare(b.id));
  // Backdating requests share the collection; they are listed on the Approvals page.
  const openApprovals = approvals.data.filter(
    (a) => a.action === 'period.reopen' && (a.status === 'pending' || a.status === 'approved'),
  );
  const approvalFor = (periodId: string) =>
    openApprovals.find((a) => a.target.periodId === periodId);

  const nextYearStart = years.data[0]
    ? Number(years.data[0].endDate.slice(0, 4)) +
      (years.data[0].endDate.slice(5) === '12-31' ? 1 : 0)
    : null;

  return (
    <>
      <PageHeader
        title="Financial periods"
        description="Close periods once their records are final. Closed periods accept no postings."
        actions={
          <>
            {years.data.length > 1 && (
              <Select
                aria-label="Financial year"
                value={yearId ?? ''}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-48"
              >
                {years.data.map((y) => (
                  <option key={y.id} value={y.id}>
                    {formatDate(y.startDate)} – {formatDate(y.endDate)}
                  </option>
                ))}
              </Select>
            )}
            {canClose && nextYearStart && (
              <Button
                variant="secondary"
                loading={createYear.pending}
                onClick={() =>
                  void createYear
                    .run('fiscalYear.create', { companyId, startYear: nextYearStart })
                    .catch(() => undefined)
                }
              >
                <CalendarPlus className="size-4" aria-hidden /> Add next financial year
              </Button>
            )}
          </>
        }
      />
      {createYear.error && (
        <Alert tone="error" className="mb-4">
          {createYear.error.message}
        </Alert>
      )}

      {canClose && !periods.loading && years.data.find((y) => y.id === yearId) && (
        <YearEndClose year={years.data.find((y) => y.id === yearId)!} periods={rows} />
      )}
      <Card>
        {periods.loading || years.loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState title="No periods" description="Create a financial year to start." />
        ) : (
          <Table label="Financial periods">
            <THead>
              <Tr>
                <Th>Period</Th>
                <Th>Dates</Th>
                <Th>Status</Th>
                <Th>Changed</Th>
                <Th className="text-right">Actions</Th>
              </Tr>
            </THead>
            <TBody>
              {rows.map((p) => {
                const approval = approvalFor(p.id);
                return (
                  <Tr key={p.id}>
                    <Td className="font-mono">{p.id}</Td>
                    <Td>
                      {formatDate(p.startDate)} – {formatDate(p.endDate)}
                    </Td>
                    <Td>
                      <Badge tone={PERIOD_STATUS[p.status].tone}>
                        {PERIOD_STATUS[p.status].label}
                      </Badge>
                    </Td>
                    <Td>{formatDateTime(p.statusChangedAt)}</Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        {canClose && p.status === 'open' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setPending({ kind: 'status', period: p, to: 'soft_closed' })
                            }
                          >
                            Soft-close
                          </Button>
                        )}
                        {canClose && p.status !== 'closed' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setPending({ kind: 'status', period: p, to: 'closed' })}
                          >
                            Close
                          </Button>
                        )}
                        {canClose && p.status === 'soft_closed' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setPending({ kind: 'status', period: p, to: 'open' })}
                          >
                            Reopen
                          </Button>
                        )}
                        {p.status === 'closed' && !approval && canRequest && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setPending({ kind: 'request', period: p })}
                          >
                            Request reopen
                          </Button>
                        )}
                        {p.status === 'closed' && approval?.status === 'pending' && (
                          <Badge tone="amber">Reopen requested</Badge>
                        )}
                        {p.status === 'closed' && approval?.status === 'approved' && canClose && (
                          <Button
                            size="sm"
                            onClick={() =>
                              setPending({
                                kind: 'status',
                                period: p,
                                to: 'open',
                                approvalRequestId: approval.id,
                              })
                            }
                          >
                            Reopen (approved)
                          </Button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      <section className="mt-8">
        <h2 className="mb-3 text-base font-semibold">Reopen requests</h2>
        {openApprovals.length === 0 ? (
          <EmptyState title="No open requests" />
        ) : (
          <Card>
            <Table label="Reopen requests">
              <THead>
                <Tr>
                  <Th>Period</Th>
                  <Th>Reason</Th>
                  <Th>Requested</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </Tr>
              </THead>
              <TBody>
                {openApprovals.map((a) => (
                  <Tr key={a.id}>
                    <Td className="font-mono">{a.target.periodId}</Td>
                    <Td className="max-w-xs truncate whitespace-normal">{a.reason}</Td>
                    <Td>{formatDateTime(a.requestedAt)}</Td>
                    <Td>
                      <Badge tone={a.status === 'approved' ? 'green' : 'amber'}>{a.status}</Badge>
                    </Td>
                    <Td className="text-right">
                      {a.status === 'pending' && canApprove && a.requestedBy !== member?.uid && (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            onClick={() =>
                              setPending({ kind: 'decide', approval: a, decision: 'approved' })
                            }
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setPending({ kind: 'decide', approval: a, decision: 'rejected' })
                            }
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                      {a.status === 'pending' && a.requestedBy === member?.uid && (
                        <span className="text-xs text-slate-500">Waiting for another approver</span>
                      )}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </Card>
        )}
      </section>

      {pending && <ActionDialog pending={pending} onClose={() => setPending(null)} />}
    </>
  );
}
