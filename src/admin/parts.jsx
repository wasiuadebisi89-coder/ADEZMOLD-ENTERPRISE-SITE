import Icon from '../components/Icon.jsx';
import { statusLabel, statuses } from '../content/pipeline.js';

const toneClass = {
  tertiary: 'bg-tertiary-fixed/50 text-on-tertiary-fixed-variant border-tertiary-fixed-dim/40',
  primary: 'bg-surface-container-high text-on-surface border-primary-container/15',
  secondary: 'bg-secondary-container text-on-secondary-container border-secondary/20',
  won: 'bg-secondary text-on-secondary border-secondary',
  lost: 'bg-error-container text-on-error-container border-error/20',
};

export function StatusBadge({ status }) {
  const tone = statuses.find((s) => s.value === status)?.tone ?? 'primary';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border font-label-sm text-label-sm font-semibold whitespace-nowrap ${toneClass[tone]}`}>
      {statusLabel(status)}
    </span>
  );
}

export function Panel({ title, icon, children, className = '', actions }) {
  return (
    <section className={`bg-surface-container-lowest rounded-xl border border-surface-container-high/70 p-space-md flex flex-col gap-space-sm ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 font-label-md text-label-md uppercase tracking-wide text-on-surface font-bold">
            {icon && <Icon name={icon} className="text-[16px] text-secondary" />}
            {title}
          </h2>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <dt className="font-label-sm text-label-sm text-on-surface-variant">{label}</dt>
      <dd className="font-body-md text-body-md text-on-surface break-words">{children ?? '—'}</dd>
    </div>
  );
}

export const inputClass =
  'w-full min-h-[44px] rounded-lg border border-surface-container-high bg-surface-container-lowest px-3 py-2 font-body-md text-body-md text-[15px] text-on-surface focus:border-secondary';

export function Button({ variant = 'primary', className = '', children, ...rest }) {
  const v = {
    primary: 'bg-secondary text-on-secondary hover:bg-secondary/90',
    quiet: 'bg-surface-container-lowest text-on-surface border border-surface-container-high hover:border-secondary/40',
    danger: 'bg-error text-on-error hover:bg-error/90',
  }[variant];
  return (
    <button
      className={`min-h-[44px] px-4 rounded-lg font-label-lg text-label-lg flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${v} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Notice({ kind = 'error', children }) {
  const cls = kind === 'error' ? 'bg-error-container/70 text-on-error-container border-error/20' : 'bg-secondary-container/60 text-on-secondary-container border-secondary/20';
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-3 py-2.5 font-body-sm text-body-sm ${cls}`}>
      {children}
    </div>
  );
}
