import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/ui/button';
import { Alert, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { Select } from '../../components/ui/form';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { db } from '../../lib/firebase';
import { formatDateTime } from '../../lib/utils';

interface AuditRow {
  id: string;
  action: string;
  actorEmail: string | null;
  actorUid: string;
  entityType: string;
  entityId: string;
  reason: string | null;
  before: unknown;
  after: unknown;
  at: { toDate(): Date } | null;
}

const PAGE = 25;
const ENTITY_TYPES = [
  'company',
  'companySettings',
  'branch',
  'member',
  'invitation',
  'role',
  'period',
  'fiscalYear',
  'approvalRequest',
];

export default function AuditLog() {
  const { companyId } = useCompany();
  const [entityType, setEntityType] = useState('');
  const [result, setResult] = useState<{
    key: string;
    rows: AuditRow[];
    cursor: QueryDocumentSnapshot | null;
    hasMore: boolean;
  } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const filterKey = `${companyId}:${entityType}`;

  const fetchPage = useCallback(
    async (after: QueryDocumentSnapshot | null) => {
      const constraints = [
        ...(entityType ? [where('entityType', '==', entityType)] : []),
        orderBy('at', 'desc'),
        ...(after ? [startAfter(after)] : []),
        limit(PAGE),
      ];
      const snap = await getDocs(
        query(collection(db, `companies/${companyId}/auditLogs`), ...constraints),
      );
      return {
        rows: snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AuditRow, 'id'>) })),
        cursor: snap.docs.at(-1) ?? null,
        hasMore: snap.size === PAGE,
      };
    },
    [companyId, entityType],
  );

  useEffect(() => {
    let cancelled = false;
    fetchPage(null).then(
      (page) => !cancelled && setResult({ key: filterKey, ...page }),
      () => !cancelled && setError(true),
    );
    return () => {
      cancelled = true;
    };
  }, [fetchPage, filterKey]);

  const current = result?.key === filterKey ? result : null;
  const rows = current?.rows ?? [];
  const loading = !current && !error;

  const loadMore = async () => {
    if (!current) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage(current.cursor);
      setResult({
        key: filterKey,
        rows: [...current.rows, ...page.rows],
        cursor: page.cursor,
        hasMore: page.hasMore,
      });
    } catch {
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every change made in this company, newest first. Entries cannot be edited or deleted."
        actions={
          <Select
            aria-label="Filter by record type"
            value={entityType}
            onChange={(e) => {
              setError(false);
              setEntityType(e.target.value);
            }}
            className="w-52"
          >
            <option value="">All record types</option>
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        }
      />
      {error && (
        <Alert tone="error" className="mb-4">
          Could not load the audit log.
        </Alert>
      )}
      <Card>
        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No entries" />
          </div>
        ) : (
          <Table label="Audit log">
            <THead>
              <Tr>
                <Th>When</Th>
                <Th>Who</Th>
                <Th>Action</Th>
                <Th>Record</Th>
                <Th>Reason</Th>
                <Th />
              </Tr>
            </THead>
            <TBody>
              {rows.map((r) => (
                <Fragment key={r.id}>
                  <Tr>
                    <Td>{formatDateTime(r.at)}</Td>
                    <Td>{r.actorEmail ?? r.actorUid}</Td>
                    <Td className="font-mono text-xs">{r.action}</Td>
                    <Td>
                      {r.entityType}{' '}
                      <span className="font-mono text-xs text-slate-500">{r.entityId}</span>
                    </Td>
                    <Td className="max-w-xs truncate">{r.reason ?? '—'}</Td>
                    <Td className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-expanded={expanded === r.id}
                        onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                      >
                        {expanded === r.id ? 'Hide' : 'Details'}
                      </Button>
                    </Td>
                  </Tr>
                  {expanded === r.id && (
                    <Tr>
                      <Td colSpan={6} className="bg-slate-50">
                        <div className="grid gap-4 whitespace-normal sm:grid-cols-2">
                          <div>
                            <p className="text-xs font-semibold uppercase text-slate-500">Before</p>
                            <pre className="mt-1 overflow-x-auto text-xs">
                              {JSON.stringify(r.before, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase text-slate-500">After</p>
                            <pre className="mt-1 overflow-x-auto text-xs">
                              {JSON.stringify(r.after, null, 2)}
                            </pre>
                          </div>
                        </div>
                      </Td>
                    </Tr>
                  )}
                </Fragment>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      {current?.hasMore && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" loading={loadingMore} onClick={() => void loadMore()}>
            Load more
          </Button>
        </div>
      )}
    </>
  );
}
