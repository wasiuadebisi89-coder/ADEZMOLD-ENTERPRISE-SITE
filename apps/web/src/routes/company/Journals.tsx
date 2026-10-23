import { collection, limit, orderBy, query } from 'firebase/firestore';
import { Plus } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/button';
import { Badge, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { db } from '../../lib/firebase';
import { useCollection } from '../../lib/firestore-hooks';
import { ORIGIN_LABEL, money, type JournalRow } from '../../lib/ledger';
import { formatDate } from '../../lib/utils';

const PAGE = 100;

export default function Journals() {
  const { companyId, can } = useCompany();
  const q = useMemo(
    () =>
      query(
        collection(db, `companies/${companyId}/journals`),
        orderBy('postedAt', 'desc'),
        limit(PAGE),
      ),
    [companyId],
  );
  const journals = useCollection<Omit<JournalRow, 'id'>>(q, `journals-${companyId}`);
  const canPost = can('ledger.journal.post');

  return (
    <>
      <PageHeader
        title="Journals"
        description="Every posting in the ledger. Posted journals never change; mistakes are corrected by reversal."
        actions={
          canPost && (
            <>
              <Button variant="secondary" asChild>
                <Link to={`/c/${companyId}/opening-balances`}>Opening balances</Link>
              </Button>
              <Button asChild>
                <Link to={`/c/${companyId}/journals/new`}>
                  <Plus className="size-4" aria-hidden /> New journal
                </Link>
              </Button>
            </>
          )
        }
      />
      {journals.loading ? (
        <Spinner />
      ) : journals.data.length === 0 ? (
        <EmptyState title="No journals yet" />
      ) : (
        <Card>
          <Table label="Journals">
            <THead>
              <Tr>
                <Th>Number</Th>
                <Th>Date</Th>
                <Th>Description</Th>
                <Th>Type</Th>
                <Th className="text-right">Amount</Th>
                <Th>Status</Th>
              </Tr>
            </THead>
            <TBody>
              {journals.data.map((j) => (
                <Tr key={j.id}>
                  <Td className="font-mono">
                    <Link
                      to={`/c/${companyId}/journals/${j.id}`}
                      className="text-brand-700 hover:underline"
                    >
                      {j.number}
                    </Link>
                  </Td>
                  <Td>{formatDate(j.postingDate)}</Td>
                  <Td className="max-w-xs truncate">{j.memo}</Td>
                  <Td>{ORIGIN_LABEL[j.origin]}</Td>
                  <Td className="text-right tabular-nums">{money(j.totalDebit, j.currency)}</Td>
                  <Td>
                    <Badge tone={j.status === 'posted' ? 'green' : 'slate'}>{j.status}</Badge>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          {journals.data.length === PAGE && (
            <p className="px-4 py-3 text-xs text-slate-500">Showing the latest {PAGE} journals.</p>
          )}
        </Card>
      )}
    </>
  );
}
