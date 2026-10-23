import { doc } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { BackdateNotice, useBackdate, useToday } from '../../components/BackdateNotice';
import { JournalLines, emptyLine, lineTotals, type LineDraft } from '../../components/JournalLines';
import { Button } from '../../components/ui/button';
import { Alert, Card, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input, Select } from '../../components/ui/form';
import { useCompany } from '../../lib/company';
import { db } from '../../lib/firebase';
import { useDoc } from '../../lib/firestore-hooks';
import { money, postableForJournals, useAccounts } from '../../lib/ledger';
import { useAction } from '../../lib/useAction';
import { toLineInput, usePostingBranches } from './NewJournal';

export default function OpeningBalances() {
  const { companyId, company } = useCompany();
  const navigate = useNavigate();
  const today = useToday();
  const accounts = useAccounts(companyId);
  const branches = usePostingBranches();
  const ledgerRef = useMemo(() => doc(db, `companies/${companyId}/settings/ledger`), [companyId]);
  const ledger = useDoc<{ openingBalanceJournalId: string | null }>(ledgerRef);
  const action = useAction();
  const currency = company?.baseCurrency ?? 'NGN';

  const [branchId, setBranchId] = useState('');
  const [asAtDate, setAsAtDate] = useState(today);
  const [lines, setLines] = useState<LineDraft[]>(() => [emptyLine()]);
  const backdate = useBackdate(asAtDate);

  const equity = accounts.data.find(
    (a) => a.subtype === 'openingBalanceEquity' && a.status === 'active',
  );
  const usable = postableForJournals(accounts.data).filter((a) => a.id !== equity?.id);
  const branch = branchId || branches.data[0]?.id || '';
  const totals = lineTotals(lines, currency);
  const difference = totals.debit - totals.credit;
  const complete =
    lines.every((l) => l.accountId) &&
    totals.invalid.size === 0 &&
    totals.debit + totals.credit > 0n &&
    !!branch &&
    !!equity &&
    (!backdate.needsApproval || !!backdate.approvalId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await action.run<{ journalId: string }>('openingBalance.post', {
        companyId,
        branchId: branch,
        asAtDate,
        lines: toLineInput(lines),
        ...(backdate.approvalId ? { backdateApprovalId: backdate.approvalId } : {}),
      });
      void navigate(`/c/${companyId}/journals/${res.journalId}`);
    } catch {
      /* shown below */
    }
  };

  if (accounts.loading || branches.loading || ledger.loading) return <Spinner />;

  const existing = ledger.data?.openingBalanceJournalId;
  return (
    <>
      <PageHeader
        title="Opening balances"
        description="General ledger balances at your start date. Customer, supplier and stock balances are entered with their own modules."
      />
      {existing ? (
        <Alert tone="info">
          Opening balances are already posted.{' '}
          <Link className="font-medium underline" to={`/c/${companyId}/journals/${existing}`}>
            View the journal
          </Link>
          . Reverse it to enter them again.
        </Alert>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {action.error && <Alert tone="error">{action.error.message}</Alert>}
          {!equity && (
            <Alert tone="error">
              Add an active account with the "Opening balance equity" role to your chart first.
            </Alert>
          )}
          <Card className="space-y-4 p-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Balances as at" error={action.error?.fields.asAtDate}>
                <Input
                  type="date"
                  value={asAtDate}
                  max={today}
                  onChange={(e) => setAsAtDate(e.target.value)}
                />
              </Field>
              <Field label="Branch">
                <Select value={branch} onChange={(e) => setBranchId(e.target.value)}>
                  {branches.data.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <BackdateNotice date={asAtDate} state={backdate} />
          </Card>
          <Card className="p-4">
            <JournalLines
              lines={lines}
              onChange={setLines}
              accounts={usable}
              currency={currency}
              errorLine={action.error?.lineNo}
              minLines={1}
            />
          </Card>
          <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:justify-end">
            {difference !== 0n && equity && (
              <p className="text-sm text-slate-700" role="status">
                {money(difference < 0n ? -difference : difference, currency)} will be{' '}
                {difference > 0n ? 'credited' : 'debited'} to {equity.code} {equity.name}.
              </p>
            )}
            <Button type="submit" loading={action.pending} disabled={!complete}>
              Post opening balances
            </Button>
          </div>
        </form>
      )}
    </>
  );
}
