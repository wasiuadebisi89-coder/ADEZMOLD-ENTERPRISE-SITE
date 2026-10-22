import { Link } from '../lib/router.jsx';
import { services } from '../content/services.js';
import Icon from '../components/Icon.jsx';
import { Card, CheckList, DarkCta, PageHeader, serviceTone, wrap } from '../components/ui.jsx';

function Block({ title, children }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-label-md text-label-md uppercase tracking-wide text-on-surface font-bold">{title}</h3>
      {children}
    </div>
  );
}

function ServiceDetail({ s }) {
  const t = serviceTone[s.tone];
  return (
    <Card className="overflow-hidden scroll-mt-24" id={s.id} data-testid={`service-${s.id}`}>
      <div className={`h-1 bg-gradient-to-r ${t.bar} to-transparent w-full`} />
      <article className="p-space-md md:p-space-lg flex flex-col gap-space-md" aria-labelledby={`${s.id}-title`}>
        <div className="flex items-start justify-between gap-space-xs">
          <div className="flex items-center gap-space-sm">
            <div className={`w-11 h-11 shrink-0 rounded-xl border flex items-center justify-center shadow-sm ${t.iconBox}`}>
              <Icon name={s.icon} className="text-[26px]" />
            </div>
            <h2 id={`${s.id}-title`} className="font-headline-md text-headline-md text-on-surface font-bold tracking-tight">
              {s.title}
            </h2>
          </div>
          <span className={`px-2.5 py-0.5 rounded-full font-label-sm text-label-sm font-bold border shrink-0 ${t.badge}`}>{s.badge}</span>
        </div>

        <p className="font-body-md text-body-md md:font-body-lg md:text-body-lg text-on-surface-variant">{s.summary}</p>

        <div className="grid gap-space-md md:grid-cols-2">
          <Block title="The problem it solves">
            <p className="font-body-md text-body-md text-on-surface text-[13.5px]">{s.problem}</p>
          </Block>
          <Block title="Who it is for">
            <p className="font-body-md text-body-md text-on-surface text-[13.5px]">{s.customers}</p>
          </Block>
        </div>

        <div className="bg-surface-container-low/70 rounded-xl p-3.5 border border-surface-container-high/60 flex flex-col gap-2.5">
          <div className="font-label-sm text-label-sm text-on-surface uppercase tracking-wide font-bold text-[11px] flex items-center justify-between">
            <span>Scope &amp; deliverables</span>
            <span className={`font-medium text-[10px] ${t.tag}`}>{s.tag}</span>
          </div>
          <CheckList items={s.scope} />
        </div>

        <div className="grid gap-space-md md:grid-cols-2">
          <Block title="How the engagement runs">
            <ol className="flex flex-col gap-2">
              {s.process.map((step, i) => (
                <li key={step} className="flex items-start gap-2.5 font-body-md text-body-md text-on-surface-variant text-[13.5px]">
                  <span className="w-6 h-6 shrink-0 rounded-full bg-secondary text-on-secondary text-[11px] font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </Block>
          <Block title="Good to know">
            <CheckList items={s.limits} icon="info" />
          </Block>
        </div>

        <Link
          to={`/consultation?service=${s.id}`}
          className="min-h-[48px] w-full md:w-auto md:self-start md:px-space-lg px-space-md bg-primary-container text-surface-container-lowest font-label-lg text-label-lg rounded-xl flex items-center justify-center gap-2 shadow-[0_8px_20px_-4px_rgba(10,25,47,0.35)] hover:bg-primary-container/95 active:scale-[0.98] transition-all on-dark"
        >
          <Icon name="event_available" className="text-tertiary-fixed text-[20px]" />
          <span>Ask about the {s.title}</span>
        </Link>
      </article>
    </Card>
  );
}

export default function Services() {
  return (
    <>
      <PageHeader
        icon="business_center"
        eyebrow="Advisory Practice"
        title="Services for produce businesses"
        text="Three ways to work with Adezmold, from a one-off diagnostic to ongoing monthly oversight. Each starts with a confidential conversation about your business."
      />
      <nav aria-label="Services on this page" className={`${wrap} pb-space-md`}>
        <ul className="mx-auto max-w-3xl flex flex-wrap gap-2">
          {services.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="min-h-[40px] px-3.5 rounded-full border border-surface-container-high bg-surface-container-lowest font-label-md text-label-md text-on-surface flex items-center hover:border-secondary/40"
              >
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <section className={`${wrap} flex flex-col gap-space-lg`}>
        <div className="mx-auto w-full max-w-3xl flex flex-col gap-space-lg">
          {services.map((s) => (
            <ServiceDetail key={s.id} s={s} />
          ))}
        </div>
      </section>
      <DarkCta
        id="services-cta"
        title="Not sure which service fits?"
        text="Tell us about the business and the problem you want solved. We will recommend where to start."
        to="/consultation?service=not-sure"
        label="Book a Consultation"
      />
    </>
  );
}
