import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input, Select } from '../../components/ui/form';
import { TBody, THead, Table, Td, Th, Tr } from '../../components/ui/table';
import { useCompany } from '../../lib/company';
import { suggestBankCode, useAccounts, type AccountRow } from '../../lib/ledger';
import { useAction } from '../../lib/useAction';

/** The heading the company's cash and bank accounts sit under, such as 1100 Cash and bank. */
function defaultParent(accounts: readonly AccountRow[]): string {
  const sibling = accounts.find(
    (a) => (a.subtype === 'bank' || a.subtype === 'cash') && a.parentId,
  );
  return sibling?.parentId ?? '';
}

function BankAccountDialog({
  mode,
  accounts,
  onClose,
}: {
  /** new: creates its ledger account. link: adds details to an existing Bank account. edit. */
  mode:
    { kind: 'new' } | { kind: 'link'; account: AccountRow } | { kind: 'edit'; account: AccountRow };
  accounts: AccountRow[];
  onClose: () => void;
}) {
  const { companyId, company } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const action = useAction();
  const existing = mode.kind === 'new' ? null : mode.account;
  const [bankName, setBankName] = useState(existing?.bank?.bankName ?? '');
  const [accountName, setAccountName] = useState(
    existing?.bank?.accountName ?? company?.legalName ?? '',
  );
  const [accountNumber, setAccountNumber] = useState(existing?.bank?.accountNumber ?? '');
  const [code, setCode] = useState(() => suggestBankCode(accounts));
  const [ledgerName, setLedgerName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [parentId, setParentId] = useState(() => defaultParent(accounts));
  const headings = accounts.filter((a) => !a.isPostable && a.type === 'asset');
  const digits = accountNumber.replace(/[\s-]/g, '');
  const suggestedName = bankName.trim()
    ? `${bankName.trim()}${digits.length >= 4 ? ` ${digits.slice(-4)}` : ''}`
    : '';
  const glName = nameTouched ? ledgerName : suggestedName;
  const f = action.error?.fields ?? {};

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (mode.kind === 'edit') {
        await action.run('bankAccount.update', {
          companyId,
          accountId: mode.account.id,
          bankName,
          accountName,
          accountNumber,
        });
      } else {
        await action.run('bankAccount.create', {
          companyId,
          bankName,
          accountName,
          accountNumber,
          currency,
          ledger:
            mode.kind === 'link'
              ? { mode: 'existing', accountId: mode.account.id }
              : { mode: 'new', code, name: glName, parentId: parentId || null },
        });
      }
      onClose();
    } catch {
      /* shown below */
    }
  };

  const title =
    mode.kind === 'new'
      ? 'New bank account'
      : mode.kind === 'link'
        ? `Bank details for ${mode.account.code} ${mode.account.name}`
        : `Edit ${mode.account.code} ${mode.account.name}`;

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={
        mode.kind === 'new'
          ? 'Creates a Bank account in the chart of accounts to record this account’s money.'
          : undefined
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        <Field label="Bank" error={f.bankName}>
          <Input
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            maxLength={80}
            placeholder="e.g. GTBank"
          />
        </Field>
        <Field label="Account name" hint="As printed on the bank statement" error={f.accountName}>
          <Input
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            maxLength={120}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Account number" error={f.accountNumber} className="sm:col-span-2">
            <Input
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              maxLength={40}
              inputMode="numeric"
              autoComplete="off"
            />
          </Field>
          <Field label="Currency" hint="The company’s currency" error={f.currency}>
            <Input value={currency} disabled />
          </Field>
        </div>
        {mode.kind === 'new' && (
          <fieldset className="space-y-4 rounded-md border border-slate-200 p-4">
            <legend className="px-1 text-sm font-medium text-slate-700">Ledger account</legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Code" error={f['ledger.code']}>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  maxLength={13}
                />
              </Field>
              <Field label="Name" error={f['ledger.name']} className="sm:col-span-2">
                <Input
                  value={glName}
                  onChange={(e) => {
                    setNameTouched(true);
                    setLedgerName(e.target.value);
                  }}
                  maxLength={120}
                />
              </Field>
            </div>
            <Field label="Under heading" error={f['ledger.parentId']}>
              <Select value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">None (top level)</option>
                {headings.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.code} · {h.name}
                  </option>
                ))}
              </Select>
            </Field>
          </fieldset>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={action.pending}
            disabled={
              bankName.trim().length < 2 ||
              accountName.trim().length < 2 ||
              digits.length < 4 ||
              (mode.kind === 'new' && (!code || glName.trim().length < 2))
            }
          >
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function BankAccounts() {
  const { companyId, can } = useCompany();
  const accounts = useAccounts(companyId);
  const toggle = useAction();
  const [dialog, setDialog] = useState<
    | { kind: 'new' }
    | { kind: 'link'; account: AccountRow }
    | { kind: 'edit'; account: AccountRow }
    | null
  >(null);
  const canManage = can('ledger.accounts.manage');
  const banks = accounts.data.filter((a) => a.isPostable && a.subtype === 'bank');
  const hasChart = accounts.data.length > 0;

  return (
    <>
      <PageHeader
        title="Bank accounts"
        description="The company’s accounts at its banks. Active accounts can be chosen when paying suppliers, taking customer receipts, refunding and at the till, and every one can be reconciled."
        actions={
          canManage &&
          hasChart && (
            <Button onClick={() => setDialog({ kind: 'new' })}>
              <Plus className="size-4" aria-hidden /> New bank account
            </Button>
          )
        }
      />
      {toggle.error && (
        <Alert tone="error" className="mb-4">
          {toggle.error.message}
        </Alert>
      )}
      {accounts.loading ? (
        <Spinner />
      ) : !hasChart ? (
        <EmptyState
          title="No chart of accounts yet"
          description="Set up the chart of accounts first; bank accounts are kept on it."
          action={
            <Link
              className="text-sm font-medium text-brand-700 underline"
              to={`/c/${companyId}/accounts`}
            >
              Go to the chart of accounts
            </Link>
          }
        />
      ) : banks.length === 0 ? (
        <EmptyState
          title="No bank accounts yet"
          description="Add each account the company holds at a bank."
          action={
            canManage && (
              <Button onClick={() => setDialog({ kind: 'new' })}>
                <Plus className="size-4" aria-hidden /> New bank account
              </Button>
            )
          }
        />
      ) : (
        <Card>
          <Table label="Bank accounts">
            <THead>
              <Tr>
                <Th>Bank</Th>
                <Th>Account number</Th>
                <Th>Ledger account</Th>
                <Th>Status</Th>
                {canManage && <Th className="text-right">Actions</Th>}
              </Tr>
            </THead>
            <TBody>
              {banks.map((a) => (
                <Tr key={a.id}>
                  <Td>
                    {a.bank ? (
                      <>
                        <div className="font-medium text-slate-900">{a.bank.bankName}</div>
                        <div className="text-xs text-slate-500">{a.bank.accountName}</div>
                      </>
                    ) : (
                      <Badge tone="amber">Details missing</Badge>
                    )}
                  </Td>
                  <Td>
                    {a.bank ? (
                      <>
                        <span className="font-mono">{a.bank.accountNumber}</span>{' '}
                        <span className="text-xs text-slate-500">{a.bank.currency}</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td>
                    <span className="font-mono">{a.code}</span> {a.name}
                  </Td>
                  <Td>
                    <Badge tone={a.status === 'active' ? 'green' : 'slate'}>{a.status}</Badge>
                  </Td>
                  {canManage && (
                    <Td className="whitespace-nowrap text-right">
                      {a.bank ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDialog({ kind: 'edit', account: a })}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              void toggle
                                .run('bankAccount.update', {
                                  companyId,
                                  accountId: a.id,
                                  status: a.status === 'active' ? 'inactive' : 'active',
                                })
                                .catch(() => undefined)
                            }
                          >
                            {a.status === 'active' ? 'Deactivate' : 'Activate'}
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDialog({ kind: 'link', account: a })}
                        >
                          Add bank details
                        </Button>
                      )}
                    </Td>
                  )}
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
      {dialog && (
        <BankAccountDialog mode={dialog} accounts={accounts.data} onClose={() => setDialog(null)} />
      )}
    </>
  );
}
