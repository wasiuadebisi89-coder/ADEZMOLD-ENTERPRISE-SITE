import Icon from './Icon.jsx';
import { Link } from '../lib/router.jsx';

export const wrap = 'px-gutter-mobile md:px-margin-tablet';
export const inner = 'mx-auto w-full max-w-6xl';

export const serviceTone = {
  secondary: {
    bar: 'from-secondary via-secondary/70',
    iconBox: 'bg-secondary/10 border-secondary/20 text-secondary',
    badge: 'bg-secondary-container text-on-secondary-container border-secondary/20',
    tag: 'text-secondary',
  },
  primary: {
    bar: 'from-primary-container via-primary-container/70',
    iconBox: 'bg-primary-container/10 border-primary-container/20 text-primary-container',
    badge: 'bg-surface-container-high text-on-surface border-primary-container/20',
    tag: 'text-primary-container',
  },
  tertiary: {
    bar: 'from-tertiary-fixed-dim via-tertiary-fixed/70',
    iconBox: 'bg-tertiary-fixed/30 border-tertiary-fixed-dim/40 text-on-tertiary-container',
    badge: 'bg-tertiary-container text-tertiary-fixed border-tertiary-fixed/40',
    tag: 'text-on-tertiary-container',
  },
};

export function SectionIntro({ icon, eyebrow, title, text, id, as: Heading = 'h2' }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="inline-flex items-center gap-1.5 font-label-sm text-label-sm text-secondary uppercase tracking-wider font-bold">
        <Icon name={icon} className="text-[16px]" />
        <span>{eyebrow}</span>
      </div>
      <Heading
        id={id}
        className={
          Heading === 'h1'
            ? 'font-headline-xl-mobile text-headline-xl-mobile md:font-headline-xl md:text-headline-xl text-on-surface font-bold tracking-tight'
            : 'font-headline-lg text-headline-lg text-on-surface font-bold tracking-tight'
        }
      >
        {title}
      </Heading>
      {text && <p className="font-body-md text-body-md md:font-body-lg md:text-body-lg text-on-surface-variant text-[14px]">{text}</p>}
    </div>
  );
}

export function PageHeader({ icon, eyebrow, title, text }) {
  return (
    <section className={`${wrap} pt-5 md:pt-space-xl pb-space-md`}>
      <div className="mx-auto w-full max-w-3xl">
        <SectionIntro as="h1" icon={icon} eyebrow={eyebrow} title={title} text={text} />
      </div>
    </section>
  );
}

export function Card({ className = '', children, ...rest }) {
  return (
    <div className={`depth-card bg-surface-container-lowest rounded-2xl border border-surface-container-high/60 ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function CheckList({ items, icon = 'check_circle' }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((d) => (
        <li key={d} className="flex items-start gap-2 font-body-md text-body-md text-on-surface-variant text-[13.5px]">
          <Icon name={icon} className="text-secondary text-[17px] shrink-0 mt-0.5" />
          <span>{d}</span>
        </li>
      ))}
    </ul>
  );
}

export function DarkCta({ title, text, to, label, icon = 'event_available', id }) {
  return (
    <section aria-labelledby={id} className={`${wrap} py-space-lg`}>
      <div className="on-dark mx-auto w-full max-w-3xl depth-card-dark bg-gradient-to-b from-primary-container via-[#0d223f] to-primary-container text-surface-container-lowest rounded-2xl p-space-lg flex flex-col gap-space-md text-center relative overflow-hidden border border-white/10">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
        <div className="relative flex flex-col gap-space-xs">
          <h2 id={id} className="font-headline-lg text-headline-lg text-white font-extrabold tracking-tight">
            {title}
          </h2>
          <p className="font-body-md text-body-md text-on-primary-container max-w-md mx-auto text-[13.5px] leading-relaxed">{text}</p>
        </div>
        <Link
          to={to}
          className="relative min-h-[50px] w-full bg-gradient-to-r from-tertiary-fixed to-tertiary-fixed-dim text-primary-container font-label-lg text-label-lg rounded-xl flex items-center justify-center gap-2 shadow-lg hover:brightness-105 active:scale-[0.98] transition-all font-bold tracking-tight"
        >
          <Icon name={icon} className="text-[20px]" />
          <span>{label}</span>
        </Link>
      </div>
    </section>
  );
}
