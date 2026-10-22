import { useSearchParams } from '../lib/router.jsx';
import { site } from '../config/site.js';
import {
  businessSizes,
  businessTypes,
  challenges,
  contactMethods,
  recordStates,
  serviceOptions,
  timeframes,
} from '../content/forms.js';
import { validateConsultation } from '../lib/validation.js';
import Icon from '../components/Icon.jsx';
import { Card, PageHeader, wrap } from '../components/ui.jsx';
import {
  ErrorSummary,
  Honeypot,
  MarketingConsent,
  PrivacyAck,
  RadioGroup,
  SelectField,
  SubmitButton,
  SubmitFailure,
  TextArea,
  TextField,
  useLeadForm,
} from '../components/form.jsx';
import usePageTitle from '../lib/usePageTitle.js';

const labels = {
  fullName: 'Full name',
  businessName: 'Business name',
  businessType: 'Business type',
  businessSize: 'Business size',
  email: 'Email',
  phone: 'Phone',
  preferredContact: 'Contact method',
  challenge: 'Main challenge',
  recordsState: 'Records',
  timeframe: 'Timeframe',
  service: 'Service',
  additionalInfo: 'Additional information',
  privacyAck: 'Privacy notice',
};

const nextSteps = [
  'We review your request in confidence.',
  'We contact you using the method you chose to arrange a discovery session.',
  'In the session we look at your situation and recommend where to start. There is no obligation to proceed.',
];

function Success({ reference, method }) {
  const how = contactMethods.find((m) => m.value === method)?.label.toLowerCase() ?? 'your preferred method';
  return (
    <Card className="p-space-md md:p-space-lg flex flex-col gap-space-sm" data-testid="consultation-success">
      <div className="w-12 h-12 rounded-xl bg-secondary-container text-on-secondary-container flex items-center justify-center">
        <Icon name="check_circle" className="text-[28px]" />
      </div>
      <h2 tabIndex={-1} className="font-headline-md text-headline-md text-on-surface font-bold" ref={(el) => el?.focus()}>
        Thank you, your request has been received
      </h2>
      {reference && (
        <p className="font-body-md text-body-md text-on-surface">
          Your reference: <strong data-testid="lead-reference" className="font-mono">{reference}</strong>
        </p>
      )}
      <p className="font-body-md text-body-md text-on-surface-variant">
        We will contact you by {how} to arrange your discovery session. Please quote your reference if you call us on{' '}
        <a href={site.contact.phoneHref} className="text-secondary font-semibold underline">
          {site.contact.phoneDisplay}
        </a>
        .
      </p>
    </Card>
  );
}

export default function Consultation() {
  usePageTitle('Book a Consultation');
  const params = useSearchParams();
  const requested = params.get('service');
  const preselected = serviceOptions.some((o) => o.value === requested) ? requested : '';

  const form = useLeadForm({
    endpoint: '/api/consultation',
    validate: validateConsultation,
    initial: {
      fullName: '',
      businessName: '',
      businessType: '',
      businessSize: '',
      email: '',
      phone: '',
      preferredContact: '',
      challenge: '',
      recordsState: '',
      timeframe: '',
      service: preselected,
      additionalInfo: '',
      privacyAck: false,
      marketingConsent: false,
    },
  });

  return (
    <>
      <PageHeader
        icon="event_available"
        eyebrow="Consultation"
        title="Book a confidential discovery session"
        text="Tell us a little about your business. It takes about three minutes, and we will get back to you to arrange a time."
      />
      <section className={`${wrap} pb-space-lg`}>
        <div className="mx-auto w-full max-w-5xl grid gap-space-lg md:grid-cols-[1.4fr_1fr] md:items-start">
          {form.status === 'success' ? (
            <Success reference={form.result?.reference} method={form.values.preferredContact} />
          ) : (
            <Card className="p-space-md md:p-space-lg">
              <form noValidate onSubmit={form.handleSubmit} className="relative flex flex-col gap-space-lg" aria-label="Consultation request">
                <ErrorSummary form={form} labels={labels} />
                {form.status === 'error' && <SubmitFailure kind={form.failure} />}

                <fieldset className="flex flex-col gap-space-md">
                  <legend className="font-headline-sm text-headline-sm text-on-surface font-bold mb-space-sm">About you and your business</legend>
                  <TextField form={form} name="fullName" label="Full name" autoComplete="name" maxLength={100} />
                  <TextField form={form} name="businessName" label="Business name" autoComplete="organization" />
                  <SelectField form={form} name="businessType" label="Type of business" options={businessTypes} />
                  <SelectField form={form} name="businessSize" label="Size of business" options={businessSizes} />
                </fieldset>

                <fieldset className="flex flex-col gap-space-md">
                  <legend className="font-headline-sm text-headline-sm text-on-surface font-bold mb-space-sm">How can we reach you?</legend>
                  <p className="font-body-sm text-body-sm text-on-surface-variant -mt-2">Give us at least one: an email address or a phone number.</p>
                  <TextField form={form} name="phone" label="Phone / WhatsApp number" type="tel" inputMode="tel" autoComplete="tel" maxLength={20} />
                  <TextField form={form} name="email" label="Email address" type="email" inputMode="email" autoComplete="email" maxLength={254} />
                  <RadioGroup form={form} name="preferredContact" label="Preferred way to contact you" options={contactMethods} />
                </fieldset>

                <fieldset className="flex flex-col gap-space-md">
                  <legend className="font-headline-sm text-headline-sm text-on-surface font-bold mb-space-sm">What do you need help with?</legend>
                  <SelectField form={form} name="challenge" label="Main business challenge right now" options={challenges} />
                  <SelectField form={form} name="recordsState" label="How do you keep business records today?" options={recordStates} />
                  <SelectField form={form} name="timeframe" label="When would you like help?" options={timeframes} />
                  <SelectField
                    form={form}
                    name="service"
                    label="Service you are interested in"
                    options={serviceOptions}
                    hint={preselected ? 'Filled in from the page you came from. You can change it.' : undefined}
                  />
                  <TextArea
                    form={form}
                    name="additionalInfo"
                    label="Anything else we should know?"
                    optional
                    hint="Please don’t include bank details, passwords or ID numbers."
                  />
                </fieldset>

                <Honeypot />
                <div className="flex flex-col gap-space-sm">
                  <PrivacyAck form={form} purpose="respond to this request" />
                  <MarketingConsent form={form} />
                </div>
                <SubmitButton form={form} label="Send consultation request" icon="event_available" />
              </form>
            </Card>
          )}

          <aside className="flex flex-col gap-space-md md:sticky md:top-24">
            <Card className="p-space-md flex flex-col gap-space-sm">
              <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">What happens next</h2>
              <ol className="flex flex-col gap-2.5">
                {nextSteps.map((s, i) => (
                  <li key={s} className="flex items-start gap-2.5 font-body-md text-body-md text-on-surface-variant text-[13.5px]">
                    <span className="w-6 h-6 shrink-0 rounded-full bg-secondary text-on-secondary text-[11px] font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="pt-0.5">{s}</span>
                  </li>
                ))}
              </ol>
            </Card>
            <Card className="p-space-md flex flex-col gap-2">
              <h2 className="font-label-lg text-label-lg text-on-surface font-bold">Prefer to talk now?</h2>
              <a href={site.contact.phoneHref} className="min-h-[44px] flex items-center gap-2 text-secondary font-label-lg text-label-lg">
                <Icon name="call" className="text-[20px]" />
                {site.contact.phoneDisplay}
              </a>
              <p className="flex items-center gap-1.5 font-body-sm text-body-sm text-on-surface-variant">
                <Icon name="lock" className="text-[15px] text-secondary" />
                Your business information is handled in confidence.
              </p>
            </Card>
          </aside>
        </div>
      </section>
    </>
  );
}
