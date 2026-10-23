import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { addMonths, lastDayOfMonth } from '@bms/domain';
import { BackdateNotice, useBackdate, useToday } from '../../components/BackdateNotice';
import { Button } from '../../components/ui/button';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input, Select } from '../../components/ui/form';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import {
  ASSET_TONE,
  bookValue,
  loadMovements,
  monthLabel,
  useDepreciationRuns,
  useFixedAssets,
  type FixedAssetRow,
} from '../../lib/assets';
import { useCompany } from '../../lib/company';
import { money, useAccounts, type AccountRow } from '../../lib/ledger';
import { useAction } from '../../lib/useAction';
import { formatDate, formatDateTime } from '../../lib/utils';
import { usePostingBranches } from './NewJournal';

/** The latest month that has ended: this month on its last day, otherwise last month. */
function latestEndedMonth(today: string): string {
  const month = today.slice(0, 7);
  return lastDayOfMonth(month) <= today ? month : addMonths(month, -1);
}

function RunDepreciation() {
  const { companyId, company } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const today = useToday();
  const branches = usePostingBranches();
  const action = useAction();
  const latest = latestEndedMonth(today);
  const [month, setMonth] = useState(latest);
  const [branchId, setBranchId] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const postingDate = /^\d{4}-\d{2}$/.test(month) ? lastDayOfMonth(month) : '';
  const backdate = useBackdate(postingDate);
  const branch = branchId || branches.data[0]?.id || '';
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDone(null);
    try {
      const res = await action.run<{ number: string; assets: number }>('depreciation.run', {
        companyId,
        branchId: branch,
        month,
        ...(backdate.approvalId ? { backdateApprovalId: backdate.approvalId } : {}),
      });
      setDone(
        `${res.number} posted for ${res.assets} asset${res.assets === 1 ? '' : 's'}, dated ${formatDate(postingDate)}.`,
      );
    } catch {
      /* shown below */
    }
  };
  if (branches.loading) return <Spinner />;
  return (
    <Card className="mb-6 p-4">
      <h2 className="mb-1 text-base font-semibold">Run depreciation</h2>
      <p className="mb-3 text-sm text-slate-600">
        Charges every active asset in the branch up to the end of the month chosen, including any
        months missed. It is posted on the month&apos;s last day, so a month can be run once it has
        ended. Amounts are in {currency}.
      </p>
      <form onSubmit={submit} className="space-y-3" noValidate>
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        {done && <Alert tone="success">{done}</Alert>}
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Up to the end of">
            <Input
              type="month"
              value={month}
              max={latest}
              onChange={(e) => {
                setMonth(e.target.value);
                setDone(null);
              }}
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
          <Button
            type="submit"
            loading={action.pending}
            disabled={
              !postingDate || month > latest || (backdate.needsApproval && !backdate.approvalId)
            }
          >
            Post depreciation
          </Button>
        </div>
        {postingDate && <BackdateNotice date={postingDate} state={backdate} />}
      </form>
    </Card>
  );
}

/** Compares the register with the ledger balances of the accounts it uses. */
function LedgerCheck({ assets, accounts }: { assets: FixedAssetRow[]; accounts: AccountRow[] }) {
  const { companyId, company } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const today = useToday();
  const [ledger, setLedger] = useState<Map<string, bigint> | null>(null);
  const [error, setError] = useState(false);
  const used = useMemo(
    () => accounts.filter((a) => a.subtype === 'fixedAsset' || a.subtype === 'accumDepreciation'),
    [accounts],
  );
  useEffect(() => {
    let cancelled = false;
    loadMovements(companyId, used, { to: today })
      .then((rows) => {
        if (!cancelled) {
          setLedger(new Map(rows.map((r) => [r.account.id, r.debit - r.credit])));
        }
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [companyId, used, today]);
  if (error) return <Alert tone="error">Could not load ledger balances.</Alert>;
  if (!ledger) return <Spinner />;
  // Assets dated after today are not in today's balances.
  const active = assets.filter((a) => a.status === 'active' && a.acquisition.date <= today);
  const rows = used
    .map((account) => {
      const register = active.reduce((s, a) => {
        if (account.subtype === 'fixedAsset' && a.assetAccountId === account.id) {
          return s + BigInt(a.costMinor);
        }
        if (account.subtype === 'accumDepreciation' && a.accumulatedAccountId === account.id) {
          return s - BigInt(a.accumulatedMinor);
        }
        return s;
      }, 0n);
      return { account, register, ledger: ledger.get(account.id) ?? 0n };
    })
    .filter((r) => r.register !== 0n || r.ledger !== 0n);
  const matches = rows.every((r) => r.register === r.ledger);
  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-base font-semibold">Register against the ledger</h2>
        {matches ? <Badge tone="green">Agrees</Badge> : <Badge tone="red">Differs</Badge>}
      </div>
      {!matches && (
        <Alert tone="info" className="mb-3">
          A difference usually means a journal was posted to an asset account by hand. Post the
          asset through the register, or reverse the journal.
        </Alert>
      )}
      <Card>
        <Table label="Register against the ledger">
          <THead>
            <Tr>
              <Th>Account</Th>
              <Th className="text-right">Register</Th>
              <Th className="text-right">Ledger</Th>
              <Th className="text-right">Difference</Th>
            </Tr>
          </THead>
          <TBody>
            {rows.map((r) => (
              <Tr key={r.account.id}>
                <Td>
                  <span className="font-mono">{r.account.code}</span> {r.account.name}
                </Td>
                <Td className="text-right tabular-nums">{money(r.register, currency)}</Td>
                <Td className="text-right tabular-nums">{money(r.ledger, currency)}</Td>
                <Td className="text-right tabular-nums">
                  {money(r.register - r.ledger, currency)}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}

export default function FixedAssets() {
  const { companyId, company, can } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const assets = useFixedAssets(companyId);
  const runs = useDepreciationRuns(companyId);
  const accounts = useAccounts(companyId);
  const [showDisposed, setShowDisposed] = useState(false);
  if (assets.loading || accounts.loading) return <Spinner />;
  const shown = assets.data.filter((a) => showDisposed || a.status === 'active');
  const total = (pick: (a: FixedAssetRow) => number) =>
    shown.filter((a) => a.status === 'active').reduce((s, a) => s + BigInt(pick(a)), 0n);
  const readsLedger = can('reports.financial.read') || can('ledger.journal.read');

  return (
    <>
      <PageHeader
        title="Fixed assets"
        description="Assets the business uses for more than a year, depreciated straight line each month."
        actions={
          can('assets.manage') && (
            <Button asChild>
              <Link to={`/c/${companyId}/fixed-assets/new`}>
                <Plus className="size-4" aria-hidden /> Add asset
              </Link>
            </Button>
          )
        }
      />
      {can('assets.depreciation.post') && <RunDepreciation />}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Register</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={showDisposed}
            onChange={(e) => setShowDisposed(e.target.checked)}
          />
          Show disposed assets
        </label>
      </div>
      {shown.length === 0 ? (
        <EmptyState title="No fixed assets yet" />
      ) : (
        <Card className="mb-6">
          <Table label="Fixed asset register">
            <THead>
              <Tr>
                <Th>Number</Th>
                <Th>Asset</Th>
                <Th>In use from</Th>
                <Th className="text-right">Cost</Th>
                <Th className="text-right">Depreciation</Th>
                <Th className="text-right">Book value</Th>
                <Th>Charged to</Th>
                <Th>Status</Th>
              </Tr>
            </THead>
            <TBody>
              {shown.map((a) => (
                <Tr key={a.id}>
                  <Td className="font-mono">
                    <Link
                      to={`/c/${companyId}/fixed-assets/${a.id}`}
                      className="text-brand-700 hover:underline"
                    >
                      {a.number}
                    </Link>
                  </Td>
                  <Td>{a.name}</Td>
                  <Td>{formatDate(a.availableForUseDate)}</Td>
                  <Td className="text-right tabular-nums">{money(a.costMinor, currency)}</Td>
                  <Td className="text-right tabular-nums">{money(a.accumulatedMinor, currency)}</Td>
                  <Td className="text-right tabular-nums">
                    {a.status === 'active' ? money(bookValue(a), currency) : '—'}
                  </Td>
                  <Td>{a.depreciatedThrough ? monthLabel(a.depreciatedThrough) : 'Not yet'}</Td>
                  <Td>
                    <Badge tone={ASSET_TONE[a.status]}>{a.status}</Badge>
                  </Td>
                </Tr>
              ))}
              <Tr>
                <Td />
                <Td className="font-semibold">Active assets</Td>
                <Td />
                <Td className="text-right font-semibold tabular-nums">
                  {money(
                    total((a) => a.costMinor),
                    currency,
                  )}
                </Td>
                <Td className="text-right font-semibold tabular-nums">
                  {money(
                    total((a) => a.accumulatedMinor),
                    currency,
                  )}
                </Td>
                <Td className="text-right font-semibold tabular-nums" data-testid="fa-book-value">
                  {money(total(bookValue), currency)}
                </Td>
                <Td />
                <Td />
              </Tr>
            </TBody>
          </Table>
        </Card>
      )}
      {readsLedger && accounts.data.length > 0 && (
        <div className="mb-6">
          <LedgerCheck assets={assets.data} accounts={accounts.data} />
        </div>
      )}
      <h2 className="mb-3 text-base font-semibold">Depreciation runs</h2>
      <Card>
        {runs.loading ? (
          <Spinner />
        ) : runs.data.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">None yet.</p>
        ) : (
          <Table label="Depreciation runs">
            <THead>
              <Tr>
                <Th>Up to</Th>
                <Th>Journal</Th>
                <Th className="text-right">Assets</Th>
                <Th className="text-right">Charged</Th>
                <Th>Posted</Th>
              </Tr>
            </THead>
            <TBody>
              {runs.data.map((r) => (
                <Tr key={r.id}>
                  <Td>{monthLabel(r.month)}</Td>
                  <Td className="font-mono">
                    {readsLedger ? (
                      <Link
                        to={`/c/${companyId}/journals/${r.journalId}`}
                        className="text-brand-700 hover:underline"
                      >
                        {r.journalNumber}
                      </Link>
                    ) : (
                      r.journalNumber
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">{r.assets.length}</Td>
                  <Td className="text-right tabular-nums">{money(r.totalMinor, currency)}</Td>
                  <Td>{formatDateTime(r.postedAt)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
