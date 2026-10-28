import { collection, getAggregateFromServer, getDocs, query, sum, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  AGEING_BUCKETS,
  AGEING_LABEL,
  ageing,
  balanceSheet,
  fiscalYearStart,
  isIsoDate,
  openItemsAsAt,
  profitAndLoss,
  type InvoiceForAgeing,
  type AccountMovement,
  type AccountSubtype,
  type OpenItem,
  type Permission,
  type StatementSection,
} from '@bms/domain';
import { useToday } from '../../components/BackdateNotice';
import { Button } from '../../components/ui/button';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input, Select } from '../../components/ui/form';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { loadMovements, withoutClosing } from '../../lib/assets';
import { useCompany } from '../../lib/company';
import { db } from '../../lib/firebase';
import { useCollection } from '../../lib/firestore-hooks';
import {
  locationLabel,
  qty,
  useLocations,
  useProducts,
  useStockBalances,
} from '../../lib/inventory';
import { money, useAccounts, type AccountRow } from '../../lib/ledger';
import { outstanding, type InvoiceRow } from '../../lib/purchasing';
import { salesOutstanding, type SalesInvoiceRow } from '../../lib/sales';
import { cn, formatDate } from '../../lib/utils';

const TABS = [
  { id: 'profit-and-loss', label: 'Profit and loss', permission: 'reports.financial.read' },
  { id: 'balance-sheet', label: 'Balance sheet', permission: 'reports.financial.read' },
  { id: 'receivables', label: 'Receivables ageing', permission: 'sales.read' },
  { id: 'payables', label: 'Payables ageing', permission: 'purchasing.read' },
  { id: 'stock', label: 'Stock valuation', permission: 'reports.stock.read' },
] as const satisfies readonly { id: string; label: string; permission: Permission }[];
type Tab = (typeof TABS)[number]['id'];

/** Loads movements for a date range when asked; the first load runs on its own. */
function useMovements(range: { from?: string; to: string } | null, excludeClosing = false) {
  const { companyId } = useCompany();
  const accounts = useAccounts(companyId);
  const [state, setState] = useState<{
    key: string;
    rows: AccountMovement[] | null;
    error: boolean;
  } | null>(null);
  const key = range ? `${range.from ?? ''}..${range.to}` : '';
  useEffect(() => {
    if (!range || accounts.loading) return;
    let cancelled = false;
    loadMovements(companyId, accounts.data, range)
      .then((rows) => (excludeClosing ? withoutClosing(companyId, rows, range) : rows))
      .then((rows) => !cancelled && setState({ key, rows, error: false }))
      .catch(() => !cancelled && setState({ key, rows: null, error: true }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, accounts.loading, companyId]);
  const current = state?.key === key ? state : null;
  return { rows: current?.rows ?? null, error: current?.error ?? false, loading: !current };
}

function Section({
  section,
  currency,
  negate = false,
}: {
  section: StatementSection;
  currency: string;
  negate?: boolean;
}) {
  const sign = negate ? -1n : 1n;
  return (
    <>
      <Tr>
        <Td colSpan={2} className="pt-4 font-semibold">
          {section.title}
        </Td>
      </Tr>
      {section.lines.length === 0 ? (
        <Tr>
          <Td className="pl-6 text-slate-500">None</Td>
          <Td />
        </Tr>
      ) : (
        section.lines.map((l) => (
          <Tr key={l.accountId}>
            <Td className="pl-6">
              <span className="font-mono">{l.code}</span> {l.name}
            </Td>
            <Td className="text-right tabular-nums">{money(sign * l.amount, currency)}</Td>
          </Tr>
        ))
      )}
      <TotalRow
        label={`Total ${section.title.toLowerCase()}`}
        amount={sign * section.total}
        currency={currency}
      />
    </>
  );
}

function TotalRow({
  label,
  amount,
  currency,
  strong = false,
  testId,
}: {
  label: string;
  amount: bigint;
  currency: string;
  strong?: boolean;
  testId?: string;
}) {
  return (
    <Tr>
      <Td className={cn('font-medium', strong && 'font-semibold')}>{label}</Td>
      <Td
        className={cn('text-right font-medium tabular-nums', strong && 'font-semibold')}
        data-testid={testId}
      >
        {money(amount, currency)}
      </Td>
    </Tr>
  );
}

function ProfitAndLoss() {
  const { company } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const today = useToday();
  const [from, setFrom] = useState(fiscalYearStart(today, company?.fiscalYearStartMonth ?? 1));
  const [to, setTo] = useState(today);
  const [range, setRange] = useState({ from, to });
  const result = useMovements(range, true);
  const valid = isIsoDate(from) && isIsoDate(to) && from <= to;
  const pl = result.rows ? profitAndLoss(result.rows) : null;
  return (
    <>
      <Card className="mb-4 p-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) setRange({ from, to });
          }}
        >
          <Field label="From">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Button type="submit" disabled={!valid}>
            Show report
          </Button>
        </form>
      </Card>
      {result.error && <Alert tone="error">Could not load the figures. Try again.</Alert>}
      {result.loading || !pl ? (
        !result.error && <Spinner />
      ) : (
        <Card>
          <p className="px-4 py-3 text-sm">
            {formatDate(range.from)} to {formatDate(range.to)}
          </p>
          <Table label="Profit and loss">
            <THead>
              <Tr>
                <Th>Account</Th>
                <Th className="text-right">Amount</Th>
              </Tr>
            </THead>
            <TBody>
              <Section section={pl.revenue} currency={currency} />
              <Section section={pl.costOfSales} currency={currency} />
              <TotalRow label="Gross profit" amount={pl.grossProfit} currency={currency} strong />
              <Section section={pl.otherIncome} currency={currency} />
              <Section section={pl.expenses} currency={currency} />
              <TotalRow
                label={pl.netProfit >= 0n ? 'Net profit' : 'Net loss'}
                amount={pl.netProfit}
                currency={currency}
                strong
                testId="pl-net"
              />
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}

function BalanceSheetReport() {
  const { company } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const today = useToday();
  const [asAt, setAsAt] = useState(today);
  const [range, setRange] = useState({ to: today });
  const result = useMovements(range);
  const bs = result.rows ? balanceSheet(result.rows) : null;
  return (
    <>
      <Card className="mb-4 p-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (isIsoDate(asAt)) setRange({ to: asAt });
          }}
        >
          <Field label="As at">
            <Input type="date" value={asAt} onChange={(e) => setAsAt(e.target.value)} />
          </Field>
          <Button type="submit" disabled={!isIsoDate(asAt)}>
            Show report
          </Button>
        </form>
      </Card>
      {result.error && <Alert tone="error">Could not load the figures. Try again.</Alert>}
      {result.loading || !bs ? (
        !result.error && <Spinner />
      ) : (
        <Card>
          <div className="flex items-center justify-between px-4 py-3 text-sm">
            <span>As at {formatDate(range.to)}</span>
            {bs.difference === 0n ? (
              <Badge tone="green">Balanced</Badge>
            ) : (
              <Badge tone="red">Out by {money(bs.difference, currency)}</Badge>
            )}
          </div>
          <Table label="Balance sheet">
            <THead>
              <Tr>
                <Th>Account</Th>
                <Th className="text-right">Amount</Th>
              </Tr>
            </THead>
            <TBody>
              <Section section={bs.nonCurrentAssets} currency={currency} />
              <Section section={bs.currentAssets} currency={currency} />
              <TotalRow
                label="Total assets"
                amount={bs.totalAssets}
                currency={currency}
                strong
                testId="bs-assets"
              />
              <Section section={bs.liabilities} currency={currency} />
              <Section section={bs.equity} currency={currency} />
              <TotalRow
                label="Profit to date not yet closed to retained earnings"
                amount={bs.unclosedProfit}
                currency={currency}
              />
              <TotalRow label="Total equity" amount={bs.totalEquity} currency={currency} />
              <TotalRow
                label="Total liabilities and equity"
                amount={bs.totalLiabilitiesAndEquity}
                currency={currency}
                strong
                testId="bs-liabilities-equity"
              />
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}

/** The ledger balance of the one control account with this role, for a cross-check. */
function useControlBalance(subtype: AccountSubtype, enabled: boolean, asAt: string) {
  const { companyId } = useCompany();
  const accounts = useAccounts(companyId);
  const [state, setState] = useState<{ key: string; balance: bigint } | null>(null);
  const account = accounts.data.find((a) => a.subtype === subtype && a.status === 'active');
  useEffect(() => {
    if (!enabled || !account) return;
    let cancelled = false;
    loadMovements(companyId, [account], { to: asAt })
      .then((rows) => {
        if (!cancelled) {
          setState({ key: asAt, balance: rows[0] ? rows[0].debit - rows[0].credit : 0n });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [companyId, account, asAt, enabled]);
  return {
    account: account as AccountRow | undefined,
    balance: state?.key === asAt ? state.balance : null,
  };
}

/** A date to report at, applied when the button is pressed. Today by default. */
function AsAtPicker({ value, onChange }: { value: string; onChange: (date: string) => void }) {
  const today = useToday();
  const [draft, setDraft] = useState(value);
  const valid = isIsoDate(draft) && draft <= today;
  return (
    <Card className="mb-4 p-4">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onChange(draft);
        }}
      >
        <Field label="As at">
          <Input type="date" value={draft} max={today} onChange={(e) => setDraft(e.target.value)} />
        </Field>
        <Button type="submit" disabled={!valid}>
          Show report
        </Button>
      </form>
    </Card>
  );
}

/** Runs a one-off load for a past date; null while loading or when not needed. */
function useLoad<T>(key: string | null, load: () => Promise<T>) {
  const [state, setState] = useState<{ key: string; data: T | null; error: boolean } | null>(null);
  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    load()
      .then((data) => !cancelled && setState({ key, data, error: false }))
      .catch(() => !cancelled && setState({ key, data: null, error: true }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const current = key !== null && state?.key === key ? state : null;
  return { data: current?.data ?? null, error: current?.error ?? false };
}

function AgeingTable({
  items,
  asAt,
  party,
  control,
  sign,
}: {
  items: OpenItem[];
  asAt: string;
  party: 'Customer' | 'Supplier';
  control: ReturnType<typeof useControlBalance>;
  /** +1 for receivables (debit balance), −1 for payables. */
  sign: 1n | -1n;
}) {
  const { company } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const report = ageing(items, asAt);
  const ledger = control.balance === null ? null : sign * control.balance;
  return (
    <>
      <p className="mb-3 text-sm text-slate-600">
        Unpaid invoices as at {formatDate(asAt)}, by days past their due date. Money held on account
        (advances and unused credits) is not included.
      </p>
      {control.account && ledger !== null && (
        <Alert tone={ledger === report.total ? 'success' : 'info'} className="mb-3">
          {control.account.code} {control.account.name} in the ledger: {money(ledger, currency)}.{' '}
          {ledger === report.total
            ? 'It agrees with the open invoices.'
            : `It differs from the open invoices by ${money(ledger - report.total, currency)}.`}
        </Alert>
      )}
      {report.rows.length === 0 ? (
        <EmptyState title="Nothing outstanding" />
      ) : (
        <Card>
          <Table label={`${party} ageing`}>
            <THead>
              <Tr>
                <Th>{party}</Th>
                {AGEING_BUCKETS.map((b) => (
                  <Th key={b} className="text-right">
                    {AGEING_LABEL[b]}
                  </Th>
                ))}
                <Th className="text-right">Total</Th>
              </Tr>
            </THead>
            <TBody>
              {report.rows.map((r) => (
                <Tr key={r.partyId}>
                  <Td>{r.partyName}</Td>
                  {AGEING_BUCKETS.map((b) => (
                    <Td key={b} className="text-right tabular-nums">
                      {r.buckets[b] ? money(r.buckets[b], currency) : ''}
                    </Td>
                  ))}
                  <Td className="text-right font-medium tabular-nums">
                    {money(r.total, currency)}
                  </Td>
                </Tr>
              ))}
              <Tr>
                <Td className="font-semibold">Total</Td>
                {AGEING_BUCKETS.map((b) => (
                  <Td
                    key={b}
                    className="text-right font-semibold tabular-nums"
                    data-testid={`ageing-${b}`}
                  >
                    {money(report.totals[b], currency)}
                  </Td>
                ))}
                <Td className="text-right font-semibold tabular-nums" data-testid="ageing-total">
                  {money(report.total, currency)}
                </Td>
              </Tr>
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}

function useOpenDocs<T>(coll: 'salesInvoices' | 'purchaseInvoices', enabled: boolean) {
  const { companyId } = useCompany();
  const q = useMemo(
    () =>
      enabled
        ? query(collection(db, `companies/${companyId}/${coll}`), where('status', '==', 'open'))
        : null,
    [companyId, coll, enabled],
  );
  return useCollection<Omit<T, 'id'>>(q, `open-${coll}-${companyId}`);
}

/**
 * Open items at a past date: invoices dated by then, less what was paid with them and every
 * settlement dated by then (DATA_MODEL.md §11).
 */
async function loadOpenItemsAsAt(
  companyId: string,
  side: 'receivable' | 'payable',
  asAt: string,
): Promise<OpenItem[]> {
  const coll = side === 'receivable' ? 'salesInvoices' : 'purchaseInvoices';
  const [invoices, settlements] = await Promise.all([
    getDocs(
      query(collection(db, `companies/${companyId}/${coll}`), where('invoiceDate', '<=', asAt)),
    ),
    getDocs(
      query(
        collection(db, `companies/${companyId}/settlements`),
        where('ledger', '==', side),
        where('date', '<=', asAt),
      ),
    ),
  ]);
  const rows: InvoiceForAgeing[] = [];
  for (const d of invoices.docs) {
    if (side === 'receivable') {
      const i = d.data() as SalesInvoiceRow;
      if (i.customerId === null) continue;
      rows.push({
        id: d.id,
        partyId: i.customerId,
        partyName: i.customerName,
        invoiceDate: i.invoiceDate,
        dueDate: i.dueDate,
        totalMinor: BigInt(i.totalMinor),
        paidAtInvoiceMinor: i.payments.reduce((s, p) => s + BigInt(p.amountMinor), 0n),
      });
    } else {
      const i = d.data() as InvoiceRow;
      rows.push({
        id: d.id,
        partyId: i.supplierId,
        partyName: i.supplierName,
        invoiceDate: i.invoiceDate,
        dueDate: i.dueDate,
        totalMinor: BigInt(i.totalMinor),
        paidAtInvoiceMinor: 0n,
      });
    }
  }
  return openItemsAsAt(
    rows,
    settlements.docs.map((d) => {
      const s = d.data() as { invoiceId: string; date: string; amountMinor: number };
      return { invoiceId: s.invoiceId, date: s.date, amountMinor: BigInt(s.amountMinor) };
    }),
    asAt,
  );
}

function Ageing({ side }: { side: 'receivable' | 'payable' }) {
  const { companyId, can } = useCompany();
  const today = useToday();
  const [asAt, setAsAt] = useState(today);
  const now = asAt === today;
  const sales = useOpenDocs<SalesInvoiceRow>('salesInvoices', now && side === 'receivable');
  const purchases = useOpenDocs<InvoiceRow>('purchaseInvoices', now && side === 'payable');
  const past = useLoad(now ? null : `${side}-${asAt}`, () =>
    loadOpenItemsAsAt(companyId, side, asAt),
  );
  const control = useControlBalance(side, can('reports.financial.read'), asAt);
  let items: OpenItem[] | null;
  if (!now) items = past.data;
  else if (side === 'receivable') {
    items = sales.loading
      ? null
      : (sales.data as SalesInvoiceRow[])
          .filter((i) => i.customerId !== null)
          .map((i) => ({
            partyId: i.customerId!,
            partyName: i.customerName,
            dueDate: i.dueDate,
            outstanding: BigInt(salesOutstanding(i)),
          }));
  } else {
    items = purchases.loading
      ? null
      : (purchases.data as InvoiceRow[]).map((i) => ({
          partyId: i.supplierId,
          partyName: i.supplierName,
          dueDate: i.dueDate,
          outstanding: BigInt(outstanding(i)),
        }));
  }
  return (
    <>
      <AsAtPicker value={asAt} onChange={setAsAt} />
      {past.error && <Alert tone="error">Could not load the figures. Try again.</Alert>}
      {items === null ? (
        !past.error && <Spinner />
      ) : (
        <AgeingTable
          items={items}
          asAt={asAt}
          party={side === 'receivable' ? 'Customer' : 'Supplier'}
          control={control}
          sign={side === 'receivable' ? 1n : -1n}
        />
      )}
    </>
  );
}

const Receivables = () => <Ageing side="receivable" />;
const Payables = () => <Ageing side="payable" />;

/**
 * Stock at a past date: every product's movements dated by then, summed on the server, at one
 * location or all of them.
 */
async function loadStockAsAt(
  companyId: string,
  productIds: readonly string[],
  asAt: string,
  locationId: string | null,
) {
  const movements = collection(db, `companies/${companyId}/stockMovements`);
  const rows = await Promise.all(
    productIds.map(async (productId) => {
      const snap = await getAggregateFromServer(
        query(
          movements,
          where('productId', '==', productId),
          ...(locationId ? [where('locationId', '==', locationId)] : []),
          where('postingDate', '<=', asAt),
        ),
        { qty: sum('qtyMilli'), value: sum('valueMinor') },
      );
      return [
        productId,
        { qty: BigInt(snap.data().qty ?? 0), value: BigInt(snap.data().value ?? 0) },
      ] as const;
    }),
  );
  return new Map(rows);
}

function StockValuation() {
  const { companyId, company, can } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const today = useToday();
  const [asAt, setAsAt] = useState(today);
  const [locationId, setLocationId] = useState('');
  const now = asAt === today;
  const products = useProducts(companyId);
  const locations = useLocations(companyId);
  const balances = useStockBalances(companyId, undefined, now);
  const past = useLoad(
    now || products.loading ? null : `stock-${asAt}-${locationId || 'all'}`,
    () =>
      loadStockAsAt(
        companyId,
        products.data.map((p) => p.id),
        asAt,
        locationId || null,
      ),
  );
  const control = useControlBalance('inventory', can('reports.financial.read'), asAt);
  let byProduct: Map<string, { qty: bigint; value: bigint }> | null = null;
  if (!now) byProduct = past.data;
  else if (!balances.loading) {
    byProduct = new Map();
    for (const b of balances.data) {
      if (locationId && b.locationId !== locationId) continue;
      const row = byProduct.get(b.productId) ?? { qty: 0n, value: 0n };
      row.qty += BigInt(b.qtyMilli);
      row.value += BigInt(b.valueMinor);
      byProduct.set(b.productId, row);
    }
  }
  const picker = (
    <>
      <AsAtPicker value={asAt} onChange={setAsAt} />
      <div className="mb-4 max-w-xs">
        <Field label="Location">
          <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">All locations</option>
            {locations.data.map((l) => (
              <option key={l.id} value={l.id}>
                {locationLabel(l)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </>
  );
  const location = locations.data.find((l) => l.id === locationId);
  if (products.loading || locations.loading || byProduct === null) {
    return (
      <>
        {picker}
        {past.error ? (
          <Alert tone="error">Could not load the figures. Try again.</Alert>
        ) : (
          <Spinner />
        )}
      </>
    );
  }
  const found = byProduct;
  const rows = products.data
    .map((p) => ({ product: p, ...(found.get(p.id) ?? { qty: 0n, value: 0n }) }))
    .filter((r) => r.qty !== 0n || r.value !== 0n);
  const total = rows.reduce((s, r) => s + r.value, 0n);
  return (
    <>
      {picker}
      <p className="mb-3 text-sm text-slate-600">
        Quantity and cost of stock on hand at the end of {formatDate(asAt)},{' '}
        {location ? (
          <>at {locationLabel(location)}.</>
        ) : (
          <>
            across {locations.data.length} location{locations.data.length === 1 ? '' : 's'}.
          </>
        )}
      </p>
      {location && (
        <p className="mb-3 text-sm text-slate-600">
          The ledger holds one Inventory account for every location, so it is compared with the
          total for all locations only.
        </p>
      )}
      {!location && control.account && control.balance !== null && (
        <Alert tone={control.balance === total ? 'success' : 'info'} className="mb-3">
          {control.account.code} {control.account.name} in the ledger:{' '}
          {money(control.balance, currency)}.{' '}
          {control.balance === total
            ? 'It agrees with the stock records.'
            : `It differs from the stock records by ${money(control.balance - total, currency)}.`}
        </Alert>
      )}
      {rows.length === 0 ? (
        <EmptyState title="No stock on hand" />
      ) : (
        <Card>
          <Table label="Stock valuation">
            <THead>
              <Tr>
                <Th>Product</Th>
                <Th className="text-right">On hand</Th>
                <Th className="text-right">Average cost</Th>
                <Th className="text-right">Value</Th>
              </Tr>
            </THead>
            <TBody>
              {rows.map((r) => (
                <Tr key={r.product.id}>
                  <Td>
                    <Link
                      to={`/c/${companyId}/products/${r.product.id}`}
                      className="font-mono text-brand-700 hover:underline"
                    >
                      {r.product.sku}
                    </Link>{' '}
                    {r.product.name}
                  </Td>
                  <Td className="text-right tabular-nums">{qty(r.qty, r.product.unit)}</Td>
                  <Td className="text-right tabular-nums">
                    {r.qty > 0n ? money((r.value * 1000n) / r.qty, currency) : '—'}
                  </Td>
                  <Td className="text-right tabular-nums">{money(r.value, currency)}</Td>
                </Tr>
              ))}
              <Tr>
                <Td className="font-semibold">Total</Td>
                <Td />
                <Td />
                <Td className="text-right font-semibold tabular-nums" data-testid="stock-total">
                  {money(total, currency)}
                </Td>
              </Tr>
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}

const PANELS: Record<Tab, () => React.ReactNode> = {
  'profit-and-loss': ProfitAndLoss,
  'balance-sheet': BalanceSheetReport,
  receivables: Receivables,
  payables: Payables,
  stock: StockValuation,
};

export default function Reports() {
  const { can } = useCompany();
  const [params, setParams] = useSearchParams();
  const tabs = TABS.filter((t) => can(t.permission));
  const tab = tabs.find((t) => t.id === params.get('tab')) ?? tabs[0];
  if (!tab) return <EmptyState title="You have no reports to view" />;
  const Panel = PANELS[tab.id];
  return (
    <>
      <PageHeader
        title="Reports"
        description="Financial statements from the ledger, and ageing and stock reports from the records behind it. Each checks itself against its ledger account."
      />
      <div role="tablist" aria-label="Reports" className="mb-4 flex gap-1 overflow-x-auto border-b">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={t.id === tab.id}
            onClick={() => setParams({ tab: t.id })}
            className={cn(
              '-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium',
              t.id === tab.id
                ? 'border-brand-600 text-brand-800'
                : 'border-transparent text-slate-600 hover:text-slate-900',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <Panel key={tab.id} />
    </>
  );
}
