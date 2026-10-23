import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { branchAllowed } from '@bms/domain';
import { BackdateNotice, useBackdate, useToday } from '../../components/BackdateNotice';
import { JournalLines, emptyLine, lineTotals, type LineDraft } from '../../components/JournalLines';
import { Button } from '../../components/ui/button';
import { Alert, Card, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input, Select } from '../../components/ui/form';
import { useCompany } from '../../lib/company';
import { money, postableForJournals, useAccounts } from '../../lib/ledger';
import { useAction } from '../../lib/useAction';
import { useBranches, type BranchRow } from './Members';

/** Active branches the member may post for. */
export function usePostingBranches(): { loading: boolean; data: BranchRow[] } {
  const { companyId, member } = useCompany();
  const branches = useBranches(companyId);
  return {
    loading: branches.loading,
    data: branches.data.filter(
      (b) => b.status === 'active' && member && branchAllowed(member.branchScope, b.id),
    ),
  };
}

export function toLineInput(lines: LineDraft[]) {
  return lines.map((l) => ({
    accountId: l.accountId,
    debit: l.debit,
    credit: l.credit,
    ...(l.memo.trim() ? { memo: l.memo.trim() } : {}),
  }));
}

export default function NewJournal() {
  const { companyId, company } = useCompany();
  const navigate = useNavigate();
  const today = useToday();
  const accounts = useAccounts(companyId);
  const branches = usePostingBranches();
  const action = useAction();
  const currency = company?.baseCurrency ?? 'NGN';

  const [branchId, setBranchId] = useState('');
  const [postingDate, setPostingDate] = useState(today);
  const [memo, setMemo] = useState('');
  const [reference, setReference] = useState('');
  const [lines, setLines] = useState<LineDraft[]>(() => [emptyLine(), emptyLine()]);
  const backdate = useBackdate(postingDate);

  const branch = branchId || branches.data[0]?.id || '';
  const totals = lineTotals(lines, currency);
  const difference = totals.debit - totals.credit;
  const complete =
    lines.every((l) => l.accountId) &&
    totals.invalid.size === 0 &&
    difference === 0n &&
    totals.debit > 0n &&
    memo.trim().length >= 3 &&
    !!branch &&
    (!backdate.needsApproval || !!backdate.approvalId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await action.run<{ journalId: string }>('journal.post', {
        companyId,
        branchId: branch,
        postingDate,
        memo: memo.trim(),
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        lines: toLineInput(lines),
        ...(backdate.approvalId ? { backdateApprovalId: backdate.approvalId } : {}),
      });
      void navigate(`/c/${companyId}/journals/${res.journalId}`);
    } catch {
      /* shown below */
    }
  };

  if (accounts.loading || branches.loading) return <Spinner />;

  return (
    <>
      <PageHeader
        title="New journal"
        description="For adjustments that no other module records. Control accounts are posted by their own modules."
        actions={
          <Button variant="secondary" asChild>
            <Link to={`/c/${companyId}/journals`}>Cancel</Link>
          </Button>
        }
      />
      <form onSubmit={submit} className="space-y-4" noValidate>
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        <Card className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Date" error={action.error?.fields.postingDate}>
              <Input
                type="date"
                value={postingDate}
                max={today}
                onChange={(e) => setPostingDate(e.target.value)}
              />
            </Field>
            <Field label="Branch" error={action.error?.fields.branchId}>
              <Select value={branch} onChange={(e) => setBranchId(e.target.value)}>
                {branches.data.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Reference (optional)" error={action.error?.fields.reference}>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                maxLength={60}
              />
            </Field>
          </div>
          <Field label="Description" error={action.error?.fields.memo}>
            <Input value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={300} />
          </Field>
          <BackdateNotice date={postingDate} state={backdate} />
        </Card>
        <Card className="p-4">
          <JournalLines
            lines={lines}
            onChange={setLines}
            accounts={postableForJournals(accounts.data)}
            currency={currency}
            errorLine={action.error?.lineNo}
          />
        </Card>
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:justify-end">
          {difference !== 0n && (
            <p className="text-sm font-medium text-red-700" role="status">
              Out of balance by {money(difference < 0n ? -difference : difference, currency)}
            </p>
          )}
          <Button type="submit" loading={action.pending} disabled={!complete}>
            Post journal
          </Button>
        </div>
      </form>
    </>
  );
}
