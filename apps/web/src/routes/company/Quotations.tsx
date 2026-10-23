import { Plus } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/button';
import { Badge, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { money } from '../../lib/ledger';
import { QUOTATION_TONE, useQuotations } from '../../lib/services';
import { formatDate } from '../../lib/utils';

export default function Quotations() {
  const { companyId, company, member, can } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  // Without sales.read a member sees only the quotations they made.
  const own = useMemo(
    () => (can('sales.read') || !member ? null : { uid: member.uid }),
    [can, member],
  );
  const quotes = useQuotations(companyId, own);
  return (
    <>
      <PageHeader
        title="Quotations"
        description="Offers to customers. A sent or accepted quotation can be turned into an invoice."
        actions={
          can('sales.quotation.manage') && (
            <Button asChild>
              <Link to={`/c/${companyId}/quotations/new`}>
                <Plus className="size-4" aria-hidden /> New quotation
              </Link>
            </Button>
          )
        }
      />
      {quotes.loading ? (
        <Spinner />
      ) : quotes.data.length === 0 ? (
        <EmptyState title="No quotations yet" />
      ) : (
        <Card>
          <Table label="Quotations">
            <THead>
              <Tr>
                <Th>Number</Th>
                <Th>Date</Th>
                <Th>Customer</Th>
                <Th>Valid until</Th>
                <Th className="text-right">Total</Th>
                <Th>Status</Th>
              </Tr>
            </THead>
            <TBody>
              {quotes.data.map((q) => (
                <Tr key={q.id}>
                  <Td className="font-mono">
                    <Link
                      to={`/c/${companyId}/quotations/${q.id}`}
                      className="text-brand-700 hover:underline"
                    >
                      {q.number}
                    </Link>
                  </Td>
                  <Td>{formatDate(q.quoteDate)}</Td>
                  <Td>{q.customerName}</Td>
                  <Td>{formatDate(q.validUntil)}</Td>
                  <Td className="text-right tabular-nums">{money(q.totalMinor, currency)}</Td>
                  <Td>
                    <Badge tone={QUOTATION_TONE[q.status]}>{q.status}</Badge>
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
