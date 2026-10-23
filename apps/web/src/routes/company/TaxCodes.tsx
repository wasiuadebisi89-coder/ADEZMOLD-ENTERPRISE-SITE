import { doc } from 'firebase/firestore';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { formatRatePercent } from '@bms/domain';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input, Select } from '../../components/ui/form';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { db } from '../../lib/firebase';
import { useDoc } from '../../lib/firestore-hooks';
import { useTaxCodes, type TaxCodeRow } from '../../lib/sales';
import { useAction } from '../../lib/useAction';

function TaxCodeDialog({ taxCode, onClose }: { taxCode: TaxCodeRow | null; onClose: () => void }) {
  const { companyId } = useCompany();
  const action = useAction();
  const [code, setCode] = useState(taxCode?.code ?? '');
  const [name, setName] = useState(taxCode?.name ?? '');
  const [rate, setRate] = useState(taxCode ? formatRatePercent(taxCode.rateBp) : '');
  const [status, setStatus] = useState(taxCode?.status ?? 'active');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (taxCode) {
        await action.run('taxCode.update', {
          companyId,
          taxCodeId: taxCode.id,
          name,
          rate,
          status,
        });
      } else {
        await action.run('taxCode.create', { companyId, code, name, rate });
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
      title={taxCode ? `Edit ${taxCode.code}` : 'New tax code'}
      description="Enter the rate your tax adviser has confirmed. A new rate applies to sales posted afterwards; posted sales keep the rate they used."
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Code" error={f.code}>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              disabled={!!taxCode}
              maxLength={20}
            />
          </Field>
          <Field label="Name" error={f.name} className="sm:col-span-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </Field>
          <Field label="Rate (%)" error={f.rate}>
            <Input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" />
          </Field>
          {taxCode && (
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
            disabled={!code || name.trim().length < 2 || !rate.trim()}
          >
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function TaxCodes() {
  const { companyId, can } = useCompany();
  const taxCodes = useTaxCodes(companyId);
  const settingsRef = useMemo(
    () => doc(db, `companies/${companyId}/settings/general`),
    [companyId],
  );
  const settings = useDoc<{ pricesIncludeTax: boolean }>(settingsRef);
  const [editing, setEditing] = useState<TaxCodeRow | 'new' | null>(null);
  const canManage = can('ledger.accounts.manage');

  return (
    <>
      <PageHeader
        title="Tax codes"
        description="Tax charged on sales, posted to output tax payable. No rate is set up for you: companies not registered for tax simply have none."
        actions={
          canManage && (
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" aria-hidden /> New tax code
            </Button>
          )
        }
      />
      {settings.data && (
        <Alert tone="info" className="mb-4">
          Sale prices {settings.data.pricesIncludeTax ? 'include' : 'do not include'} tax. Tax is
          worked out and rounded on each line.{' '}
          {can('company.settings.update') && (
            <Link className="font-medium underline" to={`/c/${companyId}/settings`}>
              Change in settings
            </Link>
          )}
        </Alert>
      )}
      {taxCodes.loading ? (
        <Spinner />
      ) : taxCodes.data.length === 0 ? (
        <EmptyState title="No tax codes" />
      ) : (
        <Card>
          <Table label="Tax codes">
            <THead>
              <Tr>
                <Th>Code</Th>
                <Th>Name</Th>
                <Th className="text-right">Rate</Th>
                <Th>Status</Th>
                {canManage && (
                  <Th className="text-right">
                    <span className="sr-only">Actions</span>
                  </Th>
                )}
              </Tr>
            </THead>
            <TBody>
              {taxCodes.data.map((t) => (
                <Tr key={t.id}>
                  <Td className="font-mono">{t.code}</Td>
                  <Td>{t.name}</Td>
                  <Td className="text-right tabular-nums">{formatRatePercent(t.rateBp)}%</Td>
                  <Td>
                    <Badge tone={t.status === 'active' ? 'green' : 'slate'}>{t.status}</Badge>
                  </Td>
                  {canManage && (
                    <Td className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>
                        Edit
                      </Button>
                    </Td>
                  )}
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
      {editing && (
        <TaxCodeDialog
          taxCode={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
