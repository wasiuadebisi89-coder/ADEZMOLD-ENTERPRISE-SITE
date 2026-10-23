import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toDecimalString } from '@bms/domain';
import { useCompany } from '../lib/company';
import { money, tryParseMoney, useAccounts } from '../lib/ledger';
import { useAction } from '../lib/useAction';
import { Button } from './ui/button';
import { Dialog } from './ui/dialog';
import { Alert } from './ui/feedback';
import { Field, Input, Select, Textarea } from './ui/form';

/** Pays a customer back from an unused receipt or credit note. */
export function RefundDialog({
  source,
  available,
  onClose,
}: {
  source: { type: 'customerReceipt' | 'creditNote'; id: string; number: string };
  available: number;
  onClose: () => void;
}) {
  const { companyId, company, can } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const navigate = useNavigate();
  const accounts = useAccounts(companyId);
  const action = useAction();
  const from = accounts.data.filter(
    (a) => a.status === 'active' && a.isPostable && (a.subtype === 'cash' || a.subtype === 'bank'),
  );
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState(toDecimalString(BigInt(available), currency));
  const [reason, setReason] = useState('');
  const account = accountId || from[0]?.id || '';
  const value = tryParseMoney(amount, currency);
  const postsNow = can('sales.refund.post');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await action.run<{ refundId: string }>('customerRefund.create', {
        companyId,
        source: { type: source.type, id: source.id },
        accountId: account,
        amount,
        reason,
      });
      void navigate(`/c/${companyId}/sales/refunds/${res.refundId}`);
    } catch {
      /* shown below */
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Refund from ${source.number}`}
      description={`${money(available, currency)} is left to pay back. ${
        postsNow
          ? 'The refund is posted today.'
          : 'A manager approves the refund before it is paid.'
      }`}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        <Field label="Pay from">
          <Select value={account} onChange={(e) => setAccountId(e.target.value)}>
            {from.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} · {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount to pay back" error={action.error?.fields.amount}>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Reason" hint="Recorded in the audit log." error={action.error?.fields.reason}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={action.pending}
            disabled={
              !account ||
              value === null ||
              value <= 0n ||
              value > BigInt(available) ||
              reason.trim().length < 3
            }
          >
            {postsNow ? 'Pay back' : 'Ask for approval'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
