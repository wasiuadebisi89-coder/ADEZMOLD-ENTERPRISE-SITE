import { useId, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { Link } from '../lib/router.jsx';
import { site } from '../config/site.js';
import { getAttribution } from '../lib/attribution.js';
import { newSubmissionId, submitForm } from '../lib/submit.js';

/**
 * Form state, client-side validation and submission.
 * Submitted details are kept in memory only: never in the URL or storage, never logged.
 */
export function useLeadForm({ endpoint, validate, initial }) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle'); // idle | submitting | success | error
  const [failure, setFailure] = useState(null);
  const [result, setResult] = useState(null);
  const submissionId = useRef(newSubmissionId());
  const summaryRef = useRef(null);
  const inFlight = useRef(false);

  const setField = (name, value) => {
    setValues((v) => ({ ...v, [name]: value }));
    if (errors[name]) setErrors(({ [name]: _removed, ...rest }) => rest);
  };

  const showErrors = (errs) => {
    setErrors(errs);
    setStatus('idle');
    requestAnimationFrame(() => summaryRef.current?.focus());
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (inFlight.current) return; // ignore double taps
    const { errors: errs, valid } = validate(values);
    if (!valid) return showErrors(errs);

    inFlight.current = true;
    setStatus('submitting');
    setFailure(null);
    try {
      const body = await submitForm(endpoint, {
        ...values,
        website: event.currentTarget.elements.website?.value ?? '', // honeypot
        submissionId: submissionId.current,
        attribution: getAttribution(),
      });
      setResult(body);
      setStatus('success');
      window.scrollTo({ top: 0 });
    } catch (err) {
      if (err.kind === 'validation' && err.fieldErrors) showErrors(err.fieldErrors);
      else {
        setFailure(err.kind ?? 'server');
        setStatus('error');
      }
    } finally {
      inFlight.current = false;
    }
  };

  return { values, setField, errors, status, failure, result, handleSubmit, summaryRef };
}

const control =
  'w-full min-h-[48px] rounded-xl border bg-surface-container-lowest px-3.5 py-2.5 font-body-md text-body-md text-[15px] text-on-surface placeholder:text-outline transition-colors focus:border-secondary';
const okBorder = 'border-surface-container-high hover:border-outline-variant';
const badBorder = 'border-error bg-error-container/20';

function FieldShell({ id, label, hint, error, optional, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-label-lg text-label-lg text-on-surface">
        {label}
        {optional && <span className="font-normal text-on-surface-variant"> (optional)</span>}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="font-body-sm text-body-sm text-on-surface-variant -mt-0.5">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={`${id}-error`} className="font-body-sm text-body-sm text-error font-medium flex items-start gap-1">
          <span aria-hidden="true">✕</span>
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

function describedBy(id, hint, error) {
  return [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
}

export function TextField({ form, name, label, hint, optional, type = 'text', autoComplete, inputMode, maxLength = 120 }) {
  const id = useId();
  const error = form.errors[name];
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional}>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        value={form.values[name]}
        onChange={(e) => form.setField(name, e.target.value)}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={`${control} ${error ? badBorder : okBorder}`}
      />
    </FieldShell>
  );
}

export function TextArea({ form, name, label, hint, optional, maxLength = 1000 }) {
  const id = useId();
  const error = form.errors[name];
  const length = form.values[name].length;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional}>
      <textarea
        id={id}
        name={name}
        rows={4}
        maxLength={maxLength}
        value={form.values[name]}
        onChange={(e) => form.setField(name, e.target.value)}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={`${control} ${error ? badBorder : okBorder} resize-y`}
      />
      <p className="font-body-sm text-body-sm text-outline text-right -mt-1" aria-hidden="true">
        {length}/{maxLength}
      </p>
    </FieldShell>
  );
}

export function SelectField({ form, name, label, hint, options, placeholder = 'Choose one…', optional }) {
  const id = useId();
  const error = form.errors[name];
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional}>
      <div className="relative">
        <select
          id={id}
          name={name}
          value={form.values[name]}
          onChange={(e) => form.setField(name, e.target.value)}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={`${control} ${error ? badBorder : okBorder} appearance-none pr-10 ${form.values[name] ? '' : 'text-outline'}`}
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value} className="text-on-surface">
              {o.label}
            </option>
          ))}
        </select>
        <Icon name="expand_more" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[22px]" />
      </div>
    </FieldShell>
  );
}

export function RadioGroup({ form, name, label, options }) {
  const id = useId();
  const error = form.errors[name];
  return (
    <fieldset className="flex flex-col gap-1.5" aria-describedby={error ? `${id}-error` : undefined}>
      <legend className="font-label-lg text-label-lg text-on-surface mb-1.5">{label}</legend>
      <div className="grid grid-cols-3 gap-2">
        {options.map((o) => {
          const checked = form.values[name] === o.value;
          return (
            <label
              key={o.value}
              className={`min-h-[48px] px-2 rounded-xl border flex items-center justify-center text-center font-label-md text-label-md cursor-pointer transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-secondary has-[:focus-visible]:outline-offset-2 ${
                checked
                  ? 'border-secondary bg-secondary-container/50 text-on-secondary-container'
                  : `${error ? 'border-error' : 'border-surface-container-high'} bg-surface-container-lowest text-on-surface-variant`
              }`}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={checked}
                onChange={() => form.setField(name, o.value)}
                className="sr-only"
              />
              {o.label}
            </label>
          );
        })}
      </div>
      {error && (
        <p id={`${id}-error`} className="font-body-sm text-body-sm text-error font-medium flex items-start gap-1">
          <span aria-hidden="true">✕</span>
          <span>{error}</span>
        </p>
      )}
    </fieldset>
  );
}

export function Checkbox({ form, name, children }) {
  const id = useId();
  const error = form.errors[name];
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-3">
        <input
          id={id}
          name={name}
          type="checkbox"
          checked={form.values[name]}
          onChange={(e) => form.setField(name, e.target.checked)}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`mt-0.5 h-5 w-5 shrink-0 rounded accent-secondary cursor-pointer ${error ? 'outline outline-2 outline-error' : ''}`}
        />
        <label htmlFor={id} className="font-body-md text-body-md text-on-surface-variant text-[13.5px] cursor-pointer">
          {children}
        </label>
      </div>
      {error && (
        <p id={`${id}-error`} className="ml-8 font-body-sm text-body-sm text-error font-medium">
          {error}
        </p>
      )}
    </div>
  );
}

// Hidden field that only bots fill in. Server rejects submissions where it has a value.
export function Honeypot() {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] w-px h-px overflow-hidden">
      <label>
        Leave this field empty
        <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </label>
    </div>
  );
}

export function ErrorSummary({ form, labels }) {
  const entries = Object.entries(form.errors);
  return (
    <div ref={form.summaryRef} tabIndex={-1} className="outline-none scroll-mt-28" data-testid="error-summary">
      {entries.length > 0 && (
        <div role="alert" className="rounded-xl border border-error/30 bg-error-container/60 p-3.5 flex flex-col gap-1.5">
          <p className="font-label-lg text-label-lg text-on-error-container">
            Please fix {entries.length === 1 ? 'this' : `these ${entries.length}`} before sending:
          </p>
          <ul className="list-disc pl-5 font-body-sm text-body-sm text-on-error-container">
            {[...new Set(entries.map(([k, msg]) => `${labels[k] ?? k}: ${msg}`))].map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const failureText = {
  network: 'We couldn’t reach our server. Check your internet connection and try again.',
  'rate-limited': 'Too many requests were sent from this connection. Please wait a few minutes and try again.',
  server: 'Something went wrong on our side and your request was not saved.',
};

export function SubmitFailure({ kind }) {
  return (
    <div role="alert" className="rounded-xl border border-error/30 bg-error-container/60 p-3.5 flex flex-col gap-1" data-testid="submit-failure">
      <p className="font-label-lg text-label-lg text-on-error-container">Your request was not sent.</p>
      <p className="font-body-sm text-body-sm text-on-error-container">
        {failureText[kind] ?? failureText.server} You can also call us on{' '}
        <a href={site.contact.phoneHref} className="underline font-semibold">
          {site.contact.phoneDisplay}
        </a>
        .
      </p>
    </div>
  );
}

export function SubmitButton({ form, label, busyLabel = 'Sending…', icon = 'send' }) {
  const busy = form.status === 'submitting';
  return (
    <button
      type="submit"
      disabled={busy}
      aria-disabled={busy}
      className="btn-sheen min-h-[52px] w-full bg-secondary text-on-secondary font-label-lg text-label-lg rounded-xl flex items-center justify-center gap-2 shadow-md hover:bg-secondary/90 active:scale-[0.98] transition-all font-semibold disabled:opacity-70 disabled:cursor-wait"
    >
      <Icon name={busy ? 'progress_activity' : icon} className={`text-[20px] ${busy ? 'animate-spin' : ''}`} />
      <span>{busy ? busyLabel : label}</span>
    </button>
  );
}

export function PrivacyAck({ form, purpose }) {
  return (
    <Checkbox form={form} name="privacyAck">
      I have read the{' '}
      <Link to="/privacy" target="_blank" className="text-secondary font-semibold underline">
        privacy notice
      </Link>{' '}
      and agree that Adezmold may use these details to {purpose}.
    </Checkbox>
  );
}

export function MarketingConsent({ form }) {
  return (
    <Checkbox form={form} name="marketingConsent">
      Optional: send me occasional practical tips and updates from Adezmold by email. I can unsubscribe at any time.
    </Checkbox>
  );
}
