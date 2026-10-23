import { Plus } from 'lucide-react';
import { useState } from 'react';
import {
  ACCOUNT_TYPES,
  SUBTYPES_BY_TYPE,
  type AccountSubtype,
  type AccountType,
} from '@bms/domain';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input, Select } from '../../components/ui/form';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { SUBTYPE_LABEL, TYPE_LABEL, useAccounts, type AccountRow } from '../../lib/ledger';
import { useAction } from '../../lib/useAction';

function AccountDialog({
  account,
  accounts,
  onClose,
}: {
  account: AccountRow | null;
  accounts: AccountRow[];
  onClose: () => void;
}) {
  const { companyId } = useCompany();
  const action = useAction();
  const [code, setCode] = useState(account?.code ?? '');
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? 'expense');
  const [subtype, setSubtype] = useState<AccountSubtype>(account?.subtype ?? 'general');
  const [isPostable, setIsPostable] = useState(account?.isPostable ?? true);
  const [parentId, setParentId] = useState(account?.parentId ?? '');
  const headings = accounts.filter((a) => !a.isPostable && a.type === type && a.id !== account?.id);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (account) {
        await action.run('account.update', {
          companyId,
          accountId: account.id,
          name,
          parentId: parentId || null,
        });
      } else {
        await action.run('account.create', {
          companyId,
          code,
          name,
          type,
          subtype: isPostable ? subtype : 'general',
          isPostable,
          parentId: parentId || null,
        });
      }
      onClose();
    } catch {
      /* shown below */
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={account ? `Edit ${account.code} ${account.name}` : 'New account'}
      description={
        account ? 'The code, type and role are fixed once an account exists.' : undefined
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Code" error={action.error?.fields.code}>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={!!account}
              inputMode="numeric"
              maxLength={13}
            />
          </Field>
          <Field label="Name" error={action.error?.fields.name} className="sm:col-span-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </Field>
        </div>
        {!account && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Type">
                <Select
                  value={type}
                  onChange={(e) => {
                    setType(e.target.value as AccountType);
                    setSubtype('general');
                    setParentId('');
                  }}
                >
                  {ACCOUNT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABEL[t]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Kind">
                <Select
                  value={isPostable ? 'account' : 'heading'}
                  onChange={(e) => setIsPostable(e.target.value === 'account')}
                >
                  <option value="account">Account (takes postings)</option>
                  <option value="heading">Heading (groups accounts)</option>
                </Select>
              </Field>
            </div>
            {isPostable && (
              <Field
                label="Role"
                hint="Tells the system what the account is for. Most accounts are General."
                error={action.error?.fields.subtype}
              >
                <Select
                  value={subtype}
                  onChange={(e) => setSubtype(e.target.value as AccountSubtype)}
                >
                  {SUBTYPES_BY_TYPE[type].map((s) => (
                    <option key={s} value={s}>
                      {SUBTYPE_LABEL[s]}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </>
        )}
        <Field label="Under heading" error={action.error?.fields.parentId}>
          <Select value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">None (top level)</option>
            {headings.map((h) => (
              <option key={h.id} value={h.id}>
                {h.code} · {h.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={action.pending} disabled={!code || name.trim().length < 2}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function Accounts() {
  const { companyId, can } = useCompany();
  const accounts = useAccounts(companyId);
  const toggle = useAction();
  const apply = useAction();
  const [editing, setEditing] = useState<AccountRow | 'new' | null>(null);
  const canManage = can('ledger.accounts.manage');

  return (
    <>
      <PageHeader
        title="Chart of accounts"
        description="Headings group accounts for reports. Control accounts only take postings from their own module."
        actions={
          canManage &&
          accounts.data.length > 0 && (
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" aria-hidden /> New account
            </Button>
          )
        }
      />
      {(toggle.error ?? apply.error) && (
        <Alert tone="error" className="mb-4">
          {(toggle.error ?? apply.error)!.message}
        </Alert>
      )}
      {accounts.loading ? (
        <Spinner />
      ) : accounts.data.length === 0 ? (
        <EmptyState
          title="No accounts yet"
          description="Start from the trading company template, then adapt it."
          action={
            canManage && (
              <Button
                loading={apply.pending}
                onClick={() =>
                  void apply
                    .run('chart.applyTemplate', { companyId, templateId: 'trading' })
                    .catch(() => undefined)
                }
              >
                Use the trading template
              </Button>
            )
          }
        />
      ) : (
        <Card>
          <Table label="Chart of accounts">
            <THead>
              <Tr>
                <Th>Code</Th>
                <Th>Name</Th>
                <Th>Type</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                {canManage && <Th className="text-right">Actions</Th>}
              </Tr>
            </THead>
            <TBody>
              {accounts.data.map((a) => (
                <Tr key={a.id}>
                  <Td className="font-mono">{a.code}</Td>
                  <Td>
                    <span
                      style={{ paddingLeft: `${a.depth * 1.25}rem` }}
                      className={a.isPostable ? '' : 'font-semibold text-slate-900'}
                    >
                      {a.name}
                    </span>{' '}
                    {!a.isPostable && <Badge>Heading</Badge>}{' '}
                    {a.isControl && <Badge tone="blue">Control</Badge>}
                  </Td>
                  <Td>{TYPE_LABEL[a.type]}</Td>
                  <Td>{a.isPostable ? SUBTYPE_LABEL[a.subtype] : '—'}</Td>
                  <Td>
                    <Badge tone={a.status === 'active' ? 'green' : 'slate'}>{a.status}</Badge>
                  </Td>
                  {canManage && (
                    <Td className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(a)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void toggle
                            .run('account.update', {
                              companyId,
                              accountId: a.id,
                              status: a.status === 'active' ? 'inactive' : 'active',
                            })
                            .catch(() => undefined)
                        }
                      >
                        {a.status === 'active' ? 'Deactivate' : 'Activate'}
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
        <AccountDialog
          account={editing === 'new' ? null : editing}
          accounts={accounts.data}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
