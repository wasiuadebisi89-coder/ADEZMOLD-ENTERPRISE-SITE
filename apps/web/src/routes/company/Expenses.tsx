import { Plus } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/button';
import { Badge, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { EXPENSE_MODE, useExpenses } from '../../lib/expenses';
import { money } from '../../lib/ledger';
import { formatDate } from '../../lib/utils';

export default function Expenses() {
  const { companyId, company, can } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const rows = useExpenses(companyId);
  const canPost = can('purchasing.payment.post') || can('purchasing.invoice.post');
  return (
    <>
      <PageHeader
        title="Expenses"
        description="Office supplies, services, repairs and replacements. Pick what it was for and how it was paid; the books are updated for you."
        actions={
          canPost && (
            <Button asChild>
              <Link to={`/c/${companyId}/expenses/new`}>
                <Plus className="size-4" aria-hidden /> Record expense
              </Link>
            </Button>
          )
        }
      />
      {rows.loading ? (
        <Spinner />
      ) : rows.data.length === 0 ? (
        <EmptyState
          title="No expenses yet"
          description="Record a business expense when you pay for something the company uses."
        />
      ) : (
        <Card>
          <Table label="Expenses">
            <THead>
              <Tr>
                <Th>Number</Th>
                <Th>Date</Th>
                <Th>Paid to</Th>
                <Th>For</Th>
                <Th className="text-right">Amount</Th>
                <Th>How</Th>
              </Tr>
            </THead>
            <TBody>
              {rows.data.map((x) => (
                <Tr key={x.id}>
                  <Td className="font-mono">
                    <Link
                      to={`/c/${companyId}/expenses/${x.id}`}
                      className="text-brand-700 hover:underline"
                    >
                      {x.number}
                    </Link>
                  </Td>
                  <Td>{formatDate(x.expenseDate)}</Td>
                  <Td>{x.payee}</Td>
                  <Td>
                    {x.lines[0]?.description}
                    {x.lines.length > 1 ? ` and ${x.lines.length - 1} more` : ''}
                  </Td>
                  <Td className="text-right tabular-nums">{money(x.totalMinor, currency)}</Td>
                  <Td>
                    <Badge tone={EXPENSE_MODE[x.mode].tone}>{EXPENSE_MODE[x.mode].label}</Badge>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
