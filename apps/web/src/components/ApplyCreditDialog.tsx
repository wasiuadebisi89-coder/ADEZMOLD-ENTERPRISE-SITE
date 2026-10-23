import { useState } from 'react';
import { useCompany } from '../lib/company';
import { money } from '../lib/ledger';
import { salesOutstanding, useOpenSalesInvoices, type SalesInvoiceRow } from '../lib/sales';
import { useAction } from '../lib/useAction';
import { AllocationTable, allocationInput, allocationTotal } from './AllocationTable';
import { Button } from './ui/button';
import { Dialog } from './ui/dialog';
import { Alert, Spinner } from './ui/feedback';

export const openInvoices = (rows: readonly SalesInvoiceRow[]) =>
  rows.map((i) => ({
    id: i.id,
    number: i.number,
    reference: i.reference,
    dueDate: i.dueDate,
    outstandingMinor: salesOutstanding(i),
  }));

type Target =
  | { command: 'customerReceipt.allocate'; receiptId: string }
  | { command: 'creditNote.allocate'; creditNoteId: string };

/** Applies money a customer holds with us (a receipt or credit note) to their invoices. */
export function ApplyCreditDialog({
  target,
  number,
  customerId,
  available,
  onClose,
}: {
  target: Target;
  number: string;
  customerId: string;
  available: bigint;
  onClose: () => void;
}) {
  const { companyId, company } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const invoices = useOpenSalesInvoices(companyId, customerId);
  const action = useAction();
  const [values, setValues] = useState<Record<string, string>>({});
  const total = allocationTotal(values, currency);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { command, ...ids } = target;
      await action.run(command, {
        companyId,
        allocations: allocationInput(values),
        ...ids,
      } as never);
      onClose();
    } catch {
      /* shown below */
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Apply ${number} to invoices`}
      description={`${money(available, currency)} of this is not yet used. Applying it is dated today.`}
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
