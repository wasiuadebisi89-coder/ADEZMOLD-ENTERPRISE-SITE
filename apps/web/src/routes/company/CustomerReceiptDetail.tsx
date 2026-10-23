import { doc } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  AllocationTable,
  allocationInput,
  allocationTotal,
} from '../../components/AllocationTable';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { Alert, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { db } from '../../lib/firebase';
import { useDoc } from '../../lib/firestore-hooks';
import { money } from '../../lib/ledger';
import { useOpenSalesInvoices, type CustomerReceiptRow } from '../../lib/sales';
import { useAction } from '../../lib/useAction';
import { formatDate, formatDateTime } from '../../lib/utils';
import { openInvoices } from './NewCustomerReceipt';

function ApplyAdvanceDialog({
  receipt,
  onClose,
}: {
  receipt: CustomerReceiptRow;
  onClose: () => void;
}) {
  const { companyId, company } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const invoices = useOpenSalesInvoices(companyId, receipt.customerId);
  const action = useAction();
  const [values, setValues] = useState<Record<string, string>>({});
  const available = BigInt(receipt.amountMinor - receipt.allocatedMinor);
  const total = allocationTotal(values, currency);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await action.run('customerReceipt.allocate', {
        companyId,
        receiptId: receipt.id,
        allocations: allocationInput(values),
      });
      onClose();
    } catch {
      /* shown below */
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Apply ${receipt.number} to invoices`}
      description={`${money(available, currency)} of this payment is not yet allocated. Applying it is dated today.`}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        {invoices.loading ? (
          <Spinner />
        ) : (
          <AllocationTable
            invoices={openInvoices(invoices.data)}
            values={values}
            onChange={setValues}
            available={available}
            referenceLabel="Reference"
            emptyText="This customer has no unpaid invoices."
            actionLabel="Settle"
          />
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={action.pending}
            disabled={total === null || total <= 0n || total > available}
          >
            Apply
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function CustomerReceiptDetail() {
  const { companyId, company, can } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const { receiptId = '' } = useParams();
  const ref = useMemo(
    () => doc(db, `companies/${companyId}/customerReceipts/${receiptId}`),
    [companyId, receiptId],
  );
  const receipt = useDoc<Omit<CustomerReceiptRow, 'id'>>(ref);
  const [applying, setApplying] = useState(false);
  if (receipt.loading) return <Spinner />;
  const x = receipt.data;
  if (!x) return <EmptyState title="Receipt not found" />;
  const unallocated = x.amountMinor - x.allocatedMinor;
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
            {can('sales.receipt.post') && unallocated > 0 && (
              <Button onClick={() => setApplying(true)}>Apply to invoices</Button>
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
      {applying && <ApplyAdvanceDialog receipt={x} onClose={() => setApplying(false)} />}
    </>
  );
}
