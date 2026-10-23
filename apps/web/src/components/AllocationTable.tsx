import { toDecimalString } from '@bms/domain';
import { Button } from './ui/button';
import { Input } from './ui/form';
import { useCompany } from '../lib/company';
import { money, tryParseMoney } from '../lib/ledger';
import { formatDate } from '../lib/utils';

export interface OpenInvoice {
  id: string;
  number: string;
  reference: string | null;
  dueDate: string;
  outstandingMinor: number;
}

/** Amount typed against each open invoice, with "oldest first" filling. */
export function AllocationTable({
  invoices,
  values,
  onChange,
  available,
  referenceLabel,
  emptyText,
  actionLabel = 'Pay',
}: {
  invoices: readonly OpenInvoice[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  available: bigint;
  referenceLabel: string;
  emptyText: string;
  /** Prefix for each amount field's label, e.g. "Pay PI-000001". */
  actionLabel?: string;
}) {
  const { company } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const fillOldest = () => {
    let left = available;
    const next: Record<string, string> = {};
    for (const inv of invoices) {
      const due = BigInt(inv.outstandingMinor);
      const take = left < due ? left : due;
      if (take <= 0n) break;
      next[inv.id] = toDecimalString(take, currency);
      left -= take;
    }
    onChange(next);
  };
  if (invoices.length === 0) {
    return <p className="text-sm text-slate-500">{emptyText}</p>;
  }
  return (
    <>
      <div className="relative overflow-x-auto">
        <table className="min-w-full text-sm" aria-label="Allocate to invoices">
          <thead className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2">Invoice</th>
              <th className="px-2 py-2">{referenceLabel}</th>
              <th className="px-2 py-2">Due</th>
              <th className="px-2 py-2 text-right">Outstanding</th>
              <th className="w-40 px-2 py-2">{actionLabel} now</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td className="px-2 py-1.5 font-mono">{inv.number}</td>
                <td className="px-2 py-1.5">{inv.reference ?? '—'}</td>
                <td className="px-2 py-1.5">{formatDate(inv.dueDate)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {money(inv.outstandingMinor, currency)}
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    aria-label={`${actionLabel} ${inv.number}`}
                    inputMode="decimal"
                    value={values[inv.id] ?? ''}
                    onChange={(e) => onChange({ ...values, [inv.id]: e.target.value })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={fillOldest}>
        Allocate oldest first
      </Button>
    </>
  );
}

export function allocationInput(values: Record<string, string>) {
  return Object.entries(values)
    .filter(([, v]) => v.trim() !== '' && Number(v.replace(/,/g, '')) !== 0)
    .map(([invoiceId, amount]) => ({ invoiceId, amount }));
}

export function allocationTotal(values: Record<string, string>, currency: string) {
  let total = 0n;
  for (const v of Object.values(values)) {
    const parsed = tryParseMoney(v, currency);
    if (parsed === null) return null;
    total += parsed;
  }
  return total;
}
