import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input } from '../../components/ui/form';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { money } from '../../lib/ledger';
import { useSuppliers, type SupplierRow } from '../../lib/purchasing';
import { useAction } from '../../lib/useAction';

export function SupplierDialog({
  supplier,
  onClose,
}: {
  supplier: SupplierRow | null;
  onClose: () => void;
}) {
  const { companyId } = useCompany();
  const action = useAction();
  const [code, setCode] = useState(supplier?.code ?? '');
  const [name, setName] = useState(supplier?.name ?? '');
  const [contactName, setContactName] = useState(supplier?.contactName ?? '');
  const [phone, setPhone] = useState(supplier?.phone ?? '');
  const [email, setEmail] = useState(supplier?.email ?? '');
  const [address, setAddress] = useState(supplier?.address ?? '');
  const [taxId, setTaxId] = useState(supplier?.taxId ?? '');
  const [terms, setTerms] = useState(String(supplier?.paymentTermsDays ?? ''));
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
    };
    try {
      if (supplier) {
        await action.run('supplier.update', { companyId, supplierId: supplier.id, ...details });
      } else {
        await action.run('supplier.create', { companyId, code, ...details });
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
      title={supplier ? `Edit ${supplier.code}` : 'New supplier'}
      description={supplier ? 'The supplier code is fixed once created.' : undefined}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Code" error={f.code}>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              disabled={!!supplier}
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
            hint="Invoices fall due this many days after the invoice date. 0 means on receipt."
            error={f.paymentTermsDays}
          >
            <Input value={terms} onChange={(e) => setTerms(e.target.value)} inputMode="numeric" />
          </Field>
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

export default function Suppliers() {
  const { companyId, company, can } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const suppliers = useSuppliers(companyId);
  const [editing, setEditing] = useState<SupplierRow | 'new' | null>(null);
  const [search, setSearch] = useState('');
  const canManage = can('purchasing.suppliers.manage');
  const term = search.trim().toLowerCase();
  const rows = suppliers.data.filter(
    (s) => !term || s.code.toLowerCase().includes(term) || s.name.toLowerCase().includes(term),
  );

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Who you buy from, what you owe them and what you have paid in advance."
        actions={
          canManage && (
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" aria-hidden /> New supplier
            </Button>
          )
        }
      />
      <div className="mb-4 max-w-sm">
        <Input
          aria-label="Search suppliers"
          placeholder="Search by code or name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {suppliers.loading ? (
        <Spinner />
      ) : suppliers.data.length === 0 ? (
        <EmptyState title="No suppliers yet" />
      ) : (
        <Card>
          <Table label="Suppliers">
            <THead>
              <Tr>
                <Th>Code</Th>
                <Th>Name</Th>
                <Th>Phone</Th>
                <Th className="text-right">Terms</Th>
                <Th className="text-right">Owed</Th>
                <Th className="text-right">Paid in advance</Th>
                <Th>Status</Th>
              </Tr>
            </THead>
            <TBody>
              {rows.map((s) => (
                <Tr key={s.id}>
                  <Td className="font-mono">
                    <Link
                      to={`/c/${companyId}/suppliers/${s.id}`}
                      className="text-brand-700 hover:underline"
                    >
                      {s.code}
                    </Link>
                  </Td>
                  <Td>{s.name}</Td>
                  <Td>{s.phone ?? '—'}</Td>
                  <Td className="text-right tabular-nums">{s.paymentTermsDays} days</Td>
                  <Td className="text-right tabular-nums">{money(s.balanceMinor, currency)}</Td>
                  <Td className="text-right tabular-nums">{money(s.advanceMinor, currency)}</Td>
                  <Td>
                    <Badge tone={s.status === 'active' ? 'green' : 'slate'}>{s.status}</Badge>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
      {editing && (
        <SupplierDialog
          supplier={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
