import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { branchAllowed } from '@bms/domain';
import { BackdateNotice, useBackdate, useToday } from '../../components/BackdateNotice';
import { Button } from '../../components/ui/button';
import { Alert, Card, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input, Select, Textarea } from '../../components/ui/form';
import { useCompany } from '../../lib/company';
import { qty, useLocations } from '../../lib/inventory';
import {
  useSupplierDocs,
  useSuppliers,
  type InvoiceRow,
  type ReceiptRow,
} from '../../lib/purchasing';
import { useAction } from '../../lib/useAction';
import { cn } from '../../lib/utils';

interface LineDraft {
  key: string;
  /** `${receiptId}:${lineNo}` */
  source: string;
  /** '' = not yet invoiced */
  invoiceId: string;
  quantity: string;
}

const newLine = (): LineDraft => ({
  key: crypto.randomUUID(),
  source: '',
  invoiceId: '',
  quantity: '',
});

export default function NewSupplierReturn() {
  const { companyId, member } = useCompany();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const today = useToday();
  const suppliers = useSuppliers(companyId);
  const locations = useLocations(companyId);
  const action = useAction();
  const [supplierId, setSupplierId] = useState(params.get('supplier') ?? '');
  const [locationId, setLocationId] = useState('');
  const [postingDate, setPostingDate] = useState(today);
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<LineDraft[]>(() => [newLine()]);
  const backdate = useBackdate(postingDate);
  const receipts = useSupplierDocs<ReceiptRow>(companyId, 'goodsReceipts', supplierId || '-');
  const invoices = useSupplierDocs<InvoiceRow>(companyId, 'purchaseInvoices', supplierId || '-');

  const usable = locations.data.filter(
    (l) => l.status === 'active' && member && branchAllowed(member.branchScope, l.branchId),
  );
  const sources = receipts.data.flatMap((r) =>
    r.lines.map((l) => ({ id: `${r.id}:${l.lineNo}`, r, l })),
  );
  const firstSource = sources.find((s) => s.id === lines[0]?.source);
  const location = locationId || firstSource?.r.locationId || usable[0]?.id || '';
  const update = (i: number, patch: Partial<LineDraft>) =>
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const complete =
    !!supplierId &&
    !!location &&
    reason.trim().length >= 3 &&
    lines.every((l) => l.source && l.quantity.trim()) &&
    (!backdate.needsApproval || !!backdate.approvalId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await action.run<{ returnId: string }>('supplierReturn.post', {
        companyId,
        supplierId,
        locationId: location,
        postingDate,
        reason: reason.trim(),
        lines: lines.map((l) => {
          const [goodsReceiptId, lineNo] = l.source.split(':');
          return {
            goodsReceiptId: goodsReceiptId!,
            lineNo: Number(lineNo),
            quantity: l.quantity,
            ...(l.invoiceId ? { invoiceId: l.invoiceId } : {}),
          };
        }),
        ...(backdate.approvalId ? { backdateApprovalId: backdate.approvalId } : {}),
      });
      void navigate(`/c/${companyId}/purchases/returns/${res.returnId}`);
    } catch {
      /* shown below */
    }
  };

  if (suppliers.loading || locations.loading) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Return goods to supplier"
        description="Goods not yet invoiced come off what you will be invoiced for. Invoiced goods are credited against their invoice."
        actions={
          <Button variant="secondary" asChild>
            <Link to={`/c/${companyId}/purchases?tab=returns`}>Cancel</Link>
          </Button>
        }
      />
      <form onSubmit={submit} className="space-y-4" noValidate>
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        <Card className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Supplier">
              <Select
                value={supplierId}
                onChange={(e) => {
                  setSupplierId(e.target.value);
                  setLines([newLine()]);
                }}
              >
                <option value="">Choose a supplier…</option>
                {suppliers.data.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Taken from">
              <Select value={location} onChange={(e) => setLocationId(e.target.value)}>
                {usable.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.branchId} · {l.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date returned" error={action.error?.fields.postingDate}>
              <Input
                type="date"
                value={postingDate}
                max={today}
                onChange={(e) => setPostingDate(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Reason" error={action.error?.fields.reason}>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <BackdateNotice date={postingDate} state={backdate} />
        </Card>
        <Card className="p-4">
          <div className="relative overflow-x-auto">
            <table className="min-w-full text-sm" aria-label="Return lines">
              <thead className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="min-w-64 px-2 py-2">Received on</th>
                  <th className="min-w-56 px-2 py-2">Invoice</th>
                  <th className="w-32 px-2 py-2">Quantity</th>
                  <th className="w-10 px-2 py-2">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => {
                  const src = sources.find((s) => s.id === line.source);
                  const waiting = src ? src.l.qtyMilli - src.l.clearedQtyMilli : 0;
                  const invoiced = src
                    ? invoices.data.flatMap((inv) =>
                        inv.lines
                          .filter(
                            (il) =>
                              il.kind === 'receipt' &&
                              il.goodsReceiptId === src.r.id &&
                              il.receiptLineNo === src.l.lineNo &&
                              (il.qtyMilli ?? 0) - (il.returnedQtyMilli ?? 0) > 0,
                          )
                          .map((il) => ({
                            inv,
                            left: (il.qtyMilli ?? 0) - (il.returnedQtyMilli ?? 0),
                          })),
                      )
                    : [];
                  return (
                    <tr
                      key={line.key}
                      className={cn(action.error?.lineNo === i + 1 && 'bg-red-50')}
                    >
                      <td className="px-2 py-1.5">
                        <Select
                          aria-label={`Line ${i + 1} received goods`}
                          value={line.source}
                          onChange={(e) => update(i, { source: e.target.value, invoiceId: '' })}
                        >
                          <option value="">Choose what was received…</option>
                          {sources.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.r.number} · {s.l.sku} {s.l.productName} (
                              {qty(s.l.qtyMilli, s.l.unit)})
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-2 py-1.5">
                        <Select
                          aria-label={`Line ${i + 1} invoice`}
                          value={line.invoiceId}
                          onChange={(e) => update(i, { invoiceId: e.target.value })}
                          disabled={!src}
                        >
                          <option value="">
                            Not invoiced{src ? ` (${qty(waiting, src.l.unit)} waiting)` : ''}
                          </option>
                          {invoiced.map(({ inv, left }) => (
                            <option key={inv.id} value={inv.id}>
                              {inv.number} ({qty(left, src!.l.unit)} returnable)
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          aria-label={`Line ${i + 1} quantity`}
                          inputMode="decimal"
                          value={line.quantity}
                          onChange={(e) => update(i, { quantity: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={`Remove line ${i + 1}`}
                          disabled={lines.length <= 1}
                          onClick={() => setLines(lines.filter((_, j) => j !== i))}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => setLines([...lines, newLine()])}
          >
            <Plus className="size-4" aria-hidden /> Add line
          </Button>
        </Card>
        <div className="flex justify-end">
          <Button type="submit" loading={action.pending} disabled={!complete}>
            Post return
          </Button>
        </div>
      </form>
    </>
  );
}
