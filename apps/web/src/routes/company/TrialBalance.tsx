import { collection, getAggregateFromServer, query, sum, where } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import { isIsoDate, trialBalance, type TrialBalance as TB } from '@bms/domain';
import { useToday } from '../../components/BackdateNotice';
import { Button } from '../../components/ui/button';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input } from '../../components/ui/form';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { db } from '../../lib/firebase';
import { TYPE_LABEL, money, useAccounts, type AccountRow } from '../../lib/ledger';
import { formatDate, loadErrorMessage } from '../../lib/utils';

/**
 * Balances come from server-side sums over ledger entries (docs/bms/adr/0004), one query per
 * postable account.
 */
async function loadTrialBalance(
  companyId: string,
  accounts: readonly AccountRow[],
  asAt: string,
): Promise<TB> {
  const entries = collection(db, `companies/${companyId}/ledgerEntries`);
  const inputs = await Promise.all(
    accounts
      .filter((a) => a.isPostable && a.hasPostings)
      .map(async (account) => {
        const snap = await getAggregateFromServer(
          query(entries, where('accountId', '==', account.id), where('postingDate', '<=', asAt)),
          { debit: sum('debit'), credit: sum('credit') },
        );
        return {
          account,
          debit: BigInt(snap.data().debit ?? 0),
          credit: BigInt(snap.data().credit ?? 0),
        };
      }),
  );
  return trialBalance(inputs);
}

export default function TrialBalance() {
  const { companyId, company } = useCompany();
  const today = useToday();
  const accounts = useAccounts(companyId);
  const currency = company?.baseCurrency ?? 'NGN';
  const [asAt, setAsAt] = useState(today);
  const [result, setResult] = useState<{ asAt: string; tb: TB } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(
    async (date: string) => {
      setRunning(true);
      setError(null);
      try {
        setResult({ asAt: date, tb: await loadTrialBalance(companyId, accounts.data, date) });
      } catch (e) {
        setError(
          loadErrorMessage(e, 'Could not load balances. Check your connection and try again.'),
        );
      } finally {
        setRunning(false);
      }
    },
    [companyId, accounts.data],
  );

  const ready = !accounts.loading;
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void loadTrialBalance(companyId, accounts.data, today)
      .then((tb) => !cancelled && setResult({ asAt: today, tb }))
      .catch((e) => !cancelled && setError(loadErrorMessage(e, 'Could not load balances.')));
    return () => {
      cancelled = true;
    };
    // Load once when the chart is available; later runs are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, companyId]);

  return (
    <>
      <PageHeader
        title="Trial balance"
        description="Net balance of every account from all postings up to the chosen date."
      />
      <Card className="mb-4 p-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (isIsoDate(asAt)) void run(asAt);
          }}
        >
          <Field label="As at">
            <Input type="date" value={asAt} onChange={(e) => setAsAt(e.target.value)} />
          </Field>
          <Button type="submit" loading={running} disabled={!isIsoDate(asAt)}>
            Show balances
          </Button>
        </form>
      </Card>
      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}
      {!result ? (
        <Spinner />
      ) : result.tb.rows.length === 0 ? (
        <EmptyState
          title="No balances"
          description={`Nothing is posted up to ${formatDate(result.asAt)}.`}
        />
      ) : (
        <Card>
          <div className="flex items-center justify-between px-4 py-3 text-sm">
            <span>As at {formatDate(result.asAt)}</span>
            {result.tb.balanced ? (
              <Badge tone="green">Balanced</Badge>
            ) : (
              <Badge tone="red">Out of balance</Badge>
            )}
          </div>
          <Table label="Trial balance">
            <THead>
              <Tr>
                <Th>Code</Th>
                <Th>Account</Th>
                <Th>Type</Th>
                <Th className="text-right">Debit</Th>
                <Th className="text-right">Credit</Th>
              </Tr>
            </THead>
            <TBody>
              {result.tb.rows.map((r) => (
                <Tr key={r.accountId}>
                  <Td className="font-mono">{r.code}</Td>
                  <Td>{r.name}</Td>
                  <Td>{TYPE_LABEL[r.type]}</Td>
                  <Td className="text-right tabular-nums">
                    {r.debit ? money(r.debit, currency) : ''}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {r.credit ? money(r.credit, currency) : ''}
                  </Td>
                </Tr>
              ))}
              <Tr>
                <Td />
                <Td className="font-semibold">Totals</Td>
                <Td />
                <Td className="text-right font-semibold tabular-nums" data-testid="tb-debit">
                  {money(result.tb.totalDebit, currency)}
                </Td>
                <Td className="text-right font-semibold tabular-nums" data-testid="tb-credit">
                  {money(result.tb.totalCredit, currency)}
                </Td>
              </Tr>
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
