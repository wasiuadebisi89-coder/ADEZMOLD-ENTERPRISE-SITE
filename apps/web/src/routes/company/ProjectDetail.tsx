import { collection, doc, limit, orderBy, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../../components/ui/button';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { db } from '../../lib/firebase';
import { useCollection, useDoc } from '../../lib/firestore-hooks';
import { money, useAccounts, type JournalRow } from '../../lib/ledger';
import {
  PROJECT_TONE,
  loadProjectResult,
  type ProjectLine,
  type ProjectRow,
} from '../../lib/services';
import { useAction } from '../../lib/useAction';
import { formatDate } from '../../lib/utils';

type Result = Awaited<ReturnType<typeof loadProjectResult>>;

function ResultLines({
  title,
  lines,
  currency,
}: {
  title: string;
  lines: ProjectLine[];
  currency: string;
}) {
  return (
    <>
      <Tr>
        <Td className="font-semibold" colSpan={2}>
          {title}
        </Td>
      </Tr>
      {lines.length === 0 ? (
        <Tr>
          <Td className="pl-6 text-slate-500" colSpan={2}>
            None
          </Td>
        </Tr>
      ) : (
        lines.map((l) => (
          <Tr key={l.account.id}>
            <Td className="pl-6">
              {l.account.code} {l.account.name}
            </Td>
            <Td className="text-right tabular-nums">{money(l.amount, currency)}</Td>
          </Tr>
        ))
      )}
    </>
  );
}

export default function ProjectDetail() {
  const { companyId, company, can } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const { projectId = '' } = useParams();
  const ref = useMemo(
    () => doc(db, `companies/${companyId}/projects/${projectId}`),
    [companyId, projectId],
  );
  const project = useDoc<Omit<ProjectRow, 'id'>>(ref);
  const canSeeLedger = can('ledger.journal.read') || can('reports.financial.read');
  const accounts = useAccounts(companyId);
  const journalsQ = useMemo(
    () =>
      canSeeLedger
        ? query(
            collection(db, `companies/${companyId}/journals`),
            where('projectId', '==', projectId),
            orderBy('postingDate', 'desc'),
            limit(100),
          )
        : null,
    [companyId, projectId, canSeeLedger],
  );
  const journals = useCollection<Omit<JournalRow, 'id'>>(
    journalsQ,
    `project-journals-${companyId}-${projectId}`,
  );
  const [result, setResult] = useState<{ key: string; data: Result | null; error: boolean }>();
  // Recalculated whenever a journal is tagged with the project.
  const key = `${projectId}-${journals.data.length}-${accounts.data.length}`;
  useEffect(() => {
    if (!canSeeLedger || accounts.loading || journals.loading) return;
    let cancelled = false;
    loadProjectResult(companyId, projectId, accounts.data)
      .then((data) => !cancelled && setResult({ key, data, error: false }))
      .catch(() => !cancelled && setResult({ key, data: null, error: true }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, canSeeLedger, accounts.loading, journals.loading]);
  const status = useAction();

  if (project.loading) return <Spinner />;
  const p = project.data;
  if (!p) return <EmptyState title="Project not found" />;
  const current = result?.key === key ? result : undefined;
  const setStatus = (s: ProjectRow['status']) =>
    void status.run('project.update', { companyId, projectId, status: s }).catch(() => undefined);

  return (
    <>
      <PageHeader
        title={`${p.code} · ${p.name}`}
        description={p.customerName ? `For ${p.customerName}.` : 'Internal project.'}
        actions={
          <>
            {can('projects.manage') &&
              (p.status === 'active' ? (
                <>
                  <Button variant="secondary" onClick={() => setStatus('completed')}>
                    Mark completed
                  </Button>
                  <Button variant="secondary" onClick={() => setStatus('cancelled')}>
                    Cancel project
                  </Button>
                </>
              ) : (
                <Button variant="secondary" onClick={() => setStatus('active')}>
                  Reopen
                </Button>
              ))}
            <Button variant="secondary" asChild>
              <Link to={`/c/${companyId}/projects`}>All projects</Link>
            </Button>
          </>
        }
      />
      <p className="mb-4">
        <Badge tone={PROJECT_TONE[p.status]}>{p.status}</Badge>
        {p.description && <span className="ml-2 text-sm text-slate-600">{p.description}</span>}
      </p>
      {status.error && (
        <Alert tone="error" className="mb-4">
          {status.error.message}
        </Alert>
      )}
      {!canSeeLedger ? (
        <EmptyState title="The project's figures need ledger or financial report access" />
      ) : (
        <>
          <h2 className="mb-3 text-base font-semibold">Result</h2>
          <Card className="mb-6">
            {current?.error ? (
              <Alert tone="error">Could not load the figures. Try again.</Alert>
            ) : !current?.data ? (
              <Spinner />
            ) : (
              <Table label="Project result">
                <TBody>
                  <ResultLines title="Revenue" lines={current.data.income} currency={currency} />
                  <ResultLines
                    title="Direct costs"
                    lines={current.data.costs}
                    currency={currency}
                  />
                  <Tr>
                    <Td className="font-semibold">Margin</Td>
                    <Td
                      className="text-right font-semibold tabular-nums"
                      data-testid="project-margin"
                    >
                      {money(current.data.margin, currency)}
                    </Td>
                  </Tr>
                </TBody>
              </Table>
            )}
          </Card>
          <h2 className="mb-3 text-base font-semibold">Postings</h2>
          <Card>
            {journals.loading ? (
              <Spinner />
            ) : journals.data.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">Nothing posted for this project yet.</p>
            ) : (
              <Table label="Project postings">
                <THead>
                  <Tr>
                    <Th>Date</Th>
                    <Th>Journal</Th>
                    <Th>Memo</Th>
                    <Th className="text-right">Amount</Th>
                  </Tr>
                </THead>
                <TBody>
                  {journals.data.map((j) => (
                    <Tr key={j.id}>
                      <Td>{formatDate(j.postingDate)}</Td>
                      <Td className="font-mono">
                        <Link
                          to={`/c/${companyId}/journals/${j.id}`}
                          className="text-brand-700 hover:underline"
                        >
                          {j.number}
                        </Link>
                      </Td>
                      <Td>{j.memo}</Td>
                      <Td className="text-right tabular-nums">{money(j.totalDebit, currency)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </>
      )}
    </>
  );
}
