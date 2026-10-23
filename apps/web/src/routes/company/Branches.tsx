import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { Alert, Badge, Card, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input } from '../../components/ui/form';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { useAction } from '../../lib/useAction';
import { useBranches } from './Members';

interface Branch {
  id: string;
  code: string;
  name: string;
  address?: string;
  status: 'active' | 'inactive';
  isHeadOffice?: boolean;
}

function BranchDialog({ branch, onClose }: { branch: Branch | null; onClose: () => void }) {
  const { companyId } = useCompany();
  const action = useAction();
  const [code, setCode] = useState(branch?.code ?? '');
  const [name, setName] = useState(branch?.name ?? '');
  const [address, setAddress] = useState(branch?.address ?? '');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (branch)
        await action.run('branch.update', { companyId, branchId: branch.id, name, address });
      else await action.run('branch.create', { companyId, code, name, address });
      onClose();
    } catch {
      /* shown below */
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={branch ? `Edit ${branch.name}` : 'New branch'}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        <Field
          label="Code"
          hint="Short unique code, e.g. LAG. Cannot be changed later."
          error={action.error?.fields.code}
        >
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            disabled={!!branch}
            maxLength={12}
          />
        </Field>
        <Field label="Name" error={action.error?.fields.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Address" error={action.error?.fields.address}>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={action.pending} disabled={!code || !name}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function Branches() {
  const { companyId, can } = useCompany();
  const branches = useBranches(companyId);
  const toggle = useAction();
  const [editing, setEditing] = useState<Branch | 'new' | null>(null);
  const canManage = can('company.branches.manage');
  const rows = [...(branches.data as Branch[])].sort(
    (a, b) => Number(!!b.isHeadOffice) - Number(!!a.isHeadOffice) || a.code.localeCompare(b.code),
  );

  return (
    <>
      <PageHeader
        title="Branches"
        description="Locations that hold stock and record sales."
        actions={
          canManage && (
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" aria-hidden /> New branch
            </Button>
          )
        }
      />
      {toggle.error && (
        <Alert tone="error" className="mb-4">
          {toggle.error.message}
        </Alert>
      )}
      <Card>
        {branches.loading ? (
          <Spinner />
        ) : (
          <Table label="Branches">
            <THead>
              <Tr>
                <Th>Code</Th>
                <Th>Name</Th>
                <Th>Address</Th>
                <Th>Status</Th>
                {canManage && <Th className="text-right">Actions</Th>}
              </Tr>
            </THead>
            <TBody>
              {rows.map((b) => (
                <Tr key={b.id}>
                  <Td className="font-mono">{b.code}</Td>
                  <Td>
                    {b.name} {b.isHeadOffice && <Badge tone="blue">Head office</Badge>}
                  </Td>
                  <Td>{b.address || '—'}</Td>
                  <Td>
                    <Badge tone={b.status === 'active' ? 'green' : 'slate'}>{b.status}</Badge>
                  </Td>
                  {canManage && (
                    <Td className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(b)}>
                        Edit
                      </Button>
                      {!b.isHeadOffice && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            void toggle
                              .run('branch.update', {
                                companyId,
                                branchId: b.id,
                                status: b.status === 'active' ? 'inactive' : 'active',
                              })
                              .catch(() => undefined)
                          }
                        >
                          {b.status === 'active' ? 'Deactivate' : 'Activate'}
                        </Button>
                      )}
                    </Td>
                  )}
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      {editing && (
        <BranchDialog
          branch={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
