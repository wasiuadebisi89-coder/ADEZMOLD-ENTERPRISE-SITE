import { doc } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApplyCreditDialog } from '../../components/ApplyCreditDialog';
import { DecideDialog } from '../../components/DecideDialog';
import { RefundDialog } from '../../components/RefundDialog';
import { Button } from '../../components/ui/button';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { db } from '../../lib/firebase';
import { useDoc } from '../../lib/firestore-hooks';
import { STATUS_TONE, qty, useLocations } from '../../lib/inventory';
import { money } from '../../lib/ledger';
import { unusedCredit, type CreditNoteRow } from '../../lib/sales';
import { formatDate, formatDateTime } from '../../lib/utils';
import { RefundList } from './CustomerRefundDetail';

export function CreditNoteTable({ rows }: { rows: readonly CreditNoteRow[] }) {
  const { companyId, company } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  return (
    <Table label="Returns">
      <THead>
        <Tr>
          <Th>Number</Th>
          <Th>Raised</Th>
          <Th>Sale</Th>
          <Th>Customer</Th>
          <Th className="text-right">Credit</Th>
          <Th>Status</Th>
        </Tr>
      </THead>
      <TBody>
        {rows.map((n) => (
          <Tr key={n.id}>
            <Td className="font-mono">
              <Link
                to={`/c/${companyId}/sales/returns/${n.id}`}
                className="text-brand-700 hover:underline"
              >
                {n.number}
              </Link>
            </Td>
            <Td>{formatDateTime(n.createdAt)}</Td>
            <Td className="font-mono">{n.invoiceNumber}</Td>
            <Td>{n.customerName}</Td>
            <Td className="text-right tabular-nums">
              {n.status === 'posted' ? money(n.totalMinor, currency) : '—'}
            </Td>
            <Td>
              <Badge tone={STATUS_TONE[n.status]}>{n.status}</Badge>
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}

export default function CreditNoteDetail() {
  const { companyId, company, member, can } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const { creditNoteId = '' } = useParams();
  const ref = useMemo(
    () => doc(db, `companies/${companyId}/creditNotes/${creditNoteId}`),
    [companyId, creditNoteId],
  );
  const note = useDoc<Omit<CreditNoteRow, 'id'>>(ref);
  const locations = useLocations(companyId);
  const [open, setOpen] = useState<'approved' | 'rejected' | 'apply' | 'refund' | null>(null);
  if (note.loading) return <Spinner />;
  const n = note.data;
  if (!n) return <EmptyState title="Return not found" />;
  const walkIn = n.customerId === null;
  const posted = n.status === 'posted';
  const unused = posted ? unusedCredit(n.totalMinor, n) : 0;
  const canDecide =
    n.status === 'pending' &&
    n.createdBy !== member?.uid &&
    can('sales.return.post') &&
    (!walkIn || can('sales.refund.approve') || can('sales.refund.post'));
  const locationName = (id: string) => locations.data.find((l) => l.id === id)?.name ?? id;

  return (
    <>
      <PageHeader
        title={`Return ${n.number}`}
        description={`${n.customerName} · ${n.reason}`}
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link to={`/c/${companyId}/sales?tab=returns`}>All returns</Link>
            </Button>
            {canDecide && (
              <>
                <Button variant="secondary" onClick={() => setOpen('rejected')}>
                  Reject
                </Button>
                <Button onClick={() => setOpen('approved')}>Approve and post</Button>
              </>
            )}
            {unused > 0 && (can('sales.refund.post') || can('sales.refund.request')) && (
              <Button variant="secondary" onClick={() => setOpen('refund')}>
                Refund
              </Button>
            )}
            {unused > 0 && (can('sales.receipt.post') || can('sales.return.post')) && (
              <Button onClick={() => setOpen('apply')}>Apply to invoices</Button>
            )}
          </>
        }
      />
      {n.status === 'pending' && (
        <Alert tone="info" className="mb-4">
          {n.createdBy === member?.uid
            ? 'Waiting for a manager to approve. Stock and money move once it is approved.'
            : 'Waiting for approval. Stock and money move once it is approved.'}
        </Alert>
      )}
      <Card className="mb-4 p-4">
        <dl className="grid gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-slate-500">Status</dt>
            <dd>
              <Badge tone={STATUS_TONE[n.status]}>{n.status}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Sale</dt>
            <dd>
              <Link
                className="font-mono font-medium text-brand-700 underline"
                to={`/c/${companyId}/sales/invoices/${n.invoiceId}`}
              >
                {n.invoiceNumber}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Credit</dt>
            <dd className="font-medium tabular-nums" data-testid="credit-total">
              {posted ? money(n.totalMinor, currency) : 'Worked out when posted'}
            </dd>
          </div>
          {posted && (
            <>
              <div>
                <dt className="text-slate-500">Set against sales</dt>
                <dd className="font-medium tabular-nums">{money(n.allocatedMinor, currency)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Paid back</dt>
                <dd className="font-medium tabular-nums" data-testid="credit-refunded">
                  {money(n.refundedMinor, currency)}
                </dd>
              </div>
              {!walkIn && (
                <div>
                  <dt className="text-slate-500">Not yet used</dt>
                  <dd className="font-medium tabular-nums" data-testid="credit-unused">
                    {money(unused, currency)}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-slate-500">Posted on</dt>
                <dd className="font-medium">{n.postingDate ? formatDate(n.postingDate) : '—'}</dd>
              </div>
            </>
          )}
          <div>
            <dt className="text-slate-500">Raised</dt>
            <dd className="font-medium">{formatDateTime(n.createdAt)}</dd>
          </div>
          {n.decisionReason && (
            <div>
              <dt className="text-slate-500">Decision</dt>
              <dd className="font-medium">{n.decisionReason}</dd>
            </div>
          )}
          {n.journalId && can('ledger.journal.read') && (
            <div>
              <dt className="text-slate-500">Ledger</dt>
              <dd>
                <Link
                  className="font-medium text-brand-700 underline"
                  to={`/c/${companyId}/journals/${n.journalId}`}
                >
                  View journal
                </Link>
              </dd>
            </div>
          )}
        </dl>
      </Card>
      <Card>
        <Table label="Returned goods">
          <THead>
            <Tr>
              <Th>Product</Th>
              <Th className="text-right">Quantity</Th>
              <Th>Condition</Th>
              <Th>Back to</Th>
              {posted && <Th className="text-right">Credit</Th>}
            </Tr>
          </THead>
          <TBody>
            {n.lines.map((l) => (
              <Tr key={l.lineNo}>
                <Td>
                  <span className="font-mono">{l.sku}</span> {l.productName}
                </Td>
                <Td className="text-right tabular-nums">{qty(l.qtyMilli, l.unit)}</Td>
                <Td>{l.condition === 'damaged' ? 'Damaged' : 'Can be sold again'}</Td>
                <Td>{locationName(l.locationId)}</Td>
                {posted && (
                  <Td className="text-right tabular-nums">
                    {money((l.netMinor ?? 0) + (l.taxMinor ?? 0), currency)}
                  </Td>
                )}
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
      {n.allocations.length > 0 && (
        <>
          <h2 className="mb-3 mt-6 text-base font-semibold">Applied to</h2>
          <Card>
            <Table label="Applied to invoices">
              <THead>
                <Tr>
                  <Th>Invoice</Th>
                  <Th>Applied</Th>
                  <Th className="text-right">Amount</Th>
                </Tr>
              </THead>
              <TBody>
                {n.allocations.map((a, i) => (
                  <Tr key={`${a.invoiceId}-${i}`}>
                    <Td className="font-mono">{a.invoiceNumber}</Td>
                    <Td>{formatDateTime(a.allocatedAt)}</Td>
                    <Td className="text-right tabular-nums">{money(a.amountMinor, currency)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </Card>
        </>
      )}
      <RefundList source={{ type: 'creditNote', id: creditNoteId }} />
      {(open === 'approved' || open === 'rejected') && (
        <DecideDialog
          target={{ command: 'creditNote.decide', creditNoteId }}
          number={n.number}
          decision={open}
          postsText={`The goods go back into stock and the credit is posted today${walkIn ? ', paid back to the customer' : ''}.`}
          onClose={() => setOpen(null)}
        />
      )}
      {open === 'apply' && n.customerId && (
        <ApplyCreditDialog
          target={{ command: 'creditNote.allocate', creditNoteId }}
          number={n.number}
          customerId={n.customerId}
          available={BigInt(unused)}
          onClose={() => setOpen(null)}
        />
      )}
      {open === 'refund' && (
        <RefundDialog
          source={{ type: 'creditNote', id: creditNoteId, number: n.number }}
          available={unused}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
