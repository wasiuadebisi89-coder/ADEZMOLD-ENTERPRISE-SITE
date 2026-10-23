import { doc } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { BackdateNotice, useBackdate, useToday } from '../../components/BackdateNotice';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input, Textarea } from '../../components/ui/form';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { db } from '../../lib/firebase';
import { useDoc } from '../../lib/firestore-hooks';
import { ORIGIN_LABEL, money, type JournalRow } from '../../lib/ledger';
import { useAction } from '../../lib/useAction';
import { formatDate, formatDateTime } from '../../lib/utils';

const REVERSIBLE: JournalRow['origin'][] = ['manual', 'opening_balance'];

function ReverseDialog({ journal, onClose }: { journal: JournalRow; onClose: () => void }) {
  const { companyId } = useCompany();
  const navigate = useNavigate();
  const today = useToday();
  const action = useAction();
  const [postingDate, setPostingDate] = useState(today);
  const [reason, setReason] = useState('');
  const backdate = useBackdate(postingDate);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await action.run<{ journalId: string }>('journal.reverse', {
        companyId,
        journalId: journal.id,
        postingDate,
        reason: reason.trim(),
        ...(backdate.approvalId ? { backdateApprovalId: backdate.approvalId } : {}),
      });
      onClose();
      void navigate(`/c/${companyId}/journals/${res.journalId}`);
    } catch {
      /* shown below */
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Reverse ${journal.number}?`}
      description="Posts a mirror journal that cancels this one. The original stays in the ledger, marked as reversed."
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        <Field label="Reversal date" error={action.error?.fields.postingDate}>
          <Input
            type="date"
            value={postingDate}
            min={journal.postingDate}
            max={today}
            onChange={(e) => setPostingDate(e.target.value)}
          />
        </Field>
        <BackdateNotice date={postingDate} state={backdate} />
        <Field
          label="Reason"
          hint="Recorded on the journal and in the audit log."
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
            variant="danger"
            loading={action.pending}
            disabled={reason.trim().length < 3 || (backdate.needsApproval && !backdate.approvalId)}
          >
            Reverse journal
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function JournalDetail() {
  const { companyId, can } = useCompany();
  const { journalId = '' } = useParams();
  const ref = useMemo(
    () => doc(db, `companies/${companyId}/journals/${journalId}`),
    [companyId, journalId],
  );
  const journal = useDoc<Omit<JournalRow, 'id'>>(ref);
  const [reversing, setReversing] = useState(false);

  if (journal.loading) return <Spinner />;
  const j = journal.data;
  if (!j) return <EmptyState title="Journal not found" />;
  const canReverse =
    can('ledger.journal.reverse') && j.status === 'posted' && REVERSIBLE.includes(j.origin);

  return (
    <>
      <PageHeader
        title={`Journal ${j.number}`}
        description={j.memo}
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link to={`/c/${companyId}/journals`}>All journals</Link>
            </Button>
            {canReverse && (
              <Button variant="danger" onClick={() => setReversing(true)}>
                Reverse
              </Button>
            )}
          </>
        }
      />
      {j.status === 'reversed' && j.reversedByJournalId && (
        <Alert tone="info" className="mb-4">
          Reversed by{' '}
          <Link
            className="font-medium underline"
            to={`/c/${companyId}/journals/${j.reversedByJournalId}`}
          >
            the reversal journal
          </Link>
          {j.reversalReason ? `: ${j.reversalReason}` : ''}
        </Alert>
      )}
      {j.reversesJournalId && (
        <Alert tone="info" className="mb-4">
          This journal reverses{' '}
          <Link
            className="font-medium underline"
            to={`/c/${companyId}/journals/${j.reversesJournalId}`}
          >
            {j.reference ?? 'the original journal'}
          </Link>
          .
        </Alert>
      )}
      <Card className="mb-4 p-4">
        <dl className="grid gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-slate-500">Date</dt>
            <dd className="font-medium">{formatDate(j.postingDate)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Type</dt>
            <dd className="font-medium">{ORIGIN_LABEL[j.origin]}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Status</dt>
            <dd>
              <Badge tone={j.status === 'posted' ? 'green' : 'slate'}>{j.status}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Posted</dt>
            <dd className="font-medium">{formatDateTime(j.postedAt)}</dd>
          </div>
          {j.reference && !j.reversesJournalId && (
            <div>
              <dt className="text-slate-500">Reference</dt>
              <dd className="font-medium">{j.reference}</dd>
            </div>
          )}
        </dl>
      </Card>
      <Card>
        <Table label="Journal lines">
          <THead>
            <Tr>
              <Th>#</Th>
              <Th>Account</Th>
              <Th>Note</Th>
              <Th className="text-right">Debit</Th>
              <Th className="text-right">Credit</Th>
            </Tr>
          </THead>
          <TBody>
            {j.lines.map((l) => (
              <Tr key={l.lineNo}>
                <Td>{l.lineNo}</Td>
                <Td>
                  <span className="font-mono">{l.accountCode}</span> {l.accountName}
                </Td>
                <Td>{l.memo ?? ''}</Td>
                <Td className="text-right tabular-nums">
                  {l.debit ? money(l.debit, j.currency) : ''}
                </Td>
                <Td className="text-right tabular-nums">
                  {l.credit ? money(l.credit, j.currency) : ''}
                </Td>
              </Tr>
            ))}
            <Tr>
              <Td />
              <Td className="font-semibold">Totals</Td>
              <Td />
              <Td className="text-right font-semibold tabular-nums">
                {money(j.totalDebit, j.currency)}
              </Td>
              <Td className="text-right font-semibold tabular-nums">
                {money(j.totalCredit, j.currency)}
              </Td>
            </Tr>
          </TBody>
        </Table>
      </Card>
      {reversing && <ReverseDialog journal={j} onClose={() => setReversing(false)} />}
    </>
  );
}
