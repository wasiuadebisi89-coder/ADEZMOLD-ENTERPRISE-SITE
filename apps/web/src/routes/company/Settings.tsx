import { doc } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { SUPPORTED_CURRENCY_CODES } from '@bms/domain';
import { BUSINESS_TYPES } from '@bms/schemas';
import { Button } from '../../components/ui/button';
import { Alert, Card, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input, Select } from '../../components/ui/form';
import { BusinessTypePicker } from '../../components/BusinessTypes';
import { useCompany, type Company } from '../../lib/company';
import { businessTypesOf } from '../../lib/modules';
import { db } from '../../lib/firebase';
import { useDoc } from '../../lib/firestore-hooks';
import { useAction } from '../../lib/useAction';
import { SUPPORT } from '../../lib/support';
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
      <Field label="Legal name" hint={`To change the legal name, contact ${SUPPORT.email}.`}>
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

/** What the business does, which decides whether Projects and Production show in the menu. */
function BusinessTypesForm({ company, canEdit }: { company: Company; canEdit: boolean }) {
  const { companyId } = useCompany();
  const action = useAction();
  const [saved, setSaved] = useState(false);
  const [types, setTypes] = useState<string[]>(() => [...businessTypesOf(company)]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await action.run('company.updateSettings', {
        companyId,
        businessTypes: BUSINESS_TYPES.filter((t) => types.includes(t)),
      });
      setSaved(true);
    } catch {
      /* shown below */
    }
  };
  return (
    <form onSubmit={submit} className="grid gap-4 p-6" noValidate>
      <div>
        <h2 className="text-base font-semibold text-slate-900">What the business does</h2>
        <p className="text-sm text-slate-500">
          Keeps the menu short: areas the business doesn’t use are hidden for everyone. Turning an
          area off hides it from the menu only; nothing recorded there is deleted.
        </p>
      </div>
      {action.error && <Alert tone="error">{action.error.message}</Alert>}
      {saved && <Alert tone="success">Saved. The menu has been updated.</Alert>}
      <BusinessTypePicker
        value={types}
        onChange={(next) => {
          setSaved(false);
          setTypes(next);
        }}
        disabled={!canEdit}
      />
      {canEdit && (
        <div className="flex justify-end">
          <Button type="submit" loading={action.pending}>
            Save
          </Button>
        </div>
      )}
    </form>
  );
}

const CONTACT_FIELDS = [
  { key: 'address', label: 'Address', hint: 'Printed when a branch has no address of its own.' },
  { key: 'phone', label: 'Phone', hint: undefined },
  { key: 'email', label: 'Email', hint: undefined },
  { key: 'rcNumber', label: 'RC number', hint: 'CAC registration, for example RC 1445936.' },
  { key: 'taxId', label: 'TIN', hint: 'Tax identification number.' },
] as const;

/** Address, phone, email, RC and TIN printed on receipts, invoices and reports. */
function DocumentDetailsForm({ company, canEdit }: { company: Company; canEdit: boolean }) {
  const { companyId } = useCompany();
  const action = useAction();
  const [saved, setSaved] = useState(false);
  const [values, setValues] = useState({
    address: company.contact?.address ?? '',
    phone: company.contact?.phone ?? '',
    email: company.contact?.email ?? '',
    rcNumber: company.contact?.rcNumber ?? '',
    taxId: company.contact?.taxId ?? '',
  });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await action.run('company.updateSettings', { companyId, contact: values });
      setSaved(true);
    } catch {
      /* shown below */
    }
  };
  const f = action.error?.fields ?? {};
  return (
    <form onSubmit={submit} className="grid gap-4 p-6 sm:grid-cols-2" noValidate>
      <div className="sm:col-span-2">
        <h2 className="text-base font-semibold text-slate-900">Details on documents</h2>
        <p className="text-sm text-slate-500">
          Shown at the top of receipts, invoices, vouchers and printed reports.
        </p>
      </div>
      {action.error && (
        <Alert tone="error" className="sm:col-span-2">
          {action.error.message}
        </Alert>
      )}
      {saved && (
        <Alert tone="success" className="sm:col-span-2">
          Details saved.
        </Alert>
      )}
      {CONTACT_FIELDS.map(({ key, label, hint }) => (
        <Field
          key={key}
          label={label}
          hint={hint}
          error={f[`contact.${key}`] ?? f[key]}
          className={key === 'address' ? 'sm:col-span-2' : undefined}
        >
          <Input
            type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'}
            value={values[key]}
            onChange={(e) => {
              setSaved(false);
              setValues((s) => ({ ...s, [key]: e.target.value }));
            }}
            disabled={!canEdit}
          />
        </Field>
      ))}
      {canEdit && (
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" loading={action.pending}>
            Save details
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
      {company && (
        <Card className="mt-6">
          <BusinessTypesForm company={company} canEdit={can('company.settings.update')} />
        </Card>
      )}
      {company && (
        <Card className="mt-6">
          <DocumentDetailsForm company={company} canEdit={can('company.settings.update')} />
        </Card>
      )}
    </>
  );
}
