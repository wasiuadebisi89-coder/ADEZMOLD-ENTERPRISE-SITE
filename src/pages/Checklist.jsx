import { checklistItemCount, checklistSections, checklistTeaser, checklistTitle } from '../content/checklist.js';
import { businessTypes } from '../content/forms.js';
import { validateChecklistRequest } from '../lib/validation.js';
import Icon from '../components/Icon.jsx';
import { Card, PageHeader, wrap } from '../components/ui.jsx';
import {
  ErrorSummary,
  Honeypot,
  MarketingConsent,
  PrivacyAck,
  SelectField,
  SubmitButton,
  SubmitFailure,
  TextField,
  useLeadForm,
} from '../components/form.jsx';
import { Link } from '../lib/router.jsx';
import { site } from '../config/site.js';

const labels = {
  fullName: 'Name',
  email: 'Email',
  businessName: 'Business name',
  businessType: 'Business type',
  privacyAck: 'Privacy notice',
};

function Success({ email, result }) {
  const { downloadUrl, emailed } = result ?? {};
  return (
    <Card className="p-space-md md:p-space-lg flex flex-col gap-space-sm" data-testid="checklist-success">
      <div className="w-12 h-12 rounded-xl bg-secondary-container text-on-secondary-container flex items-center justify-center">
        <Icon name="check_circle" className="text-[28px]" />
      </div>
      <h2 tabIndex={-1} className="font-headline-md text-headline-md text-on-surface font-bold" ref={(el) => el?.focus()}>
        {downloadUrl ? 'Your checklist is ready' : 'Request received'}
      </h2>
      {downloadUrl ? (
        <>
          <a
            href={downloadUrl}
            download
            data-testid="checklist-download"
            className="btn-sheen min-h-[52px] w-full bg-secondary text-on-secondary font-label-lg text-label-lg rounded-xl flex items-center justify-center gap-2 shadow-md hover:bg-secondary/90 active:scale-[0.98] transition-all font-semibold"
          >
            <Icon name="download" className="text-[20px]" />
            <span>Download the checklist (PDF)</span>
          </a>
          <p className="font-body-sm text-body-sm text-on-surface-variant">This download link works for 7 days.</p>
        </>
      ) : (
        <p className="font-body-md text-body-md text-on-surface-variant" data-testid="checklist-no-link">
          We have your request, but the download isn’t available right now. We’ll get the checklist to you; if you need it urgently,
          call {site.contact.phoneDisplay}.
        </p>
      )}
      {emailed && (
        <p className="font-body-md text-body-md text-on-surface-variant" data-testid="checklist-emailed">
          A copy of the link is on its way to <strong className="text-on-surface">{email}</strong>. If you don’t see it, check your spam or
          promotions folder.
        </p>
      )}
      <p className="font-body-md text-body-md text-on-surface-variant">
        Want a second pair of eyes on your answers?{' '}
        <Link to="/consultation?service=health-check" className="text-secondary font-semibold underline">
          Book a consultation
        </Link>
        .
      </p>
    </Card>
  );
}

export default function Checklist() {
  const form = useLeadForm({
    endpoint: '/api/checklist',
    validate: validateChecklistRequest,
    initial: { fullName: '', email: '', businessName: '', businessType: '', privacyAck: false, marketingConsent: false },
  });

  return (
    <>
      <PageHeader
        icon="stars"
        eyebrow="Free Executive Resource"
        title={checklistTitle}
        text="A practical self-check for produce merchants, wholesalers and distributors. Find where money slips away between buying, transport, storage and sales collections, before your next shipment."
      />

      <section className={`${wrap} pb-space-lg`}>
        <div className="mx-auto w-full max-w-5xl grid gap-space-lg md:grid-cols-[1fr_1.1fr] md:items-start">
          <div className="flex flex-col gap-space-md">
            <Card className="p-space-md flex flex-col gap-space-sm border-tertiary-fixed-dim/30">
              <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">What’s inside</h2>
              <p className="font-body-md text-body-md text-on-surface-variant text-[13.5px]">
                {checklistItemCount} yes/no checks across {checklistSections.length} areas of the business:
              </p>
              <ul className="flex flex-col gap-1.5" data-testid="checklist-areas">
                {checklistSections.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 font-body-md text-body-md text-on-surface text-[13.5px]">
                    <span className="flex items-center gap-2">
                      <Icon name="check_box" className="text-secondary text-[17px]" />
                      {s.title}
                    </span>
                    <span className="text-on-surface-variant font-label-sm text-label-sm shrink-0">{s.items.length} checks</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="p-space-md flex flex-col gap-2">
              <h2 className="font-label-md text-label-md uppercase tracking-wide text-on-surface font-bold">A taste of the checks</h2>
              <ul className="flex flex-col gap-1.5">
                {checklistTeaser.map((t) => (
                  <li key={t} className="font-body-md text-body-md text-on-surface-variant text-[13.5px] flex gap-2">
                    <Icon name="check_circle" className="text-secondary text-[17px] mt-0.5" />
                    {t}
                  </li>
                ))}
              </ul>
            </Card>
            <p className="flex items-start gap-1.5 font-body-sm text-body-sm text-on-surface-variant">
              <Icon name="info" className="text-[16px] mt-px" />
              <span>
                The checklist is educational guidance to help you review your own business. It is not an audit, a certification or a
                legal or tax opinion.
              </span>
            </p>
          </div>

          {form.status === 'success' ? (
            <Success email={form.values.email.trim()} result={form.result} />
          ) : (
            <Card className="p-space-md md:p-space-lg">
              <form noValidate onSubmit={form.handleSubmit} className="relative flex flex-col gap-space-md" aria-labelledby="checklist-form-title">
                <div>
                  <h2 id="checklist-form-title" className="font-headline-sm text-headline-sm text-on-surface font-bold">
                    Get the free checklist
                  </h2>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">No financial records needed. Takes under a minute.</p>
                </div>
                <ErrorSummary form={form} labels={labels} />
                {form.status === 'error' && <SubmitFailure kind={form.failure} />}
                <TextField form={form} name="fullName" label="Your name" autoComplete="name" maxLength={100} />
                <TextField
                  form={form}
                  name="email"
                  label="Email address"
                  hint="We’ll send the checklist here."
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  maxLength={254}
                />
                <TextField form={form} name="businessName" label="Business name" optional autoComplete="organization" />
                <SelectField form={form} name="businessType" label="Type of business" optional options={businessTypes} />
                <Honeypot />
                <div className="flex flex-col gap-space-sm pt-1">
                  <PrivacyAck form={form} purpose="send me the checklist" />
                  <MarketingConsent form={form} />
                </div>
                <SubmitButton form={form} label="Send me the checklist" icon="download" />
              </form>
            </Card>
          )}
        </div>
      </section>
    </>
  );
}
