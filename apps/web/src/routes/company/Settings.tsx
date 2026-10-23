import { doc } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { SUPPORTED_CURRENCY_CODES } from '@bms/domain';
import { Button } from '../../components/ui/button';
import { Alert, Card, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input, Select } from '../../components/ui/form';
import { useCompany, type Company } from '../../lib/company';
import { db } from '../../lib/firebase';
import { useDoc } from '../../lib/firestore-hooks';
import { useAction } from '../../lib/useAction';
import { MONTHS, timeZones } from '../CreateCompany';

interface SettingsDocShape {
  backdateWindowDays: number;
  allowNegativeStock: boolean;
  pricesIncludeTax: boolean;
}

function SettingsForm({
  company,
  settings,
  canEdit,
}: {
  company: Company;
  settings: SettingsDocShape;
  canEdit: boolean;
}) {
  const { companyId } = useCompany();
  const action = useAction();
  const [saved, setSaved] = useState(false);
  const [values, setValues] = useState({
    tradingName: company.tradingName,
    timeZone: company.timeZone,
    baseCurrency: company.baseCurrency,
    fiscalYearStartMonth: company.fiscalYearStartMonth,
    backdateWindowDays: settings.backdateWindowDays,
    costingMethod: company.costingMethod as 'weighted_average' | 'fifo',
    pricesIncludeTax: settings.pricesIncludeTax,
  });
  const set = <K extends keyof typeof values>(k: K, v: (typeof values)[K]) => {
    setSaved(false);
    setValues((s) => ({ ...s, [k]: v }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await action.run('company.updateSettings', { companyId, ...values });
      setSaved(true);
    } catch {
      /* shown below */
    }
  };
  const f = action.error?.fields ?? {};

  return (
    <form onSubmit={submit} className="grid gap-4 p-6 sm:grid-cols-2" noValidate>
      {action.error && (
        <Alert tone="error" className="sm:col-span-2">
          {action.error.message}
        </Alert>
      )}
      {saved && (
        <Alert tone="success" className="sm:col-span-2">
          Settings saved.
        </Alert>
      )}
      <Field label="Legal name" hint="Contact support to change the legal name.">
        <Input value={company.legalName} disabled />
      </Field>
      <Field label="Trading name" error={f.tradingName}>
        <Input
          value={values.tradingName}
          onChange={(e) => set('tradingName', e.target.value)}
          disabled={!canEdit}
        />
      </Field>
      <Field
        label="Base currency"
        hint={
          company.locks.baseCurrency
            ? 'Locked: transactions have been posted.'
            : 'Locked once transactions are posted.'
        }
        error={f.baseCurrency}
      >
        <Select
          value={values.baseCurrency}
          onChange={(e) => set('baseCurrency', e.target.value)}
          disabled={!canEdit || company.locks.baseCurrency}
        >
          {SUPPORTED_CURRENCY_CODES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      </Field>
      <Field label="Time zone" hint="Sets the business date for postings." error={f.timeZone}>
        <Input
          list="tz-list"
          value={values.timeZone}
          onChange={(e) => set('timeZone', e.target.value)}
          disabled={!canEdit}
        />
      </Field>
      <datalist id="tz-list">
        {timeZones().map((tz) => (
          <option key={tz} value={tz} />
        ))}
      </datalist>
      <Field
        label="Financial year starts in"
        hint="Applies to financial years you create from now on."
        error={f.fiscalYearStartMonth}
      >
        <Select
          value={values.fiscalYearStartMonth}
          onChange={(e) => set('fiscalYearStartMonth', Number(e.target.value))}
          disabled={!canEdit || company.locks.fiscalYearStartMonth}
        >
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Backdating window (days)"
        hint="Postings dated earlier than this need approval."
        error={f.backdateWindowDays}
      >
        <Input
          type="number"
          min={0}
          max={366}
          value={values.backdateWindowDays}
          onChange={(e) => set('backdateWindowDays', Number(e.target.value))}
          disabled={!canEdit}
        />
      </Field>
      <Field
        label="Stock costing method"
        hint={
          company.locks.costingMethod
            ? 'Locked: stock has been posted.'
            : 'Choose before the first stock posting; it is locked after that.'
        }
        error={f.costingMethod}
      >
        <Select
          value={values.costingMethod}
          onChange={(e) => set('costingMethod', e.target.value as 'weighted_average' | 'fifo')}
          disabled={!canEdit || company.locks.costingMethod}
        >
          <option value="weighted_average">Weighted average (moving)</option>
          <option value="fifo">FIFO (first in, first out)</option>
        </Select>
      </Field>
      <Field
        label="Sale prices"
        hint="Applies to sales posted from now on. Tax is worked out and rounded on each line."
        error={f.pricesIncludeTax}
      >
        <Select
          value={values.pricesIncludeTax ? 'inclusive' : 'exclusive'}
          onChange={(e) => set('pricesIncludeTax', e.target.value === 'inclusive')}
          disabled={!canEdit}
        >
          <option value="exclusive">Before tax (tax is added)</option>
          <option value="inclusive">Include tax (tax is taken out)</option>
        </Select>
      </Field>
      <div className="self-end">
        <p className="text-sm text-slate-500">
          Negative stock: <strong>{settings.allowNegativeStock ? 'allowed' : 'not allowed'}</strong>
          .
        </p>
      </div>
      {canEdit && (
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" loading={action.pending}>
            Save settings
          </Button>
        </div>
      )}
    </form>
  );
}

export default function Settings() {
  const { companyId, company, can } = useCompany();
  const settingsRef = useMemo(
    () => doc(db, `companies/${companyId}/settings/general`),
    [companyId],
  );
  const settings = useDoc<SettingsDocShape>(settingsRef);
  return (
    <>
      <PageHeader title="Company settings" />
      <Card>
        {settings.loading || !company ? (
          <Spinner />
        ) : settings.data ? (
          <SettingsForm
            company={company}
            settings={settings.data}
            canEdit={can('company.settings.update')}
          />
        ) : (
          <div className="p-6">
            <Alert tone="error">Settings could not be loaded.</Alert>
          </div>
        )}
      </Card>
    </>
  );
}
