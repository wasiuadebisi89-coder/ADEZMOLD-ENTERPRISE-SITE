import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { Alert, Badge, Card, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input, Select } from '../../components/ui/form';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { useLocations, type LocationRow } from '../../lib/inventory';
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

const LOCATION_TYPES = {
  store: 'Store (sellable stock)',
  quarantine: 'Quarantine (damaged or returned)',
} as const;

function LocationDialog({
  location,
  branches,
  onClose,
}: {
  location: LocationRow | null;
  branches: Branch[];
  onClose: () => void;
}) {
  const { companyId } = useCompany();
  const action = useAction();
  const active = branches.filter((b) => b.status === 'active');
  const [branchId, setBranchId] = useState(location?.branchId ?? active[0]?.id ?? '');
  const [name, setName] = useState(location?.name ?? '');
  const [type, setType] = useState<LocationRow['type']>(location?.type ?? 'store');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (location)
        await action.run('location.update', { companyId, locationId: location.id, name });
      else await action.run('location.create', { companyId, branchId, name, type });
      onClose();
    } catch {
      /* shown below */
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={location ? `Rename ${location.name}` : 'New stock location'}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        {!location && (
          <>
            <Field label="Branch" error={action.error?.fields.branchId}>
              <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                {active.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} · {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Type"
              hint="Stock in quarantine cannot be sold. Cannot be changed later."
              error={action.error?.fields.type}
            >
              <Select value={type} onChange={(e) => setType(e.target.value as LocationRow['type'])}>
                {Object.entries(LOCATION_TYPES).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}
        <Field
          label="Name"
          hint="For example Main store, Warehouse or Shop floor."
          error={action.error?.fields.name}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={action.pending}
            disabled={name.trim().length < 2 || !branchId}
          >
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Store and quarantine locations under each branch, where stock is held. */
function Locations({ branches, canManage }: { branches: Branch[]; canManage: boolean }) {
  const { companyId } = useCompany();
  const locations = useLocations(companyId);
  const toggle = useAction();
  const [editing, setEditing] = useState<LocationRow | 'new' | null>(null);
  const branchById = new Map(branches.map((b) => [b.id, b]));

  return (
    <section className="mt-8" aria-labelledby="locations-heading">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="locations-heading" className="text-lg font-semibold text-slate-900">
            Stock locations
          </h2>
          <p className="text-sm text-slate-500">
            Each branch starts with a store and a quarantine location. Add more for a warehouse or a
            second shop floor.
          </p>
        </div>
        {canManage && (
          <Button variant="secondary" onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden /> New location
          </Button>
        )}
      </div>
      {toggle.error && (
        <Alert tone="error" className="mb-4">
          {toggle.error.message}
        </Alert>
      )}
      <Card>
        {locations.loading ? (
          <Spinner />
        ) : (
          <Table label="Stock locations">
            <THead>
              <Tr>
                <Th>Branch</Th>
                <Th>Name</Th>
                <Th>Type</Th>
                <Th>Status</Th>
                {canManage && <Th className="text-right">Actions</Th>}
              </Tr>
            </THead>
            <TBody>
              {locations.data.map((l) => {
                const branch = branchById.get(l.branchId);
                return (
                  <Tr key={l.id}>
                    <Td>{branch ? `${branch.code} · ${branch.name}` : l.branchId}</Td>
                    <Td>{l.name}</Td>
                    <Td>{l.type === 'store' ? 'Store' : 'Quarantine'}</Td>
                    <Td>
                      <Badge tone={l.status === 'active' ? 'green' : 'slate'}>{l.status}</Badge>
                    </Td>
                    {canManage && (
                      <Td className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditing(l)}
                          aria-label={`Rename ${l.name}`}
                        >
                          Rename
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`${l.status === 'active' ? 'Deactivate' : 'Activate'} ${l.name}`}
                          onClick={() =>
                            void toggle
                              .run('location.update', {
                                companyId,
                                locationId: l.id,
                                status: l.status === 'active' ? 'inactive' : 'active',
                              })
                              .catch(() => undefined)
                          }
                        >
                          {l.status === 'active' ? 'Deactivate' : 'Activate'}
                        </Button>
                      </Td>
                    )}
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
      {editing && (
        <LocationDialog
          location={editing === 'new' ? null : editing}
          branches={branches}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
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
      <Locations branches={rows} canManage={canManage} />
      {editing && (
        <BranchDialog
          branch={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
