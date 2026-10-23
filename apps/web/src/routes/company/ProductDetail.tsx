import { collection, doc, limit, orderBy, query, where } from 'firebase/firestore';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../../components/ui/button';
import { Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { db } from '../../lib/firebase';
import { useCollection, useDoc } from '../../lib/firestore-hooks';
import {
  MOVEMENT_LABEL,
  movementSourcePath,
  qty,
  useLocations,
  useStockBalances,
  type MovementRow,
  type ProductRow,
} from '../../lib/inventory';
import { money } from '../../lib/ledger';
import { formatDate } from '../../lib/utils';

/** Stock card: where the product is and every movement, newest first. */
export default function ProductDetail() {
  const { companyId, company, can } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const { productId = '' } = useParams();
  const ref = useMemo(
    () => doc(db, `companies/${companyId}/products/${productId}`),
    [companyId, productId],
  );
  const product = useDoc<Omit<ProductRow, 'id'>>(ref);
  const canSeeStock = can('reports.stock.read');
  const balances = useStockBalances(companyId, productId, canSeeStock);
  const locations = useLocations(companyId);
  const movementsQ = useMemo(
    () =>
      canSeeStock
        ? query(
            collection(db, `companies/${companyId}/stockMovements`),
            where('productId', '==', productId),
            orderBy('postedAt', 'desc'),
            limit(100),
          )
        : null,
    [companyId, productId, canSeeStock],
  );
  const movements = useCollection<Omit<MovementRow, 'id'>>(
    movementsQ,
    `movements-${companyId}-${productId}`,
  );
  const locationName = new Map(locations.data.map((l) => [l.id, `${l.branchId} · ${l.name}`]));

  if (product.loading) return <Spinner />;
  const p = product.data;
  if (!p) return <EmptyState title="Product not found" />;

  return (
    <>
      <PageHeader
        title={`${p.sku} · ${p.name}`}
        description={`Counted in ${p.unit}.`}
        actions={
          <Button variant="secondary" asChild>
            <Link to={`/c/${companyId}/products`}>All products</Link>
          </Button>
        }
      />
      {!canSeeStock ? (
        <EmptyState title="Stock levels need stock report access" />
      ) : (
        <>
          <h2 className="mb-3 text-base font-semibold">Stock by location</h2>
          <Card className="mb-6">
            {balances.loading ? (
              <Spinner />
            ) : balances.data.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No stock recorded yet.</p>
            ) : (
              <Table label="Stock by location">
                <THead>
                  <Tr>
                    <Th>Location</Th>
                    <Th className="text-right">On hand</Th>
                    <Th className="text-right">Value</Th>
                  </Tr>
                </THead>
                <TBody>
                  {balances.data.map((b) => (
                    <Tr key={b.id}>
                      <Td>{locationName.get(b.locationId) ?? b.locationId}</Td>
                      <Td className="text-right tabular-nums">{qty(b.qtyMilli, p.unit)}</Td>
                      <Td className="text-right tabular-nums">{money(b.valueMinor, currency)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
          <h2 className="mb-3 text-base font-semibold">Movements</h2>
          <Card>
            {movements.loading ? (
              <Spinner />
            ) : movements.data.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No movements yet.</p>
            ) : (
              <Table label="Stock movements">
                <THead>
                  <Tr>
                    <Th>Date</Th>
                    <Th>Document</Th>
                    <Th>Location</Th>
                    <Th className="text-right">Quantity</Th>
                    <Th className="text-right">Value</Th>
                    <Th className="text-right">Balance after</Th>
                  </Tr>
                </THead>
                <TBody>
                  {movements.data.map((m) => (
                    <Tr key={m.id}>
                      <Td>{formatDate(m.postingDate)}</Td>
                      <Td>
                        <Link
                          className="font-mono text-brand-700 hover:underline"
                          to={movementSourcePath(companyId, m)}
                        >
                          {m.sourceNumber}
                        </Link>{' '}
                        <span className="text-slate-500">{MOVEMENT_LABEL[m.movementType]}</span>
                      </Td>
                      <Td>{locationName.get(m.locationId) ?? m.locationId}</Td>
                      <Td className="text-right tabular-nums">
                        {m.qtyMilli > 0 ? '+' : ''}
                        {qty(m.qtyMilli, p.unit)}
                      </Td>
                      <Td className="text-right tabular-nums">{money(m.valueMinor, currency)}</Td>
                      <Td className="text-right tabular-nums">{qty(m.balanceQtyMilli, p.unit)}</Td>
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
