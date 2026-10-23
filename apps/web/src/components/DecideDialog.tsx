import { useState } from 'react';
import { useCompany } from '../lib/company';
import { useAction } from '../lib/useAction';
import { Button } from './ui/button';
import { Dialog } from './ui/dialog';
import { Alert } from './ui/feedback';
import { Field, Textarea } from './ui/form';

type Target =
  | { command: 'creditNote.decide'; creditNoteId: string }
  | { command: 'customerRefund.decide'; refundId: string };

/** Approves (and posts) or rejects a document someone else raised, with a reason. */
export function DecideDialog({
  target,
  number,
  decision,
  postsText,
  onClose,
}: {
  target: Target;
  number: string;
  decision: 'approved' | 'rejected';
  postsText: string;
  onClose: () => void;
}) {
  const { companyId } = useCompany();
  const action = useAction();
  const [reason, setReason] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { command, ...ids } = target;
      await action.run(command, { companyId, decision, reason, ...ids } as never);
      onClose();
    } catch {
      /* shown below */
    }
  };
  const label = decision === 'approved' ? 'Approve and post' : 'Reject';
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${label} ${number}?`}
      description={
        decision === 'approved' ? postsText : 'Nothing is posted. It stays on record as rejected.'
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
            {label}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
