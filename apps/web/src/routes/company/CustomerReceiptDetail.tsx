import { doc } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApplyCreditDialog } from '../../components/ApplyCreditDialog';
import { RefundDialog } from '../../components/RefundDialog';
import { Button } from '../../components/ui/button';
import { Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { db } from '../../lib/firebase';
import { useDoc } from '../../lib/firestore-hooks';
import { money } from '../../lib/ledger';
import { unusedCredit, type CustomerReceiptRow } from '../../lib/sales';
import { formatDate, formatDateTime } from '../../lib/utils';
import { RefundList } from './CustomerRefundDetail';

export default function CustomerReceiptDetail() {
  const { companyId, company, can } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const { receiptId = '' } = useParams();
  const ref = useMemo(
    () => doc(db, `companies/${companyId}/customerReceipts/${receiptId}`),
    [companyId, receiptId],
  );
  const receipt = useDoc<Omit<CustomerReceiptRow, 'id'>>(ref);
  const [open, setOpen] = useState<'apply' | 'refund' | null>(null);
  if (receipt.loading) return <Spinner />;
  const x = receipt.data;
  if (!x) return <EmptyState title="Receipt not found" />;
  const unallocated = unusedCredit(x.amountMinor, x);
  const p = `/c/${companyId}/sales`;

  return (
    <>
      <PageHeader
        title={`Payment received ${x.number}`}
        description={x.customerName}
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link to={`${p}?tab=receipts`}>All payments</Link>
            </Button>
            {(can('sales.refund.post') || can('sales.refund.request')) && unallocated > 0 && (
              <Button variant="secondary" onClick={() => setOpen('refund')}>
                Refund
              </Button>
            )}
            {can('sales.receipt.post') && unallocated > 0 && (
              <Button onClick={() => setOpen('apply')}>Apply to invoices</Button>
            )}
          </>
        }
      />
      <Card className="mb-4 p-4">
        <dl className="grid gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-slate-500">Amount</dt>
            <dd className="font-medium tabular-nums">{money(x.amountMinor, currency)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Not yet allocated</dt>
            <dd className="font-medium tabular-nums" data-testid="receipt-unallocated">
              {money(unallocated, currency)}
            </dd>
          </div>
          {(x.refundedMinor ?? 0) > 0 && (
            <div>
              <dt className="text-slate-500">Paid back</dt>
              <dd className="font-medium tabular-nums">{money(x.refundedMinor ?? 0, currency)}</dd>
            </div>
          )}
          <div>
            <dt className="text-slate-500">Received on</dt>
            <dd className="font-medium">{formatDate(x.postingDate)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Received into</dt>
            <dd className="font-medium">{x.depositAccountName}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Reference</dt>
            <dd className="font-medium">{x.reference ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Customer</dt>
            <dd>
              <Link
                className="font-medium text-brand-700 underline"
                to={`/c/${companyId}/customers/${x.customerId}`}
              >
                {x.customerName}
              </Link>
            </dd>
          </div>
          {can('ledger.journal.read') && (
            <div>
              <dt className="text-slate-500">Ledger</dt>
              <dd>
                <Link
                  className="font-medium text-brand-700 underline"
                  to={`/c/${companyId}/journals/${x.journalId}`}
                >
                  View journal
                </Link>
              </dd>
            </div>
          )}
        </dl>
      </Card>
      <h2 className="mb-3 text-base font-semibold">Allocations</h2>
      <Card>
        {x.allocations.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">Not allocated to any invoice yet.</p>
        ) : (
          <Table label="Allocations">
            <THead>
              <Tr>
                <Th>Invoice</Th>
                <Th>Applied</Th>
                <Th className="text-right">Amount</Th>
              </Tr>
            </THead>
            <TBody>
              {x.allocations.map((a, i) => (
                <Tr key={`${a.invoiceId}-${i}`}>
                  <Td className="font-mono">
                    <Link
                      to={`${p}/invoices/${a.invoiceId}`}
                      className="text-brand-700 hover:underline"
                    >
                      {a.invoiceNumber}
                    </Link>
                  </Td>
                  <Td>{formatDateTime(a.allocatedAt)}</Td>
                  <Td className="text-right tabular-nums">{money(a.amountMinor, currency)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      <RefundList source={{ type: 'customerReceipt', id: receiptId }} />
      {open === 'apply' && (
        <ApplyCreditDialog
          target={{ command: 'customerReceipt.allocate', receiptId }}
          number={x.number}
          customerId={x.customerId}
          available={BigInt(unallocated)}
          onClose={() => setOpen(null)}
        />
      )}
      {open === 'refund' && (
        <RefundDialog
          source={{ type: 'customerReceipt', id: receiptId, number: x.number }}
          available={unallocated}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
