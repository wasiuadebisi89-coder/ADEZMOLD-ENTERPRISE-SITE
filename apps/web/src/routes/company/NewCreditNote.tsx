import { doc } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { parseQuantity } from '@bms/domain';
import { Button } from '../../components/ui/button';
import { Alert, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input, Select, Textarea } from '../../components/ui/form';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { db } from '../../lib/firebase';
import { useDoc } from '../../lib/firestore-hooks';
import { qty, useLocations } from '../../lib/inventory';
import { useAccounts } from '../../lib/ledger';
import { type SalesInvoiceRow } from '../../lib/sales';
import { useAction } from '../../lib/useAction';

type Condition = 'resalable' | 'damaged';

function parsed(input: string, unit: SalesInvoiceRow['lines'][number]['unit']): bigint | null {
  if (!input.trim()) return 0n;
  try {
    return parseQuantity(input, unit);
  } catch {
    return null;
  }
}

export default function NewCreditNote() {
  const { companyId, can } = useCompany();
  const navigate = useNavigate();
  const { invoiceId = '' } = useParams();
  const ref = useMemo(
    () => doc(db, `companies/${companyId}/salesInvoices/${invoiceId}`),
    [companyId, invoiceId],
  );
  const invoice = useDoc<Omit<SalesInvoiceRow, 'id'>>(ref);
  const locations = useLocations(companyId);
  const accounts = useAccounts(companyId);
  const action = useAction();
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [conditions, setConditions] = useState<Record<number, Condition>>({});
  const [quarantineId, setQuarantineId] = useState('');
  const [refundAccountId, setRefundAccountId] = useState('');
  const [reason, setReason] = useState('');

  if (invoice.loading || locations.loading || accounts.loading) return <Spinner />;
  const i = invoice.data;
  if (!i || i.kind !== 'invoice') return <EmptyState title="Sale not found" />;
  const walkIn = i.customerId === null;
  const quarantines = locations.data.filter(
    (l) => l.type === 'quarantine' && l.status === 'active' && l.branchId === i.branchId,
  );
  const refundFrom = accounts.data.filter(
    (a) => a.status === 'active' && a.isPostable && (a.subtype === 'cash' || a.subtype === 'bank'),
  );
  const quarantine = quarantineId || quarantines[0]?.id || '';
  const refundAccount = refundAccountId || refundFrom[0]?.id || '';
  const rows = i.lines.map((l) => {
    const left = BigInt(l.qtyMilli - l.returnedQtyMilli);
    const q = parsed(quantities[l.lineNo] ?? '', l.unit);
    return { line: l, left, q, condition: conditions[l.lineNo] ?? 'resalable' };
  });
  const chosen = rows.filter((r) => r.q !== null && r.q > 0n);
  const invalid = rows.some((r) => r.q === null || (r.q !== null && r.q > r.left));
  const damaged = chosen.some((r) => r.condition === 'damaged');
  const postsNow = can('sales.return.post') && (!walkIn || can('sales.refund.post'));
  const complete =
    chosen.length > 0 &&
    !invalid &&
    reason.trim().length >= 3 &&
    (!damaged || !!quarantine) &&
    (!walkIn || !!refundAccount);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await action.run<{ creditNoteId: string }>('creditNote.create', {
        companyId,
        invoiceId,
        reason,
        lines: chosen.map((r) => ({
          lineNo: r.line.lineNo,
          quantity: quantities[r.line.lineNo]!,
          condition: r.condition,
        })),
        ...(damaged ? { quarantineLocationId: quarantine } : {}),
        ...(walkIn ? { refundAccountId: refundAccount } : {}),
      });
      void navigate(`/c/${companyId}/sales/returns/${res.creditNoteId}`);
    } catch {
      /* shown below */
    }
  };

  return (
    <>
      <PageHeader
        title={`Return goods from ${i.number}`}
        description={
          walkIn
            ? 'The goods come back into stock and the customer is paid back for them.'
            : `The goods come back into stock. The credit reduces what ${i.customerName} owes on this sale; anything more is kept for them to use or be paid back.`
        }
        actions={
          <Button variant="secondary" asChild>
            <Link to={`/c/${companyId}/sales/invoices/${invoiceId}`}>Cancel</Link>
          </Button>
        }
      />
      <form onSubmit={submit} className="space-y-4" noValidate>
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        {!postsNow && (
          <Alert tone="info">A manager approves the return before stock or money moves.</Alert>
        )}
        <Card>
          <Table label="Lines to return">
            <THead>
              <Tr>
                <Th>Product</Th>
                <Th className="text-right">Sold</Th>
                <Th className="text-right">Can return</Th>
                <Th>Returning</Th>
                <Th>Condition</Th>
              </Tr>
            </THead>
            <TBody>
              {rows.map(({ line: l, left, q, condition }) => (
                <Tr key={l.lineNo}>
                  <Td>
                    <span className="font-mono">{l.sku}</span> {l.productName}
                  </Td>
                  <Td className="text-right tabular-nums">{qty(l.qtyMilli, l.unit)}</Td>
                  <Td className="text-right tabular-nums">{qty(left, l.unit)}</Td>
                  <Td>
                    <Input
                      aria-label={`Return quantity line ${l.lineNo}`}
                      inputMode="decimal"
                      className="w-28"
                      value={quantities[l.lineNo] ?? ''}
                      disabled={left === 0n}
                      aria-invalid={q === null || (q !== null && q > left) || undefined}
                      onChange={(e) => setQuantities({ ...quantities, [l.lineNo]: e.target.value })}
                    />
                  </Td>
                  <Td>
                    <Select
                      aria-label={`Condition line ${l.lineNo}`}
                      value={condition}
                      disabled={left === 0n}
                      onChange={(e) =>
                        setConditions({ ...conditions, [l.lineNo]: e.target.value as Condition })
                      }
                    >
                      <option value="resalable">Can be sold again</option>
                      <option value="damaged">Damaged</option>
                    </Select>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
        <Card className="grid gap-4 p-4 sm:grid-cols-2">
          {damaged && (
            <Field
              label="Damaged goods go to"
              hint={
                quarantines.length === 0 ? 'This branch has no quarantine location.' : undefined
              }
            >
              <Select value={quarantine} onChange={(e) => setQuarantineId(e.target.value)}>
                {quarantines.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {walkIn && (
            <Field label="Pay back from">
              <Select value={refundAccount} onChange={(e) => setRefundAccountId(e.target.value)}>
                {refundFrom.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Reason" className="sm:col-span-2" error={action.error?.fields.reason}>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </Card>
        <div className="flex justify-end">
          <Button type="submit" loading={action.pending} disabled={!complete}>
            {postsNow ? 'Post return' : 'Ask for approval'}
          </Button>
        </div>
      </form>
    </>
  );
}
