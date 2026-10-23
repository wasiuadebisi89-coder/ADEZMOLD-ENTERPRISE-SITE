import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { UNITS, UNIT_CODES, formatQuantity, toDecimalString, type UnitCode } from '@bms/domain';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input, Select } from '../../components/ui/form';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import {
  qty,
  useCategories,
  useProducts,
  useStockBalances,
  type CategoryRow,
  type ProductRow,
} from '../../lib/inventory';
import { money } from '../../lib/ledger';
import { useAction } from '../../lib/useAction';

function ProductDialog({
  product,
  categories,
  onClose,
}: {
  product: ProductRow | null;
  categories: CategoryRow[];
  onClose: () => void;
}) {
  const { companyId, company } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const action = useAction();
  const [sku, setSku] = useState(product?.sku ?? '');
  const [name, setName] = useState(product?.name ?? '');
  const [unit, setUnit] = useState<UnitCode>(product?.unit ?? 'pcs');
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? '');
  const [salePrice, setSalePrice] = useState(
    product?.salePrice != null ? toDecimalString(BigInt(product.salePrice), currency) : '',
  );
  const [reorderLevel, setReorderLevel] = useState(
    product?.reorderLevelMilli != null
      ? formatQuantity(product.reorderLevelMilli, product.unit)
      : '',
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (product) {
        await action.run('product.update', {
          companyId,
          productId: product.id,
          name,
          categoryId: categoryId || null,
          salePrice: salePrice.trim() ? salePrice : null,
          reorderLevel: reorderLevel.trim() ? reorderLevel : null,
        });
      } else {
        await action.run('product.create', {
          companyId,
          sku,
          name,
          unit,
          categoryId: categoryId || null,
          description: '',
          ...(salePrice.trim() ? { salePrice } : {}),
          ...(reorderLevel.trim() ? { reorderLevel } : {}),
        });
      }
      onClose();
    } catch {
      /* shown below */
    }
  };
  const f = action.error?.fields ?? {};
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={product ? `Edit ${product.sku}` : 'New product'}
      description={product ? 'The SKU and unit are fixed once a product exists.' : undefined}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="SKU" error={f.sku}>
            <Input
              value={sku}
              onChange={(e) => setSku(e.target.value.toUpperCase())}
              disabled={!!product}
              maxLength={40}
            />
          </Field>
          <Field label="Name" error={f.name} className="sm:col-span-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={160} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Unit" error={f.unit}>
            <Select
              value={unit}
              onChange={(e) => setUnit(e.target.value as UnitCode)}
              disabled={!!product}
            >
              {UNIT_CODES.map((u) => (
                <option key={u} value={u}>
                  {UNITS[u].name} ({u})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Category (optional)" error={f.categoryId}>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">None</option>
              {categories
                .filter((c) => c.status === 'active' || c.id === categoryId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label={`Selling price, ${currency} (optional)`} error={f.salePrice}>
            <Input
              inputMode="decimal"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
            />
          </Field>
          <Field label="Reorder level (optional)" error={f.reorderLevel}>
            <Input
              inputMode="decimal"
              value={reorderLevel}
              onChange={(e) => setReorderLevel(e.target.value)}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={action.pending} disabled={!sku || name.trim().length < 2}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function CategoryDialog({ onClose }: { onClose: () => void }) {
  const { companyId } = useCompany();
  const action = useAction();
  const [name, setName] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await action.run('category.create', { companyId, name });
      onClose();
    } catch {
      /* shown below */
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="New category">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        <Field label="Name" error={action.error?.fields.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={action.pending} disabled={name.trim().length < 2}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function Products() {
  const { companyId, company, can } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const products = useProducts(companyId);
  const categories = useCategories(companyId);
  const canSeeStock = can('reports.stock.read');
  const balances = useStockBalances(companyId, undefined, canSeeStock);
  const toggle = useAction();
  const [editing, setEditing] = useState<ProductRow | 'new' | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [search, setSearch] = useState('');
  const canManage = can('inventory.products.manage');

  const onHand = useMemo(() => {
    const m = new Map<string, { qty: number; value: number }>();
    for (const b of balances.data) {
      const cur = m.get(b.productId) ?? { qty: 0, value: 0 };
      m.set(b.productId, { qty: cur.qty + b.qtyMilli, value: cur.value + b.valueMinor });
    }
    return m;
  }, [balances.data]);
  const categoryName = new Map(categories.data.map((c) => [c.id, c.name]));
  const term = search.trim().toLowerCase();
  const rows = products.data.filter(
    (p) => !term || p.sku.toLowerCase().includes(term) || p.name.toLowerCase().includes(term),
  );

  return (
    <>
      <PageHeader
        title="Products"
        description="Items you buy, hold and sell. Stock changes go through adjustments, purchases and sales."
        actions={
          canManage && (
            <>
              <Button variant="secondary" onClick={() => setAddingCategory(true)}>
                New category
              </Button>
              <Button onClick={() => setEditing('new')}>
                <Plus className="size-4" aria-hidden /> New product
              </Button>
            </>
          )
        }
      />
      {toggle.error && (
        <Alert tone="error" className="mb-4">
          {toggle.error.message}
        </Alert>
      )}
      <div className="mb-4 max-w-sm">
        <Input
          aria-label="Search products"
          placeholder="Search by SKU or name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {products.loading ? (
        <Spinner />
      ) : products.data.length === 0 ? (
        <EmptyState title="No products yet" />
      ) : (
        <Card>
          <Table label="Products">
            <THead>
              <Tr>
                <Th>SKU</Th>
                <Th>Name</Th>
                <Th>Category</Th>
                <Th className="text-right">Selling price</Th>
                {canSeeStock && <Th className="text-right">On hand</Th>}
                {canSeeStock && <Th className="text-right">Stock value</Th>}
                <Th>Status</Th>
                {canManage && <Th className="text-right">Actions</Th>}
              </Tr>
            </THead>
            <TBody>
              {rows.map((p) => {
                const stock = onHand.get(p.id);
                const low = p.reorderLevelMilli != null && (stock?.qty ?? 0) <= p.reorderLevelMilli;
                return (
                  <Tr key={p.id}>
                    <Td className="font-mono">
                      <Link
                        to={`/c/${companyId}/products/${p.id}`}
                        className="text-brand-700 hover:underline"
                      >
                        {p.sku}
                      </Link>
                    </Td>
                    <Td>{p.name}</Td>
                    <Td>{p.categoryId ? (categoryName.get(p.categoryId) ?? '—') : '—'}</Td>
                    <Td className="text-right tabular-nums">
                      {p.salePrice != null ? money(p.salePrice, currency) : '—'}
                    </Td>
                    {canSeeStock && (
                      <Td className="text-right tabular-nums">
                        {qty(stock?.qty ?? 0, p.unit)} {low && <Badge tone="amber">Reorder</Badge>}
                      </Td>
                    )}
                    {canSeeStock && (
                      <Td className="text-right tabular-nums">
                        {money(stock?.value ?? 0, currency)}
                      </Td>
                    )}
                    <Td>
                      <Badge tone={p.status === 'active' ? 'green' : 'slate'}>{p.status}</Badge>
                    </Td>
                    {canManage && (
                      <Td className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            void toggle
                              .run('product.update', {
                                companyId,
                                productId: p.id,
                                status: p.status === 'active' ? 'inactive' : 'active',
                              })
                              .catch(() => undefined)
                          }
                        >
                          {p.status === 'active' ? 'Deactivate' : 'Activate'}
                        </Button>
                      </Td>
                    )}
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}
      {editing && (
        <ProductDialog
          product={editing === 'new' ? null : editing}
          categories={categories.data}
          onClose={() => setEditing(null)}
        />
      )}
      {addingCategory && <CategoryDialog onClose={() => setAddingCategory(false)} />}
    </>
  );
}
