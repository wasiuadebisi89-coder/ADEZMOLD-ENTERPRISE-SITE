import { Plus, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input, Select } from './ui/form';
import { cn } from '../lib/utils';
import { money, tryParseMoney, type AccountRow } from '../lib/ledger';

export interface LineDraft {
  key: string;
  accountId: string;
  debit: string;
  credit: string;
  memo: string;
}

export const emptyLine = (): LineDraft => ({
  key: crypto.randomUUID(),
  accountId: '',
  debit: '',
  credit: '',
  memo: '',
});

export interface LineTotals {
  debit: bigint;
  credit: bigint;
  /** Lines with an amount that cannot be read, by index. */
  invalid: Set<number>;
}

export function lineTotals(lines: readonly LineDraft[], currency: string): LineTotals {
  let debit = 0n;
  let credit = 0n;
  const invalid = new Set<number>();
  lines.forEach((l, i) => {
    const d = tryParseMoney(l.debit, currency);
    const c = tryParseMoney(l.credit, currency);
    if (d === null || c === null || (d > 0n && c > 0n)) {
      invalid.add(i);
      return;
    }
    debit += d;
    credit += c;
  });
  return { debit, credit, invalid };
}

interface Props {
  lines: LineDraft[];
  onChange: (lines: LineDraft[]) => void;
  accounts: AccountRow[];
  currency: string;
  /** Server-reported failing line, 1-based. */
  errorLine?: number | undefined;
  minLines?: number;
}

/** Editable debit/credit lines, used by manual journals and opening balances. */
export function JournalLines({
  lines,
  onChange,
  accounts,
  currency,
  errorLine,
  minLines = 2,
}: Props) {
  const totals = lineTotals(lines, currency);
  const update = (i: number, patch: Partial<LineDraft>) =>
    onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-3">
      {/* `relative` keeps the absolutely positioned screen-reader labels inside the scroll area. */}
      <div className="relative overflow-x-auto">
        <table className="min-w-full text-sm" aria-label="Journal lines">
          <thead className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-8 px-2 py-2">#</th>
              <th className="min-w-56 px-2 py-2">Account</th>
              <th className="w-36 px-2 py-2 text-right">Debit</th>
              <th className="w-36 px-2 py-2 text-right">Credit</th>
              <th className="min-w-40 px-2 py-2">Line note</th>
              <th className="w-10 px-2 py-2">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const bad = totals.invalid.has(i) || errorLine === i + 1;
              return (
                <tr key={l.key} className={cn(bad && 'bg-red-50')}>
                  <td className="px-2 py-1.5 text-slate-500">{i + 1}</td>
                  <td className="px-2 py-1.5">
                    <Select
                      aria-label={`Line ${i + 1} account`}
                      value={l.accountId}
                      onChange={(e) => update(i, { accountId: e.target.value })}
                      aria-invalid={errorLine === i + 1 || undefined}
                    >
                      <option value="">Choose an account…</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} · {a.name}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      aria-label={`Line ${i + 1} debit`}
                      inputMode="decimal"
                      className="text-right"
                      value={l.debit}
                      onChange={(e) =>
                        update(i, {
                          debit: e.target.value,
                          ...(e.target.value ? { credit: '' } : {}),
                        })
                      }
                      aria-invalid={bad || undefined}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      aria-label={`Line ${i + 1} credit`}
                      inputMode="decimal"
                      className="text-right"
                      value={l.credit}
                      onChange={(e) =>
                        update(i, {
                          credit: e.target.value,
                          ...(e.target.value ? { debit: '' } : {}),
                        })
                      }
                      aria-invalid={bad || undefined}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      aria-label={`Line ${i + 1} note`}
                      value={l.memo}
                      maxLength={200}
                      onChange={(e) => update(i, { memo: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove line ${i + 1}`}
                      disabled={lines.length <= minLines}
                      onClick={() => onChange(lines.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t border-slate-200 font-medium">
            <tr>
              <td />
              <td className="px-2 py-2 text-right text-slate-500">Totals</td>
              <td className="px-2 py-2 text-right tabular-nums" data-testid="total-debit">
                {money(totals.debit, currency)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums" data-testid="total-credit">
                {money(totals.credit, currency)}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => onChange([...lines, emptyLine()])}
      >
        <Plus className="size-4" aria-hidden /> Add line
      </Button>
    </div>
  );
}
