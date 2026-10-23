import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import type { z } from 'zod';
import { SUPPORTED_CURRENCY_CODES } from '@bms/domain';
import { createCompanyInput } from '@bms/schemas';
import { Button } from '../components/ui/button';
import { Alert, Card, PageHeader } from '../components/ui/feedback';
import { Field, Input, Select } from '../components/ui/form';
import { ApiError, runCommand } from '../lib/api';
import { TopBar } from './TopBar';

const schema = createCompanyInput.omit({ idempotencyKey: true });
type FormValues = z.input<typeof schema>;

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function timeZones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['Africa/Lagos', 'UTC'];
  }
}

export default function CreateCompany() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  // One key per form instance, so a double submit or retry cannot create two companies.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      legalName: '',
      tradingName: '',
      country: 'NG',
      baseCurrency: 'NGN',
      timeZone: 'Africa/Lagos',
      fiscalYearStartMonth: 1,
      headOffice: { code: 'HQ', name: 'Head office' },
    },
  });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const payload = schema.parse(values);
      const { companyId } = await runCommand<{ companyId: string }>(
        'company.create',
        payload,
        idempotencyKey,
      );
      navigate(`/c/${companyId}`, { replace: true });
    } catch (e) {
      if (e instanceof ApiError) {
        for (const [field, message] of Object.entries(e.fields))
          form.setError(field as keyof FormValues, { message });
      }
      setError(e instanceof Error ? e.message : 'Could not create the company');
    }
  });

  return (
    <div className="min-h-dvh">
      <TopBar />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <PageHeader
          title="Create a company"
          description="You'll be its Company Admin. You can invite colleagues afterwards."
        />
        <Card className="p-6">
          <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
            {error && (
              <Alert tone="error" className="sm:col-span-2">
                {error}
              </Alert>
            )}
            <Field label="Legal name" error={errors.legalName?.message} className="sm:col-span-2">
              <Input {...form.register('legalName')} />
            </Field>
            <Field
              label="Trading name"
              hint="Optional. Shown in the app and on documents."
              error={errors.tradingName?.message}
              className="sm:col-span-2"
            >
              <Input {...form.register('tradingName')} />
            </Field>
            <Field label="Country code" hint="Two letters, e.g. NG" error={errors.country?.message}>
              <Input maxLength={2} {...form.register('country')} />
            </Field>
            <Field
              label="Base currency"
              hint="Locked once transactions are posted."
              error={errors.baseCurrency?.message}
            >
              <Select {...form.register('baseCurrency')}>
                {SUPPORTED_CURRENCY_CODES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Time zone" error={errors.timeZone?.message}>
              <Input list="tz-list" {...form.register('timeZone')} />
            </Field>
            <datalist id="tz-list">
              {timeZones().map((tz) => (
                <option key={tz} value={tz} />
              ))}
            </datalist>
            <Field label="Financial year starts in" error={errors.fiscalYearStartMonth?.message}>
              <Select {...form.register('fiscalYearStartMonth', { valueAsNumber: true })}>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Head office code" error={errors.headOffice?.code?.message}>
              <Input {...form.register('headOffice.code')} />
            </Field>
            <Field label="Head office name" error={errors.headOffice?.name?.message}>
              <Input {...form.register('headOffice.name')} />
            </Field>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button variant="secondary" asChild>
                <Link to="/companies">Cancel</Link>
              </Button>
              <Button type="submit" loading={form.formState.isSubmitting}>
                Create company
              </Button>
            </div>
          </form>
        </Card>
      </main>
    </div>
  );
}
