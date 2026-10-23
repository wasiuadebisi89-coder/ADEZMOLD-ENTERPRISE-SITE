import { Plus } from 'lucide-react';
import { useState } from 'react';
import { PERMISSIONS, type Permission } from '@bms/domain';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { Alert, Badge, Card, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input, Select, Textarea } from '../../components/ui/form';
import { useCompany } from '../../lib/company';
import { useAction } from '../../lib/useAction';
import { useRoles, type RoleRow } from './Members';

const MODULE_LABELS: Record<string, string> = {
  company: 'Company administration',
  settings: 'Financial periods',
  approvals: 'Approvals',
  ledger: 'Accounting',
  inventory: 'Inventory',
  purchasing: 'Purchasing',
  sales: 'Sales',
  assets: 'Fixed assets',
  reports: 'Reports',
};

const GROUPS = Object.entries(
  PERMISSIONS.reduce<Record<string, Permission[]>>((acc, p) => {
    const module = p.split('.')[0]!;
    (acc[module] ??= []).push(p);
    return acc;
  }, {}),
);

function RoleDialog({
  role,
  roles,
  canManage,
  onClose,
}: {
  role: RoleRow | null;
  roles: RoleRow[];
  canManage: boolean;
  onClose: () => void;
}) {
  const { companyId } = useCompany();
  const action = useAction();
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [permissions, setPermissions] = useState<string[]>(role?.permissions ?? []);
  const readOnly = !canManage || (role?.system ?? false);

  const toggle = (p: string) =>
    setPermissions((list) => (list.includes(p) ? list.filter((x) => x !== p) : [...list, p]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (role)
        await action.run('role.update', {
          companyId,
          roleId: role.id,
          name,
          description,
          permissions: permissions as Permission[],
        });
      else
        await action.run('role.create', {
          companyId,
          name,
          description,
          permissions: permissions as Permission[],
        });
      onClose();
    } catch {
      /* shown below */
    }
  };

  const remove = async () => {
    if (!role) return;
    try {
      await action.run('role.delete', { companyId, roleId: role.id });
      onClose();
    } catch {
      /* shown below */
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={readOnly ? role!.name : role ? `Edit ${role.name}` : 'New role'}
      description={
        role?.system
          ? 'System roles cannot be changed. Create a custom role to adjust permissions.'
          : undefined
      }
      className="max-w-2xl"
    >
      <form onSubmit={submit} className="space-y-4">
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        {!readOnly && (
          <>
            <Field label="Name" error={action.error?.fields.name}>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Description">
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            {!role && (
              <Field label="Start from" hint="Copies the permissions of an existing role.">
                <Select
                  onChange={(e) =>
                    setPermissions(roles.find((r) => r.id === e.target.value)?.permissions ?? [])
                  }
                  defaultValue=""
                >
                  <option value="">No permissions</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </>
        )}
        <div className="space-y-4">
          {GROUPS.map(([module, perms]) => (
            <fieldset key={module}>
              <legend className="text-sm font-semibold text-slate-800">
                {MODULE_LABELS[module] ?? module}
              </legend>
              <div className="mt-1 grid gap-1 sm:grid-cols-2">
                {perms.map((p) => (
                  <label key={p} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={permissions.includes(p)}
                      onChange={() => toggle(p)}
                      disabled={readOnly}
                    />
                    <code className="text-xs text-slate-700">{p}</code>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        <div className="flex justify-between gap-2">
          <div>
            {role && !readOnly && (
              <Button type="button" variant="danger" onClick={remove} loading={action.pending}>
                Delete role
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" type="button" onClick={onClose}>
              {readOnly ? 'Close' : 'Cancel'}
            </Button>
            {!readOnly && (
              <Button type="submit" loading={action.pending} disabled={name.trim().length < 2}>
                Save role
              </Button>
            )}
          </div>
        </div>
      </form>
    </Dialog>
  );
}

export default function Roles() {
  const { companyId, can } = useCompany();
  const roles = useRoles(companyId);
  const [open, setOpen] = useState<RoleRow | 'new' | null>(null);
  const canManage = can('company.roles.manage');
  const sorted = [...roles.data].sort(
    (a, b) => Number(b.system) - Number(a.system) || a.name.localeCompare(b.name),
  );

  return (
    <>
      <PageHeader
        title="Roles"
        description="Roles group permissions. The server checks them on every action."
        actions={
          canManage && (
            <Button onClick={() => setOpen('new')}>
              <Plus className="size-4" aria-hidden /> New role
            </Button>
          )
        }
      />
      {roles.loading ? (
        <Spinner />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((r) => (
            <Card key={r.id} className="flex flex-col p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">{r.name}</h2>
                <Badge tone={r.system ? 'blue' : 'slate'}>{r.system ? 'System' : 'Custom'}</Badge>
              </div>
              <p className="mt-1 flex-1 text-sm text-slate-500">{r.description}</p>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-slate-500">{r.permissions.length} permissions</span>
                <Button size="sm" variant="ghost" onClick={() => setOpen(r)}>
                  {r.system || !canManage ? 'View' : 'Edit'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {open && (
        <RoleDialog
          role={open === 'new' ? null : open}
          roles={roles.data}
          canManage={canManage}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
