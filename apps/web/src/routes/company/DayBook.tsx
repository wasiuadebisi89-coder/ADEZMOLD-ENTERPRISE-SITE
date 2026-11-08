import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  VOUCHER_LABEL,
  VOUCHER_TYPES,
  addDays,
  dayBook,
  isIsoDate,
  type VoucherType,
} from '@bms/domain';
import { useToday } from '../../components/BackdateNotice';
import { PrintButton, ReportPrintHeader, useReportPrint } from '../../components/ReportPrint';
import { Button } from '../../components/ui/button';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input, Select } from '../../components/ui/form';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { db } from '../../lib/firebase';
import { useCollection } from '../../lib/firestore-hooks';
import { journalSourcePath, money, type JournalRow } from '../../lib/ledger';
import { cn, formatDate, loadErrorMessage } from '../../lib/utils';

/** The most journals one view loads; a wider range asks the user to narrow it. */
export const DAY_BOOK_LIMIT = 1000;

const isVoucherType = (v: string | null): v is VoucherType =>
  v !== null && (VOUCHER_TYPES as readonly string[]).includes(v);

function rangeLabel(from: string, to: string) {
  return from === to ? formatDate(from) : `${formatDate(from)} to ${formatDate(to)}`;
}

export default function DayBook() {
  const { companyId, company } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const today = useToday();
  const [params, setParams] = useSearchParams();

  // The applied filters live in the address, so coming back from a document keeps them.
  const pFrom = params.get('from');
  const pTo = params.get('to');
  const from = isIsoDate(pFrom ?? '') ? pFrom! : today;
  const to = isIsoDate(pTo ?? '') && pTo! >= from ? pTo! : from;
  const pType = params.get('type');
  const type = isVoucherType(pType) ? pType : null;
  const detailed = params.get('view') !== 'condensed';

  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const valid = isIsoDate(draftFrom) && isIsoDate(draftTo) && draftFrom <= draftTo;

  const apply = (next: { from?: string; to?: string; type?: string | null; view?: string }) => {
    const merged = {
      from: next.from ?? from,
      to: next.to ?? to,
      type: next.type === undefined ? type : next.type,
      view: next.view ?? (detailed ? 'detailed' : 'condensed'),
    };
    const out: Record<string, string> = { from: merged.from, to: merged.to };
    if (merged.type) out.type = merged.type;
    if (merged.view === 'condensed') out.view = 'condensed';
    setParams(out, { replace: true });
    setDraftFrom(merged.from);
    setDraftTo(merged.to);
  };

  const shiftDay = (days: number) => {
    const d = addDays(from, days);
    apply({ from: d, to: d });
  };

  const q = useMemo(
    () =>
      query(
        collection(db, `companies/${companyId}/journals`),
        where('postingDate', '>=', from),
        where('postingDate', '<=', to),
        orderBy('postingDate', 'asc'),
        limit(DAY_BOOK_LIMIT),
      ),
    [companyId, from, to],
  );
  const journals = useCollection<Omit<JournalRow, 'id'>>(q, `daybook-${companyId}-${from}-${to}`);

  const book = useMemo(
    () =>
      dayBook(
        journals.data.map((j) => ({
          ...j,
          postedAtMs: j.postedAt?.toDate?.().getTime() ?? 0,
        })),
        { from, to, types: type ? [type] : [] },
      ),
    [journals.data, from, to, type],
  );
  const truncated = journals.data.length >= DAY_BOOK_LIMIT;

  const report = useReportPrint(
    journals.loading || journals.error
      ? null
      : {
          title: type ? `Day book · ${VOUCHER_LABEL[type]}` : 'Day book',
          subtitle: rangeLabel(from, to),
        },
  );

  return (
    <>
      <PageHeader
        title="Day book"
        description="Every voucher posted to the ledger on the chosen days, in the order it was posted."
      />
      <Card className="mb-4 p-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) apply({ from: draftFrom, to: draftTo });
          }}
        >
          <Field label="From">
            <Input type="date" value={draftFrom} onChange={(e) => setDraftFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <Input
              type="date"
              value={draftTo}
              min={draftFrom}
              onChange={(e) => setDraftTo(e.target.value)}
            />
          </Field>
          <Button type="submit" disabled={!valid}>
            Show day book
          </Button>
          <Field label="Voucher type">
            <Select value={type ?? ''} onChange={(e) => apply({ type: e.target.value || null })}>
              <option value="">All vouchers</option>
              {VOUCHER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {VOUCHER_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="View">
            <Select
              value={detailed ? 'detailed' : 'condensed'}
              onChange={(e) => apply({ view: e.target.value })}
            >
              <option value="detailed">With accounts</option>
              <option value="condensed">Vouchers only</option>
            </Select>
          </Field>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-2" data-print-hide>
          <Button
            type="button"
            variant="secondary"
            onClick={() => shiftDay(-1)}
            aria-label="Previous day"
          >
            <ChevronLeft className="size-4" aria-hidden /> Previous day
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => apply({ from: today, to: today })}
            disabled={from === today && to === today}
          >
            Today
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => shiftDay(1)}
            disabled={from >= today}
            aria-label="Next day"
          >
            Next day <ChevronRight className="size-4" aria-hidden />
          </Button>
          <PrintButton report={report} />
        </div>
      </Card>
      <ReportPrintHeader report={report} />
      {journals.error ? (
        <Alert tone="error">
          {loadErrorMessage(journals.error, 'Could not load the day book. Try again.')}
        </Alert>
      ) : journals.loading ? (
        <Spinner />
      ) : book.rows.length === 0 ? (
        <EmptyState
          title="Nothing posted"
          description={`No ${type ? VOUCHER_LABEL[type].toLowerCase() + ' ' : ''}vouchers were posted ${from === to ? 'on' : 'from'} ${rangeLabel(from, to)}.`}
        />
      ) : (
        <>
          {truncated && (
            <Alert tone="info" className="mb-4">
              Showing the first {DAY_BOOK_LIMIT} journals in this range. Choose fewer days to see
              the rest.
            </Alert>
          )}
          <Card className="mb-4">
            <div
              className="flex flex-wrap gap-x-6 gap-y-2 px-4 py-3 text-sm"
              data-testid="daybook-summary"
            >
              <span className="font-medium">
                {rangeLabel(from, to)} · <span data-testid="daybook-count">{book.rows.length}</span>{' '}
                {book.rows.length === 1 ? 'voucher' : 'vouchers'}
              </span>
              {book.byType.map((t) => (
                <span key={t.type} className="text-slate-600">
                  {VOUCHER_LABEL[t.type]}: {t.count} · {money(t.amount, currency)}
                </span>
              ))}
            </div>
          </Card>
          <Card>
            <Table label="Day book">
              <THead>
                <Tr>
                  <Th>Date</Th>
                  <Th>Voucher type</Th>
                  <Th>Voucher no.</Th>
                  <Th>Particulars</Th>
                  <Th className="text-right">Debit</Th>
                  <Th className="text-right">Credit</Th>
                </Tr>
              </THead>
              <TBody>
                {book.rows.map((r) => (
                  <Fragment key={r.id}>
                    <Tr data-testid="daybook-row" className={cn(detailed && 'bg-slate-50/60')}>
                      <Td>{formatDate(r.postingDate)}</Td>
                      <Td>{VOUCHER_LABEL[r.voucherType]}</Td>
                      <Td className="font-mono">
                        <Link
                          to={journalSourcePath(companyId, r)}
                          className="text-brand-700 hover:underline"
                        >
                          {r.voucherNumber}
                        </Link>
                        {r.voucherNumber !== r.number && (
                          <Link
                            to={`/c/${companyId}/journals/${r.id}`}
                            className="ml-2 text-xs text-slate-500 hover:underline"
                            title="Open the journal"
                          >
                            {r.number}
                          </Link>
                        )}
                      </Td>
                      <Td className="max-w-md whitespace-normal">
                        {r.memo}
                        {r.status === 'reversed' && (
                          <span className="ml-2">
                            <Badge tone="slate">reversed</Badge>
                          </span>
                        )}
                      </Td>
                      <Td className="text-right font-medium tabular-nums">
                        {detailed ? '' : money(r.totalDebit, currency)}
                      </Td>
                      <Td className="text-right font-medium tabular-nums">
                        {detailed ? '' : money(r.totalCredit, currency)}
                      </Td>
                    </Tr>
                    {detailed &&
                      r.lines.map((l) => (
                        <Tr key={`${r.id}-${l.lineNo}`} className="text-xs">
                          <Td className="py-1.5" />
                          <Td className="py-1.5" />
                          <Td className="py-1.5" />
                          <Td className="whitespace-normal py-1.5 pl-8 text-slate-600">
                            <span className="font-mono">{l.accountCode}</span> {l.accountName}
                            {l.memo ? <span className="text-slate-400"> · {l.memo}</span> : null}
                          </Td>
                          <Td className="py-1.5 text-right tabular-nums text-slate-600">
                            {l.debit ? money(l.debit, currency) : ''}
                          </Td>
                          <Td className="py-1.5 text-right tabular-nums text-slate-600">
                            {l.credit ? money(l.credit, currency) : ''}
                          </Td>
                        </Tr>
                      ))}
                  </Fragment>
                ))}
                <Tr>
                  <Td />
                  <Td />
                  <Td />
                  <Td className="font-semibold">Totals</Td>
                  <Td className="text-right font-semibold tabular-nums" data-testid="daybook-debit">
                    {money(book.totalDebit, currency)}
                  </Td>
                  <Td
                    className="text-right font-semibold tabular-nums"
                    data-testid="daybook-credit"
                  >
                    {money(book.totalCredit, currency)}
                  </Td>
                </Tr>
              </TBody>
            </Table>
          </Card>
        </>
      )}
    </>
  );
}
