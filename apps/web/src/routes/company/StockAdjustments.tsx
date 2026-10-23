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
import { KIND_LABEL, STATUS_TONE, useLocations, type AdjustmentRow } from '../../lib/inventory';
import { money } from '../../lib/ledger';
import { formatDateTime } from '../../lib/utils';

export default function StockAdjustments() {
  const { companyId, company, can } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const q = useMemo(
    () =>
      query(
        collection(db, `companies/${companyId}/stockAdjustments`),
        orderBy('createdAt', 'desc'),
        limit(100),
      ),
    [companyId],
  );
  const adjustments = useCollection<Omit<AdjustmentRow, 'id'>>(q, `adjustments-${companyId}`);
  const locations = useLocations(companyId);
  const locationName = new Map(locations.data.map((l) => [l.id, `${l.branchId} · ${l.name}`]));
  const canCreate = can('inventory.adjustment.create') || can('inventory.count.create');

  return (
    <>
      <PageHeader
        title="Stock adjustments"
        description="Opening stock, counts and corrections. Each one needs approval by a second person before stock and the ledger change."
        actions={
          canCreate && (
            <Button asChild>
              <Link to={`/c/${companyId}/stock-adjustments/new`}>
                <Plus className="size-4" aria-hidden /> New adjustment
              </Link>
            </Button>
          )
        }
      />
      {adjustments.loading ? (
        <Spinner />
      ) : adjustments.data.length === 0 ? (
        <EmptyState title="No stock adjustments yet" />
      ) : (
        <Card>
          <Table label="Stock adjustments">
            <THead>
              <Tr>
                <Th>Number</Th>
                <Th>Type</Th>
                <Th>Location</Th>
                <Th>Reason</Th>
                <Th>Raised</Th>
                <Th className="text-right">Value change</Th>
                <Th>Status</Th>
              </Tr>
            </THead>
            <TBody>
              {adjustments.data.map((a) => (
                <Tr key={a.id}>
                  <Td className="font-mono">
                    <Link
                      to={`/c/${companyId}/stock-adjustments/${a.id}`}
                      className="text-brand-700 hover:underline"
                    >
                      {a.number}
                    </Link>
                  </Td>
                  <Td>{KIND_LABEL[a.kind]}</Td>
                  <Td>{locationName.get(a.locationId) ?? a.locationId}</Td>
                  <Td className="max-w-xs truncate">{a.reason}</Td>
                  <Td>{formatDateTime(a.createdAt)}</Td>
                  <Td className="text-right tabular-nums">
                    {a.valueMinor != null ? money(a.valueMinor, currency) : '—'}
                  </Td>
                  <Td>
                    <Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
