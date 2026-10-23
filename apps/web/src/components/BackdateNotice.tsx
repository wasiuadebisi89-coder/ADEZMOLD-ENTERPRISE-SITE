import { doc } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { addDays, businessDate, isIsoDate } from '@bms/domain';
import { Button } from './ui/button';
import { Dialog } from './ui/dialog';
import { Alert } from './ui/feedback';
import { Field, Textarea } from './ui/form';
import { useCompany } from '../lib/company';
import { db } from '../lib/firebase';
import { useDoc } from '../lib/firestore-hooks';
import { useMyBackdateApprovals } from '../lib/ledger';
import { useAction } from '../lib/useAction';
import { formatDate } from '../lib/utils';

/** Today's business date in the company's time zone. */
export function useToday(): string {
  const { company } = useCompany();
  return businessDate(new Date(), company?.timeZone ?? 'UTC');
}

/**
 * Works out whether `date` is beyond the backdating window and, if so, which approved request
 * of the current user covers it. The server makes the final decision.
 */
export function useBackdate(date: string) {
  const { companyId, member } = useCompany();
  const today = useToday();
  const settingsRef = useMemo(
    () => doc(db, `companies/${companyId}/settings/general`),
    [companyId],
  );
  const settings = useDoc<{ backdateWindowDays: number }>(settingsRef);
  const approvals = useMyBackdateApprovals(companyId, member?.uid);
  const windowDays = settings.data?.backdateWindowDays ?? 0;
  const needsApproval = isIsoDate(date) && !settings.loading && date < addDays(today, -windowDays);
  const approval = approvals.data.find((a) => a.target.postingDate === date);
  return { needsApproval, approvalId: needsApproval ? approval?.id : undefined, windowDays };
}

export function BackdateNotice({
  date,
  state,
}: {
  date: string;
  state: ReturnType<typeof useBackdate>;
}) {
  const { companyId, can } = useCompany();
  const [asking, setAsking] = useState(false);
  const [sent, setSent] = useState(false);
  const [reason, setReason] = useState('');
  const action = useAction();
  if (!state.needsApproval) return null;
  if (state.approvalId) {
    return (
      <Alert tone="success">
        Your approved backdating request for {formatDate(date)} will be used for this posting.
      </Alert>
    );
  }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // The dialog renders in a portal, but React still bubbles its submit to the posting form.
    e.stopPropagation();
    try {
      await action.run('approval.request', {
        companyId,
        action: 'ledger.backdate',
        target: { postingDate: date },
        reason,
      });
      setAsking(false);
      setSent(true);
    } catch {
      /* shown below */
    }
  };
  return (
    <>
      <Alert tone="info">
        {formatDate(date)} is more than {state.windowDays} day{state.windowDays === 1 ? '' : 's'}{' '}
        ago, so posting needs an approved request.{' '}
        {sent ? (
          'Request sent. You can post once another user approves it.'
        ) : can('ledger.backdate.request') ? (
          <Button size="sm" variant="secondary" type="button" onClick={() => setAsking(true)}>
            Request approval
          </Button>
        ) : (
          'Ask an accountant or manager to post it.'
        )}
      </Alert>
      {asking && (
        <Dialog
          open
          onOpenChange={(o) => !o && setAsking(false)}
          title={`Request to post on ${formatDate(date)}`}
          description="Another user with approval rights must accept it. It can be used for one posting."
        >
          <form onSubmit={submit} className="space-y-4">
            {action.error && <Alert tone="error">{action.error.message}</Alert>}
            <Field
              label="Reason"
              hint="Recorded in the audit log."
              error={action.error?.fields.reason}
            >
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" type="button" onClick={() => setAsking(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={action.pending} disabled={reason.trim().length < 3}>
                Send request
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
