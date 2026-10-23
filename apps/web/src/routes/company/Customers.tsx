import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toDecimalString } from '@bms/domain';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input, Select } from '../../components/ui/form';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { money } from '../../lib/ledger';
import { useCustomers, type CustomerRow } from '../../lib/sales';
import { useAction } from '../../lib/useAction';

export function CustomerDialog({
  customer,
  onClose,
}: {
  customer: CustomerRow | null;
  onClose: () => void;
}) {
  const { companyId, company } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const action = useAction();
  const [code, setCode] = useState(customer?.code ?? '');
  const [name, setName] = useState(customer?.name ?? '');
  const [contactName, setContactName] = useState(customer?.contactName ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [email, setEmail] = useState(customer?.email ?? '');
  const [address, setAddress] = useState(customer?.address ?? '');
  const [taxId, setTaxId] = useState(customer?.taxId ?? '');
  const [terms, setTerms] = useState(String(customer?.paymentTermsDays ?? ''));
  const [creditLimit, setCreditLimit] = useState(
    customer ? toDecimalString(BigInt(customer.creditLimitMinor), currency) : '0',
  );
  const [status, setStatus] = useState(customer?.status ?? 'active');
  const termsDays = Number.parseInt(terms, 10);
  const termsValid = /^\d{1,3}$/.test(terms.trim()) && termsDays <= 365;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const details = {
      name,
      contactName,
      phone,
      email,
      address,
      taxId,
      paymentTermsDays: termsDays,
      creditLimit,
    };
    try {
      if (customer) {
        await action.run('customer.update', {
          companyId,
          customerId: customer.id,
          ...details,
          status,
        });
      } else {
        await action.run('customer.create', { companyId, code, ...details });
      }
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
      title={customer ? `Edit ${customer.code}` : 'New customer'}
      description={customer ? 'The customer code is fixed once created.' : undefined}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Code" error={f.code}>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              disabled={!!customer}
              maxLength={20}
            />
          </Field>
          <Field label="Name" error={f.name} className="sm:col-span-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={160} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact person (optional)" error={f.contactName}>
            <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </Field>
          <Field label="Phone (optional)" error={f.phone}>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          </Field>
          <Field label="Email (optional)" error={f.email}>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          </Field>
          <Field label="Tax ID (optional)" error={f.taxId}>
            <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} />
          </Field>
          <Field label="Address (optional)" error={f.address} className="sm:col-span-2">
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
          <Field
            label="Payment terms (days)"
            hint="Credit sales fall due this many days after the sale."
            error={f.paymentTermsDays}
          >
            <Input value={terms} onChange={(e) => setTerms(e.target.value)} inputMode="numeric" />
          </Field>
          <Field
            label="Credit limit"
            hint="The most they may owe. 0 means cash only. Going over needs a manager's approval."
            error={f.creditLimit}
          >
            <Input
              value={creditLimit}
              onChange={(e) => setCreditLimit(e.target.value)}
              inputMode="decimal"
            />
          </Field>
          {customer && (
            <Field label="Status">
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </Field>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={action.pending}
            disabled={!code || name.trim().length < 2 || !termsValid}
          >
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function Customers() {
  const { companyId, company, can } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const customers = useCustomers(companyId);
  const [editing, setEditing] = useState<CustomerRow | 'new' | null>(null);
  const [search, setSearch] = useState('');
  const canManage = can('sales.customers.manage');
  const term = search.trim().toLowerCase();
  const rows = customers.data.filter(
    (c) =>
      !term ||
      c.code.toLowerCase().includes(term) ||
      c.name.toLowerCase().includes(term) ||
      (c.phone ?? '').includes(term),
  );

  return (
    <>
      <PageHeader
        title="Customers"
        description="Who you sell to on credit, what they owe and how much more credit they have."
        actions={
          canManage && (
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" aria-hidden /> New customer
            </Button>
          )
        }
      />
      <div className="mb-4 max-w-sm">
        <Input
          aria-label="Search customers"
          placeholder="Search by code, name or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {customers.loading ? (
        <Spinner />
      ) : customers.data.length === 0 ? (
        <EmptyState title="No customers yet" />
      ) : (
        <Card>
          <Table label="Customers">
            <THead>
              <Tr>
                <Th>Code</Th>
                <Th>Name</Th>
                <Th>Phone</Th>
                <Th className="text-right">Credit limit</Th>
                <Th className="text-right">Owes</Th>
                <Th className="text-right">Paid in advance</Th>
                <Th>Status</Th>
              </Tr>
            </THead>
            <TBody>
              {rows.map((c) => (
                <Tr key={c.id}>
                  <Td className="font-mono">
                    <Link
                      to={`/c/${companyId}/customers/${c.id}`}
                      className="text-brand-700 hover:underline"
                    >
                      {c.code}
                    </Link>
                  </Td>
                  <Td>{c.name}</Td>
                  <Td>{c.phone ?? '—'}</Td>
                  <Td className="text-right tabular-nums">
                    {c.creditLimitMinor === 0 ? 'Cash only' : money(c.creditLimitMinor, currency)}
                  </Td>
                  <Td className="text-right tabular-nums">{money(c.balanceMinor, currency)}</Td>
                  <Td className="text-right tabular-nums">{money(c.advanceMinor, currency)}</Td>
                  <Td>
                    <Badge tone={c.status === 'active' ? 'green' : 'slate'}>{c.status}</Badge>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
      {editing && (
        <CustomerDialog
          customer={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
