import { collection, orderBy, query, where } from 'firebase/firestore';
import { Copy, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input, Textarea } from '../../components/ui/form';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany, type Member } from '../../lib/company';
import { db } from '../../lib/firebase';
import { useCollection } from '../../lib/firestore-hooks';
import { useAction } from '../../lib/useAction';
import { formatDateTime } from '../../lib/utils';

export interface RoleRow {
  id: string;
  name: string;
  description: string;
  system: boolean;
  permissions: string[];
}
interface BranchRow {
  id: string;
  code: string;
  name: string;
  status: string;
}
interface InvitationRow {
  id: string;
  email: string;
  roleIds: string[];
  expiresAt: { toDate(): Date };
}

export function useRoles(companyId: string) {
  const q = useMemo(() => collection(db, `companies/${companyId}/roles`), [companyId]);
  return useCollection<Omit<RoleRow, 'id'>>(q, `roles-${companyId}`);
}

export function useBranches(companyId: string) {
  const q = useMemo(() => collection(db, `companies/${companyId}/branches`), [companyId]);
  return useCollection<Omit<BranchRow, 'id'>>(q, `branches-all-${companyId}`);
}

const STATUS_TONE = { active: 'green', suspended: 'amber', removed: 'slate' } as const;

/** Role checkboxes plus branch scope, shared by the invite and edit dialogs. */
function AccessFields({
  roles,
  branches,
  roleIds,
  setRoleIds,
  scope,
  setScope,
}: {
  roles: RoleRow[];
  branches: BranchRow[];
  roleIds: string[];
  setRoleIds: (ids: string[]) => void;
  scope: 'all' | string[];
  setScope: (s: 'all' | string[]) => void;
}) {
  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  return (
    <>
      <fieldset>
        <legend className="text-sm font-medium text-slate-800">Roles</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {roles.map((r) => (
            <label
              key={r.id}
              className="flex items-start gap-2 rounded-md border border-slate-200 p-2 text-sm"
            >
              <input
                type="checkbox"
                className="mt-0.5"
                checked={roleIds.includes(r.id)}
                onChange={() => setRoleIds(toggle(roleIds, r.id))}
              />
              <span>
                <span className="font-medium">{r.name}</span>
                <span className="block text-xs text-slate-500">{r.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-medium text-slate-800">Branch access</legend>
        <div className="mt-2 space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="scope"
              checked={scope === 'all'}
              onChange={() => setScope('all')}
            />{' '}
            All branches
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="scope"
              checked={scope !== 'all'}
              onChange={() => setScope([])}
            />{' '}
            Selected branches
          </label>
          {scope !== 'all' && (
            <div className="ml-6 grid gap-1">
              {branches
                .filter((b) => b.status === 'active')
                .map((b) => (
                  <label key={b.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={scope.includes(b.id)}
                      onChange={() => setScope(toggle(scope, b.id))}
                    />
                    {b.name} <span className="text-slate-400">({b.code})</span>
                  </label>
                ))}
            </div>
          )}
        </div>
      </fieldset>
    </>
  );
}

function InviteDialog({
  open,
  onOpenChange,
  roles,
  branches,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  roles: RoleRow[];
  branches: BranchRow[];
}) {
  const { companyId } = useCompany();
  const action = useAction();
  const [email, setEmail] = useState('');
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [scope, setScope] = useState<'all' | string[]>('all');
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const close = (o: boolean) => {
    if (!o) {
      setEmail('');
      setRoleIds([]);
      setScope('all');
      setLink(null);
      setCopied(false);
      action.reset();
    }
    onOpenChange(o);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await action.run<{ invitationId: string; token: string }>('invitation.create', {
        companyId,
        email,
        roleIds,
        branchScope: scope,
      });
      setLink(`${window.location.origin}/invite/${res.invitationId}?token=${res.token}`);
    } catch {
      /* shown below */
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Invite a user"
      description="They'll join with the roles you choose here."
    >
      {link ? (
        <div className="space-y-4">
          <Alert tone="success">
            Invitation created. Send this link to {email}. It works once and expires in 7 days.
          </Alert>
          <div className="flex gap-2">
            <Input
              readOnly
              value={link}
              aria-label="Invitation link"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              variant="secondary"
              onClick={() => void navigator.clipboard?.writeText(link).then(() => setCopied(true))}
              aria-label="Copy invitation link"
            >
              <Copy className="size-4" aria-hidden /> {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            This link is shown only once. Anyone with the link and access to that email can join.
          </p>
          <div className="flex justify-end">
            <Button onClick={() => close(false)}>Done</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {action.error && <Alert tone="error">{action.error.message}</Alert>}
          <Field label="Email" error={action.error?.fields.email}>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
            />
          </Field>
          <AccessFields
            roles={roles}
            branches={branches}
            roleIds={roleIds}
            setRoleIds={setRoleIds}
            scope={scope}
            setScope={setScope}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={action.pending}
              disabled={!email || roleIds.length === 0 || (scope !== 'all' && scope.length === 0)}
            >
              Create invitation
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function EditMemberDialog({
  member,
  onClose,
  roles,
  branches,
}: {
  member: Member;
  onClose: () => void;
  roles: RoleRow[];
  branches: BranchRow[];
}) {
  const { companyId } = useCompany();
  const action = useAction();
  const [roleIds, setRoleIds] = useState(member.roleIds);
  const [scope, setScope] = useState<'all' | string[]>(member.branchScope);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await action.run('member.update', {
        companyId,
        uid: member.uid,
        roleIds,
        branchScope: scope,
      });
      onClose();
    } catch {
      /* shown below */
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Edit ${member.displayName}`}
      description={member.email}
    >
      <form onSubmit={submit} className="space-y-4">
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        <AccessFields
          roles={roles}
          branches={branches}
          roleIds={roleIds}
          setRoleIds={setRoleIds}
          scope={scope}
          setScope={setScope}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={action.pending}
            disabled={roleIds.length === 0 || (scope !== 'all' && scope.length === 0)}
          >
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function StatusDialog({
  member,
  status,
  onClose,
}: {
  member: Member;
  status: 'active' | 'suspended' | 'removed';
  onClose: () => void;
}) {
  const { companyId } = useCompany();
  const action = useAction();
  const [reason, setReason] = useState('');
  const verb = { active: 'Reactivate', suspended: 'Suspend', removed: 'Remove' }[status];
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await action.run('member.setStatus', { companyId, uid: member.uid, status, reason });
      onClose();
    } catch {
      /* shown below */
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${verb} ${member.displayName}?`}
      description={
        status === 'removed'
          ? 'They lose access immediately. To return they need a new invitation.'
          : status === 'suspended'
            ? 'They lose access immediately until reactivated.'
            : 'They regain access with their current roles.'
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        <Field label="Reason" hint="Recorded in the audit log." error={action.error?.fields.reason}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant={status === 'active' ? 'primary' : 'danger'}
            loading={action.pending}
            disabled={reason.trim().length < 3}
          >
            {verb}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function Members() {
  const { companyId, can, member: me } = useCompany();
  const membersQuery = useMemo(
    () => query(collection(db, `companies/${companyId}/members`), orderBy('displayName')),
    [companyId],
  );
  const members = useCollection<Omit<Member, 'id'>>(membersQuery, `members-list-${companyId}`);
  const roles = useRoles(companyId);
  const branches = useBranches(companyId);
  const canInvite = can('company.members.invite');
  const canManage = can('company.members.manage');
  const invitesQuery = useMemo(
    () =>
      canInvite
        ? query(
            collection(db, 'invitations'),
            where('companyId', '==', companyId),
            where('status', '==', 'pending'),
            orderBy('createdAt', 'desc'),
          )
        : null,
    [companyId, canInvite],
  );
  const invites = useCollection<Omit<InvitationRow, 'id'>>(
    invitesQuery,
    `invites-${companyId}-${canInvite}`,
  );
  const revoke = useAction();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [statusChange, setStatusChange] = useState<{
    member: Member;
    status: 'active' | 'suspended' | 'removed';
  } | null>(null);
  const roleName = (id: string) => roles.data.find((r) => r.id === id)?.name ?? id;
  const visible = members.data.filter((m) => m.status !== 'removed');

  return (
    <>
      <PageHeader
        title="Users"
        description="People who can sign in to this company, and what they can do."
        actions={
          canInvite && (
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus className="size-4" aria-hidden /> Invite user
            </Button>
          )
        }
      />
      {members.error && <Alert tone="error">Could not load users.</Alert>}
      <Card>
        {members.loading ? (
          <Spinner />
        ) : (
          <Table label="Users">
            <THead>
              <Tr>
                <Th>Name</Th>
                <Th>Roles</Th>
                <Th>Branches</Th>
                <Th>Status</Th>
                {canManage && <Th className="text-right">Actions</Th>}
              </Tr>
            </THead>
            <TBody>
              {visible.map((m) => (
                <Tr key={m.id}>
                  <Td>
                    <div className="font-medium text-slate-900">{m.displayName}</div>
                    <div className="text-xs text-slate-500">{m.email}</div>
                  </Td>
                  <Td>{m.roleIds.map(roleName).join(', ')}</Td>
                  <Td>{m.branchScope === 'all' ? 'All' : m.branchScope.join(', ')}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[m.status]}>{m.status}</Badge>
                  </Td>
                  {canManage && (
                    <Td className="text-right">
                      {m.uid !== me?.uid && (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setEditing(m)}>
                            Edit
                          </Button>
                          {m.status === 'active' ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setStatusChange({ member: m, status: 'suspended' })}
                            >
                              Suspend
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setStatusChange({ member: m, status: 'active' })}
                            >
                              Reactivate
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-700"
                            onClick={() => setStatusChange({ member: m, status: 'removed' })}
                          >
                            Remove
                          </Button>
                        </div>
                      )}
                    </Td>
                  )}
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {canInvite && (
        <section className="mt-8">
          <h2 className="mb-3 text-base font-semibold">Pending invitations</h2>
          {revoke.error && (
            <Alert tone="error" className="mb-3">
              {revoke.error.message}
            </Alert>
          )}
          {invites.loading ? (
            <Spinner />
          ) : invites.data.length === 0 ? (
            <EmptyState title="No pending invitations" />
          ) : (
            <Card>
              <Table label="Pending invitations">
                <THead>
                  <Tr>
                    <Th>Email</Th>
                    <Th>Roles</Th>
                    <Th>Expires</Th>
                    <Th className="text-right">Actions</Th>
                  </Tr>
                </THead>
                <TBody>
                  {invites.data.map((inv) => (
                    <Tr key={inv.id}>
                      <Td>{inv.email}</Td>
                      <Td>{inv.roleIds.map(roleName).join(', ')}</Td>
                      <Td>{formatDateTime(inv.expiresAt)}</Td>
                      <Td className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            void revoke
                              .run('invitation.revoke', { companyId, invitationId: inv.id })
                              .catch(() => undefined)
                          }
                        >
                          Revoke
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </Card>
          )}
        </section>
      )}

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        roles={roles.data}
        branches={branches.data}
      />
      {editing && (
        <EditMemberDialog
          member={editing}
          onClose={() => setEditing(null)}
          roles={roles.data}
          branches={branches.data}
        />
      )}
      {statusChange && <StatusDialog {...statusChange} onClose={() => setStatusChange(null)} />}
    </>
  );
}
