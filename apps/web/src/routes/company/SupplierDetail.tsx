import { doc } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { BackdateNotice, useBackdate, useToday } from '../../components/BackdateNotice';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input, Select } from '../../components/ui/form';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { db } from '../../lib/firebase';
import { useDoc } from '../../lib/firestore-hooks';
import { money } from '../../lib/ledger';
import {
  RECEIPT_STATUS,
  outstanding,
  useSupplierDocs,
  type InvoiceRow,
  type PaymentRow,
  type ReceiptRow,
  type ReturnRow,
  type SupplierRow,
} from '../../lib/purchasing';
import { useAction } from '../../lib/useAction';
import { formatDate } from '../../lib/utils';
import { usePostingBranches } from './NewJournal';
import { SupplierDialog } from './Suppliers';

function OpeningBalanceDialog({
  supplier,
  onClose,
}: {
  supplier: SupplierRow;
  onClose: () => void;
}) {
  const { companyId } = useCompany();
  const today = useToday();
  const branches = usePostingBranches();
  const action = useAction();
  const [branchId, setBranchId] = useState('');
  const [asAtDate, setAsAtDate] = useState(today);
  const [dueDate, setDueDate] = useState('');
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('');
  const [amount, setAmount] = useState('');
  const backdate = useBackdate(asAtDate);
  const branch = branchId || branches.data[0]?.id || '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await action.run('supplierOpeningBalance.post', {
        companyId,
        supplierId: supplier.id,
        branchId: branch,
        asAtDate,
        ...(dueDate ? { dueDate } : {}),
        supplierInvoiceNo,
        amount,
        ...(backdate.approvalId ? { backdateApprovalId: backdate.approvalId } : {}),
      });
      onClose();
    } catch {
      /* shown below */
    }
  };
  const f = action.error?.fields ?? {};
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Opening balance for ${supplier.name}`}
      description="An unpaid invoice from before you started using the system. It is owed to the supplier and set against opening balance equity."
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Supplier's invoice number" error={f.supplierInvoiceNo}>
            <Input
              value={supplierInvoiceNo}
              onChange={(e) => setSupplierInvoiceNo(e.target.value)}
            />
          </Field>
          <Field label="Amount still owed" error={f.amount}>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="As at" error={f.asAtDate}>
            <Input
              type="date"
              value={asAtDate}
              max={today}
              onChange={(e) => setAsAtDate(e.target.value)}
            />
          </Field>
          <Field label="Due date (optional)" error={f.dueDate}>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label="Branch">
            <Select value={branch} onChange={(e) => setBranchId(e.target.value)}>
              {branches.data.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <BackdateNotice date={asAtDate} state={backdate} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={action.pending}
            disabled={
              !supplierInvoiceNo.trim() ||
              !amount.trim() ||
              (backdate.needsApproval && !backdate.approvalId)
            }
          >
            Record balance
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function SupplierDetail() {
  const { companyId, company, can } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const today = useToday();
  const { supplierId = '' } = useParams();
  const ref = useMemo(
    () => doc(db, `companies/${companyId}/suppliers/${supplierId}`),
    [companyId, supplierId],
  );
  const supplier = useDoc<Omit<SupplierRow, 'id'>>(ref);
  const invoices = useSupplierDocs<InvoiceRow>(companyId, 'purchaseInvoices', supplierId);
  const receipts = useSupplierDocs<ReceiptRow>(companyId, 'goodsReceipts', supplierId);
  const payments = useSupplierDocs<PaymentRow>(companyId, 'supplierPayments', supplierId);
  const returns = useSupplierDocs<ReturnRow>(companyId, 'supplierReturns', supplierId);
  const [editing, setEditing] = useState(false);
  const [opening, setOpening] = useState(false);

  if (supplier.loading) return <Spinner />;
  const s = supplier.data;
  if (!s) return <EmptyState title="Supplier not found" />;
  const p = `/c/${companyId}/purchases`;
  const q = `?supplier=${supplierId}`;

  return (
    <>
      <PageHeader
        title={`${s.code} · ${s.name}`}
        description={[s.contactName, s.phone, s.email].filter(Boolean).join(' · ') || undefined}
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link to={`/c/${companyId}/suppliers`}>All suppliers</Link>
            </Button>
            {can('purchasing.suppliers.manage') && (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
            {can('purchasing.invoice.post') && (
              <Button variant="secondary" onClick={() => setOpening(true)}>
                Opening balance
              </Button>
            )}
            {can('purchasing.payment.post') && (
              <Button asChild>
                <Link to={`${p}/payments/new${q}`}>Pay supplier</Link>
              </Button>
            )}
          </>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-slate-500">Owed</p>
          <p className="text-xl font-semibold tabular-nums" data-testid="supplier-owed">
            {money(s.balanceMinor, currency)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">Paid in advance</p>
          <p className="text-xl font-semibold tabular-nums">{money(s.advanceMinor, currency)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">Terms</p>
          <p className="text-xl font-semibold">
            {s.paymentTermsDays} days{' '}
            <Badge tone={s.status === 'active' ? 'green' : 'slate'}>{s.status}</Badge>
          </p>
        </Card>
      </div>

      <h2 className="mb-3 text-base font-semibold">Invoices</h2>
      <Card className="mb-6">
        {invoices.loading ? (
          <Spinner />
        ) : invoices.data.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No invoices yet.</p>
        ) : (
          <Table label="Supplier invoices">
            <THead>
              <Tr>
                <Th>Number</Th>
                <Th>Their number</Th>
                <Th>Date</Th>
                <Th>Due</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Outstanding</Th>
                <Th>Status</Th>
              </Tr>
            </THead>
            <TBody>
              {invoices.data.map((i) => (
                <Tr key={i.id}>
                  <Td className="font-mono">
                    <Link to={`${p}/invoices/${i.id}`} className="text-brand-700 hover:underline">
                      {i.number}
                    </Link>
                  </Td>
                  <Td>{i.supplierInvoiceNo}</Td>
                  <Td>{formatDate(i.invoiceDate)}</Td>
                  <Td>{formatDate(i.dueDate)}</Td>
                  <Td className="text-right tabular-nums">{money(i.totalMinor, currency)}</Td>
                  <Td className="text-right tabular-nums">{money(outstanding(i), currency)}</Td>
                  <Td>
                    {i.status === 'paid' ? (
                      <Badge tone="green">paid</Badge>
                    ) : i.dueDate < today ? (
                      <Badge tone="red">overdue</Badge>
                    ) : (
                      <Badge tone="amber">open</Badge>
                    )}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-base font-semibold">Goods received</h2>
          <Card>
            {receipts.data.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">Nothing received yet.</p>
            ) : (
              <Table label="Goods received from supplier">
                <THead>
                  <Tr>
                    <Th>Number</Th>
                    <Th>Date</Th>
                    <Th className="text-right">Value</Th>
                    <Th>Status</Th>
                  </Tr>
                </THead>
                <TBody>
                  {receipts.data.map((r) => (
                    <Tr key={r.id}>
                      <Td className="font-mono">
                        <Link
                          to={`${p}/receipts/${r.id}`}
                          className="text-brand-700 hover:underline"
                        >
                          {r.number}
                        </Link>
                      </Td>
                      <Td>{formatDate(r.postingDate)}</Td>
                      <Td className="text-right tabular-nums">{money(r.totalMinor, currency)}</Td>
                      <Td>
                        <Badge tone={RECEIPT_STATUS[r.invoiceStatus].tone}>
                          {RECEIPT_STATUS[r.invoiceStatus].label}
                        </Badge>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </section>
        <section>
          <h2 className="mb-3 text-base font-semibold">Payments and returns</h2>
          <Card>
            {payments.data.length + returns.data.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No payments or returns yet.</p>
            ) : (
              <Table label="Payments and returns">
                <THead>
                  <Tr>
                    <Th>Number</Th>
                    <Th>Date</Th>
                    <Th className="text-right">Amount</Th>
                  </Tr>
                </THead>
                <TBody>
                  {payments.data.map((x) => (
                    <Tr key={x.id}>
                      <Td className="font-mono">
                        <Link
                          to={`${p}/payments/${x.id}`}
                          className="text-brand-700 hover:underline"
                        >
                          {x.number}
                        </Link>
                      </Td>
                      <Td>{formatDate(x.postingDate)}</Td>
                      <Td className="text-right tabular-nums">{money(x.amountMinor, currency)}</Td>
                    </Tr>
                  ))}
                  {returns.data.map((x) => (
                    <Tr key={x.id}>
                      <Td className="font-mono">
                        <Link
                          to={`${p}/returns/${x.id}`}
                          className="text-brand-700 hover:underline"
                        >
                          {x.number}
                        </Link>
                      </Td>
                      <Td>{formatDate(x.postingDate)}</Td>
                      <Td className="text-right tabular-nums">{money(x.creditMinor, currency)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </section>
      </div>
      {editing && <SupplierDialog supplier={s} onClose={() => setEditing(false)} />}
      {opening && <OpeningBalanceDialog supplier={s} onClose={() => setOpening(false)} />}
    </>
  );
}
