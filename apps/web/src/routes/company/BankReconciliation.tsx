import { collection, doc, limit, orderBy, query, where } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { parseMoney } from '@bms/domain';
import { useToday } from '../../components/BackdateNotice';
import { Button } from '../../components/ui/button';
import { Alert, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input, Select } from '../../components/ui/form';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { db } from '../../lib/firebase';
import { useCollection, useDoc } from '../../lib/firestore-hooks';
import { money, useAccounts } from '../../lib/ledger';
import { useAction } from '../../lib/useAction';
import { formatDate, formatDateTime } from '../../lib/utils';

type Stamp = { toDate(): Date };

interface EntryRow {
  id: string;
  journalId: string;
  journalNumber: string;
  postingDate: string;
  debit: number;
  credit: number;
  memo: string | null;
}

interface ReconciliationRow {
  id: string;
  statementDate: string;
  openingBalanceMinor: number;
  statementBalanceMinor: number;
  entryIds: string[];
  completedAt: Stamp;
}

/** The statement balance may be negative (an overdraft). */
function parseBalance(value: string, currency: string): bigint | null {
  if (!value.trim()) return null;
  try {
    return parseMoney(value, currency);
  } catch {
    return null;
  }
}

/** The most entries one reconciliation can clear (one Firestore transaction). */
const MAX_ENTRIES = 400;

function Reconcile({ accountId }: { accountId: string }) {
  const { companyId, company, can } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const today = useToday();
  const action = useAction();
  const base = `companies/${companyId}`;
  const stateRef = useMemo(() => doc(db, `${base}/bankStates/${accountId}`), [base, accountId]);
  const state = useDoc<{ reconciledBalanceMinor: number; lastStatementDate: string }>(stateRef);
  const entriesQ = useMemo(
    () =>
      query(
        collection(db, `${base}/ledgerEntries`),
        where('accountId', '==', accountId),
        // The newest entries: older ones are normally reconciled already.
        orderBy('postingDate', 'desc'),
        limit(1000),
      ),
    [base, accountId],
  );
  const entries = useCollection<Omit<EntryRow, 'id'>>(entriesQ, `bank-entries-${accountId}`);
  const clearedQ = useMemo(
    () => query(collection(db, `${base}/bankClearings`), where('accountId', '==', accountId)),
    [base, accountId],
  );
  const cleared = useCollection<{ reconciliationId: string }>(
    clearedQ,
    `bank-cleared-${accountId}`,
  );
  const historyQ = useMemo(
    () =>
      query(
        collection(db, `${base}/bankReconciliations`),
        where('accountId', '==', accountId),
        orderBy('completedAt', 'desc'),
        limit(20),
      ),
    [base, accountId],
  );
  const history = useCollection<Omit<ReconciliationRow, 'id'>>(historyQ, `bank-recs-${accountId}`);
  const [statementDate, setStatementDate] = useState(today);
  const [balance, setBalance] = useState('');
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [done, setDone] = useState(false);

  if (state.loading || entries.loading || cleared.loading) return <Spinner />;
  const clearedIds = new Set(cleared.data.map((c) => c.id));
  const open = (entries.data as EntryRow[])
    .filter((e) => !clearedIds.has(e.id) && e.postingDate <= statementDate)
    .sort((a, b) => a.postingDate.localeCompare(b.postingDate));
  const opening = BigInt(state.data?.reconciledBalanceMinor ?? 0);
  const tickedNet = open
    .filter((e) => ticked.has(e.id))
    .reduce((s, e) => s + BigInt(e.debit) - BigInt(e.credit), 0n);
  const statement = parseBalance(balance, currency);
  const difference = statement === null ? null : statement - (opening + tickedNet);
  const mayReconcile = can('ledger.bank.reconcile');
  const toggle = (id: string) => {
    const next = new Set(ticked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setTicked(next);
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await action.run('bankReconciliation.complete', {
        companyId,
        accountId,
        statementDate,
        statementBalance: balance.replace(/,/g, '').trim(),
        entryIds: open.filter((x) => ticked.has(x.id)).map((x) => x.id),
      });
      setTicked(new Set());
      setBalance('');
      setDone(true);
    } catch {
      /* shown below */
    }
  };

  return (
    <>
      <p className="mb-4 text-sm text-slate-600" data-testid="bank-last">
        {state.data
          ? `Reconciled to ${formatDate(state.data.lastStatementDate)} with a balance of ${money(state.data.reconciledBalanceMinor, currency)}.`
          : 'Not reconciled yet. The first reconciliation starts from zero.'}
      </p>
      {done && !action.error && (
        <Alert tone="success" className="mb-4">
          Reconciliation saved.
        </Alert>
      )}
      {mayReconcile && (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {action.error && <Alert tone="error">{action.error.message}</Alert>}
          <Card className="grid gap-4 p-4 sm:grid-cols-3">
            <Field label="Statement date">
              <Input
                type="date"
                value={statementDate}
                max={today}
                onChange={(e) => setStatementDate(e.target.value)}
              />
            </Field>
            <Field
              label="Closing balance on the statement"
              error={action.error?.fields.statementBalance}
            >
              <Input
                inputMode="decimal"
                value={balance}
                onChange={(e) => {
                  setBalance(e.target.value);
                  setDone(false);
                }}
              />
            </Field>
            <dl className="space-y-1 text-sm tabular-nums">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Reconciled before</dt>
                <dd>{money(opening, currency)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Ticked</dt>
                <dd>{money(tickedNet, currency)}</dd>
              </div>
              <div className="flex justify-between gap-2 font-semibold">
                <dt>Difference</dt>
                <dd data-testid="bank-difference">
                  {difference === null ? '—' : money(difference, currency)}
                </dd>
              </div>
            </dl>
          </Card>
          <Card>
            {open.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">Nothing left to tick up to this date.</p>
            ) : (
              <Table label="Entries not yet reconciled">
                <THead>
                  <Tr>
                    <Th>
                      <span className="sr-only">On statement</span>
                    </Th>
                    <Th>Date</Th>
                    <Th>Journal</Th>
                    <Th>Memo</Th>
                    <Th className="text-right">Money in</Th>
                    <Th className="text-right">Money out</Th>
                  </Tr>
                </THead>
                <TBody>
                  {open.map((e) => (
                    <Tr key={e.id}>
                      <Td>
                        <input
                          type="checkbox"
                          className="size-4"
                          aria-label={`On statement: ${e.journalNumber}`}
                          checked={ticked.has(e.id)}
                          onChange={() => toggle(e.id)}
                        />
                      </Td>
                      <Td>{formatDate(e.postingDate)}</Td>
                      <Td className="font-mono">
                        <Link
                          to={`/c/${companyId}/journals/${e.journalId}`}
                          className="text-brand-700 hover:underline"
                        >
                          {e.journalNumber}
                        </Link>
                      </Td>
                      <Td>{e.memo ?? ''}</Td>
                      <Td className="text-right tabular-nums">
                        {e.debit ? money(e.debit, currency) : ''}
                      </Td>
                      <Td className="text-right tabular-nums">
                        {e.credit ? money(e.credit, currency) : ''}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
          <div className="flex flex-col items-end gap-2">
            {ticked.size > MAX_ENTRIES && (
              <p className="text-sm text-red-700" role="status">
                Tick at most {MAX_ENTRIES} entries at a time; reconcile to an earlier statement
                first.
              </p>
            )}
            <Button
              type="submit"
              loading={action.pending}
              disabled={difference !== 0n || ticked.size > MAX_ENTRIES}
            >
              Finish reconciliation
            </Button>
          </div>
        </form>
      )}
      <h2 className="mb-3 mt-6 text-base font-semibold">Past reconciliations</h2>
      <Card>
        {history.data.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">None yet.</p>
        ) : (
          <Table label="Past reconciliations">
            <THead>
              <Tr>
                <Th>Statement date</Th>
                <Th className="text-right">Balance</Th>
                <Th className="text-right">Entries</Th>
                <Th>Completed</Th>
              </Tr>
            </THead>
            <TBody>
              {(history.data as ReconciliationRow[]).map((r) => (
                <Tr key={r.id}>
                  <Td>{formatDate(r.statementDate)}</Td>
                  <Td className="text-right tabular-nums">
                    {money(r.statementBalanceMinor, currency)}
                  </Td>
                  <Td className="text-right tabular-nums">{r.entryIds.length}</Td>
                  <Td>{formatDateTime(r.completedAt)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}

export default function BankReconciliation() {
  const { companyId } = useCompany();
  const accounts = useAccounts(companyId);
  const [accountId, setAccountId] = useState('');
  if (accounts.loading) return <Spinner />;
  const banks = accounts.data.filter(
    (a) => a.isPostable && (a.subtype === 'bank' || a.subtype === 'cash'),
  );
  const chosen = accountId || banks[0]?.id || '';
  return (
    <>
      <PageHeader
        title="Bank reconciliation"
        description="Tick the entries that appear on the bank statement. When they add up to the statement's closing balance, finish the reconciliation. Anything on the statement that is not in the books needs to be recorded first."
      />
      {banks.length === 0 ? (
        <EmptyState title="No cash or bank accounts" />
      ) : (
        <>
          <Field label="Account" className="mb-4 max-w-sm">
            <Select value={chosen} onChange={(e) => setAccountId(e.target.value)}>
              {banks.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Reconcile key={chosen} accountId={chosen} />
        </>
      )}
    </>
  );
}
