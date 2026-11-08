import { doc } from 'firebase/firestore';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { PrintReceiptButton } from '../../components/ReceiptPrint';
import { Button } from '../../components/ui/button';
import { Badge, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { EXPENSE_MODE, type ExpenseRow } from '../../lib/expenses';
import { db } from '../../lib/firebase';
import { useDoc } from '../../lib/firestore-hooks';
import { money } from '../../lib/ledger';
import { expenseVoucher } from '../../lib/receipt';
import { formatDate } from '../../lib/utils';

export default function ExpenseDetail() {
  const { companyId, company, can } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const { expenseId = '' } = useParams();
  const ref = useMemo(
    () => doc(db, `companies/${companyId}/expenses/${expenseId}`),
    [companyId, expenseId],
  );
  const expense = useDoc<Omit<ExpenseRow, 'id'>>(ref);
  if (expense.loading) return <Spinner />;
  const x = expense.data;
  if (!x) return <EmptyState title="Expense not found" />;
  const link = 'font-medium text-brand-700 underline';

  return (
    <>
      <PageHeader
        title={`Expense ${x.number}`}
        description={x.payee}
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link to={`/c/${companyId}/expenses`}>All expenses</Link>
            </Button>
            <PrintReceiptButton
              title={`Expense voucher ${x.number}`}
              label="Voucher"
              branchId={x.branchId}
              build={(h) => expenseVoucher(x, h)}
            />
          </>
        }
      />
      <Card className="mb-4 p-4">
        <dl className="grid gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-slate-500">Total</dt>
            <dd className="font-medium tabular-nums" data-testid="expense-total">
              {money(x.totalMinor, currency)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Date</dt>
            <dd className="font-medium">{formatDate(x.expenseDate)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">How</dt>
            <dd>
              <Badge tone={EXPENSE_MODE[x.mode].tone}>{EXPENSE_MODE[x.mode].label}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">{x.mode === 'paid' ? 'Paid to' : 'Owed to'}</dt>
            <dd className="font-medium">
              {x.supplierId && can('purchasing.read') ? (
                <Link className={link} to={`/c/${companyId}/suppliers/${x.supplierId}`}>
                  {x.payee}
                </Link>
              ) : (
                x.payee
              )}
            </dd>
          </div>
          {x.mode === 'paid' ? (
            <div>
              <dt className="text-slate-500">Paid from</dt>
              <dd className="font-medium">{x.paymentAccountName}</dd>
            </div>
          ) : (
            <>
              <div>
                <dt className="text-slate-500">Supplier invoice</dt>
                <dd>
                  <Link
                    className={link}
                    to={`/c/${companyId}/purchases/invoices/${x.purchaseInvoiceId}`}
                  >
                    {x.purchaseInvoiceNumber}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Due</dt>
                <dd className="font-medium">{x.dueDate ? formatDate(x.dueDate) : '—'}</dd>
              </div>
            </>
          )}
          <div>
            <dt className="text-slate-500">Receipt or invoice number</dt>
            <dd className="font-medium">{x.reference ?? '—'}</dd>
          </div>
          {can('ledger.journal.read') && (
            <div>
              <dt className="text-slate-500">Ledger</dt>
              <dd>
                <Link className={link} to={`/c/${companyId}/journals/${x.journalId}`}>
                  View journal
                </Link>
              </dd>
            </div>
          )}
        </dl>
        {x.memo && <p className="mt-4 text-sm text-slate-600">{x.memo}</p>}
      </Card>
      <Card>
        <Table label="Items">
          <THead>
            <Tr>
              <Th>Item</Th>
              <Th>Expense type</Th>
              <Th className="text-right">Amount</Th>
            </Tr>
          </THead>
          <TBody>
            {x.lines.map((l) => (
              <Tr key={l.lineNo}>
                <Td>{l.description}</Td>
                <Td>
                  {l.accountCode} · {l.accountName}
                </Td>
                <Td className="text-right tabular-nums">{money(l.amountMinor, currency)}</Td>
              </Tr>
            ))}
            {x.inputTaxMinor > 0 && (
              <Tr>
                <Td>Input tax</Td>
                <Td />
                <Td className="text-right tabular-nums">{money(x.inputTaxMinor, currency)}</Td>
              </Tr>
            )}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
