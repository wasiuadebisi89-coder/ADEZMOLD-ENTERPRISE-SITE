import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { mulRatio } from '@bms/domain';
import { BackdateNotice, useBackdate, useToday } from '../../components/BackdateNotice';
import { Button } from '../../components/ui/button';
import { Alert, Card, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input, Select } from '../../components/ui/form';
import { useCompany } from '../../lib/company';
import { money, tryParseMoney, useAccounts, type AccountRow } from '../../lib/ledger';
import { useAction } from '../../lib/useAction';
import { usePostingBranches } from './NewJournal';

type Kind = 'purchase' | 'opening';

const active = (a: AccountRow) => a.status === 'active' && a.isPostable;

function AccountSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: AccountRow[];
  onChange: (id: string) => void;
}) {
  return (
    <Field label={label}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((a) => (
          <option key={a.id} value={a.id}>
            {a.code} · {a.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export default function NewFixedAsset() {
  const { companyId, company } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const navigate = useNavigate();
  const today = useToday();
  const accounts = useAccounts(companyId);
  const branches = usePostingBranches();
  const action = useAction();
  const [kind, setKind] = useState<Kind>('purchase');
  const [name, setName] = useState('');
  const [branchId, setBranchId] = useState('');
  const [assetAccountId, setAssetAccountId] = useState('');
  const [accumulatedAccountId, setAccumulatedAccountId] = useState('');
  const [expenseAccountId, setExpenseAccountId] = useState('');
  const [creditAccountId, setCreditAccountId] = useState('');
  const [cost, setCost] = useState('');
  const [residual, setResidual] = useState('');
  const [life, setLife] = useState('');
  const [date, setDate] = useState(today);
  const [inUse, setInUse] = useState(today);
  const [accumulatedToDate, setAccumulatedToDate] = useState('');
  const [monthsDepreciated, setMonthsDepreciated] = useState('');
  const [reference, setReference] = useState('');
  const backdate = useBackdate(date);

  if (accounts.loading || branches.loading) return <Spinner />;
  const list = accounts.data.filter(active);
  const assetAccounts = list.filter((a) => a.subtype === 'fixedAsset');
  const accumulatedAccounts = list.filter((a) => a.subtype === 'accumDepreciation');
  const expenseAccounts = list.filter((a) => a.subtype === 'depreciation');
  const paidFrom = list.filter(
    (a) =>
      a.subtype === 'cash' ||
      a.subtype === 'bank' ||
      ((a.type === 'liability' || a.type === 'equity') && a.subtype === 'general'),
  );
  const pick = (chosen: string, options: AccountRow[]) => chosen || options[0]?.id || '';
  const ids = {
    asset: pick(assetAccountId, assetAccounts),
    accumulated: pick(accumulatedAccountId, accumulatedAccounts),
    expense: pick(expenseAccountId, expenseAccounts),
    credit: pick(creditAccountId, paidFrom),
  };
  const branch = branchId || branches.data[0]?.id || '';
  const costMinor = tryParseMoney(cost, currency);
  const residualMinor = tryParseMoney(residual, currency);
  const lifeMonths = /^\d+$/.test(life) ? Number(life) : null;
  const baseMinor = kind === 'opening' ? tryParseMoney(accumulatedToDate, currency) : 0n;
  const baseMonths =
    kind === 'opening' ? (/^\d+$/.test(monthsDepreciated) ? Number(monthsDepreciated) : null) : 0;
  const monthly =
    costMinor !== null &&
    residualMinor !== null &&
    baseMinor !== null &&
    lifeMonths !== null &&
    baseMonths !== null &&
    lifeMonths > baseMonths &&
    costMinor - residualMinor - baseMinor >= 0n
      ? mulRatio(costMinor - residualMinor - baseMinor, 1n, BigInt(lifeMonths - baseMonths))
      : null;
  const complete =
    name.trim().length >= 2 &&
    !!branch &&
    !!ids.asset &&
    !!ids.accumulated &&
    !!ids.expense &&
    (kind === 'opening' || !!ids.credit) &&
    costMinor !== null &&
    costMinor > 0n &&
    residualMinor !== null &&
    lifeMonths !== null &&
    lifeMonths > 0 &&
    baseMinor !== null &&
    baseMonths !== null &&
    (!backdate.needsApproval || !!backdate.approvalId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const common = {
      companyId,
      name,
      branchId: branch,
      assetAccountId: ids.asset,
      accumulatedAccountId: ids.accumulated,
      expenseAccountId: ids.expense,
      cost,
      residual,
      usefulLifeMonths: lifeMonths,
      availableForUseDate: inUse,
      ...(reference.trim() ? { reference: reference.trim() } : {}),
      ...(backdate.approvalId ? { backdateApprovalId: backdate.approvalId } : {}),
    };
    try {
      const res = await action.run<{ assetId: string }>(
        'fixedAsset.create',
        kind === 'purchase'
          ? { ...common, acquisition: 'purchase', acquiredDate: date, creditAccountId: ids.credit }
          : {
              ...common,
              acquisition: 'opening',
              asAtDate: date,
              accumulatedToDate,
              monthsDepreciated: baseMonths,
            },
      );
      void navigate(`/c/${companyId}/fixed-assets/${res.assetId}`);
    } catch {
      /* shown below */
    }
  };

  const f = action.error?.fields ?? {};
  return (
    <>
      <PageHeader
        title="Add fixed asset"
        description="Depreciation is charged for a full month when the asset is in use by the 15th, otherwise from the next month."
        actions={
          <Button variant="secondary" asChild>
            <Link to={`/c/${companyId}/fixed-assets`}>Cancel</Link>
          </Button>
        }
      />
      <form onSubmit={submit} className="space-y-4" noValidate>
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        <Card className="space-y-4 p-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">How it comes in</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="kind"
                  checked={kind === 'purchase'}
                  onChange={() => setKind('purchase')}
                />
                Bought now
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="kind"
                  checked={kind === 'opening'}
                  onChange={() => setKind('opening')}
                />
                Already owned when we started using this system
              </label>
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Asset name" error={f.name}>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            </Field>
            <AccountSelect
              label="Asset account"
              value={ids.asset}
              options={assetAccounts}
              onChange={setAssetAccountId}
            />
            <Field label="Branch">
              <Select value={branch} onChange={(e) => setBranchId(e.target.value)}>
                {branches.data.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Cost" error={f.cost}>
              <Input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
            </Field>
            <Field
              label="Residual value"
              hint="What it should be worth at the end of its life."
              error={f.residual}
            >
              <Input
                inputMode="decimal"
                value={residual}
                onChange={(e) => setResidual(e.target.value)}
              />
            </Field>
            <Field label="Useful life in months" error={f.usefulLifeMonths}>
              <Input inputMode="numeric" value={life} onChange={(e) => setLife(e.target.value)} />
            </Field>
            <Field
              label={kind === 'purchase' ? 'Date bought' : 'Balances as at'}
              error={f.acquiredDate ?? f.asAtDate}
            >
              <Input
                type="date"
                value={date}
                max={today}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field label="In use from" error={f.availableForUseDate}>
              <Input type="date" value={inUse} onChange={(e) => setInUse(e.target.value)} />
            </Field>
            {kind === 'purchase' ? (
              <AccountSelect
                label="Paid from"
                value={ids.credit}
                options={paidFrom}
                onChange={setCreditAccountId}
              />
            ) : (
              <>
                <Field label="Depreciation to date" error={f.accumulatedToDate}>
                  <Input
                    inputMode="decimal"
                    value={accumulatedToDate}
                    onChange={(e) => setAccumulatedToDate(e.target.value)}
                  />
                </Field>
                <Field label="Months already depreciated" error={f.monthsDepreciated}>
                  <Input
                    inputMode="numeric"
                    value={monthsDepreciated}
                    onChange={(e) => setMonthsDepreciated(e.target.value)}
                  />
                </Field>
              </>
            )}
            <AccountSelect
              label="Accumulated depreciation account"
              value={ids.accumulated}
              options={accumulatedAccounts}
              onChange={setAccumulatedAccountId}
            />
            <AccountSelect
              label="Depreciation expense account"
              value={ids.expense}
              options={expenseAccounts}
              onChange={setExpenseAccountId}
            />
            <Field label="Reference (optional)">
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                maxLength={60}
              />
            </Field>
          </div>
          <BackdateNotice date={date} state={backdate} />
        </Card>
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:justify-end">
          {monthly !== null && (
            <p className="text-sm text-slate-600" role="status" data-testid="fa-monthly">
              About {money(monthly, currency)} a month.
            </p>
          )}
          <Button type="submit" loading={action.pending} disabled={!complete}>
            {kind === 'purchase' ? 'Post purchase' : 'Bring in asset'}
          </Button>
        </div>
      </form>
    </>
  );
}
