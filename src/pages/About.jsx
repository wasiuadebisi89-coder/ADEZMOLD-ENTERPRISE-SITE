import { site } from '../config/site.js';
import { steps } from '../content/process.js';
import Icon from '../components/Icon.jsx';
import { Card, DarkCta, PageHeader, SectionIntro, wrap } from '../components/ui.jsx';
import { Link } from '../lib/router.jsx';

const principles = [
  { icon: 'fact_check', title: 'Records before opinions', text: 'We start from what your books, waybills and stock counts show, then explain it plainly.' },
  { icon: 'checklist_rtl', title: 'Controls your staff can run', text: 'Simple routines that fit how your business actually works, not paperwork for its own sake.' },
  { icon: 'handshake', title: 'Practical and hands-on', text: 'We work on site with your people until the new routines are part of daily work.' },
  { icon: 'lock', title: 'Confidential', text: 'What we learn about your business stays between us and you.' },
];

const expertise = [
  'Cash, bank and sales record-keeping',
  'Stock control and transit loss reduction',
  'Customer credit limits and debt recovery',
  'Operating procedures and staff accountability',
  'Business software setup, including our Commodity Control System (CCS)',
  'Getting records ready for tax, lenders and growth',
];

function Founder() {
  const { founder } = site;
  return (
    <Card className="p-space-md md:p-space-lg flex flex-col sm:flex-row gap-space-md sm:items-center">
      {founder.photo ? (
        <img src={founder.photo} alt={founder.name} className="w-24 h-24 rounded-2xl object-cover shrink-0" />
      ) : (
        <div
          className="w-24 h-24 rounded-2xl bg-primary-container text-tertiary-fixed flex items-center justify-center shrink-0 font-headline-lg text-headline-lg font-bold"
          aria-hidden="true"
        >
          {founder.name
            .split(' ')
            .slice(0, 2)
            .map((w) => w[0])
            .join('')}
        </div>
      )}
      <div className="flex flex-col gap-1">
        <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">{founder.name}</h3>
        <p className="font-label-md text-label-md text-secondary">
          {founder.role}, {site.name}
        </p>
        {founder.bio && <p className="font-body-md text-body-md text-on-surface-variant mt-1">{founder.bio}</p>}
      </div>
    </Card>
  );
}

export default function About() {
  return (
    <>
      <PageHeader
        icon="domain"
        eyebrow="Firm Profile"
        title="About Adezmold"
        text={`${site.name} is a Nigerian consulting firm based in Iwo, Osun State. We help produce merchants, distributors and growing SMEs put financial control, stock systems and operating structure in place.`}
      />

      <section aria-labelledby="philosophy-title" className={`${wrap} py-space-md`}>
        <div className="mx-auto w-full max-w-3xl flex flex-col gap-space-md">
          <SectionIntro
            id="philosophy-title"
            icon="balance"
            eyebrow="Philosophy"
            title="Visible, organised and scalable"
            text="Many strong produce businesses run on the owner’s memory and presence. That works until the business grows. Our aim is a business whose numbers are visible, whose routines are organised, and which can grow without the owner watching every truck."
          />
          <ul className="grid gap-space-sm sm:grid-cols-2">
            {principles.map((p) => (
              <li key={p.title} className="depth-card bg-surface-container-lowest p-3.5 rounded-xl flex items-start gap-3 border border-surface-container-high/50">
                <div className="w-10 h-10 rounded-lg bg-surface-container/70 border border-secondary/10 flex items-center justify-center shrink-0 text-secondary shadow-inner">
                  <Icon name={p.icon} className="text-[22px]" />
                </div>
                <div>
                  <h3 className="font-label-lg text-label-lg text-on-surface font-bold">{p.title}</h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">{p.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="method-title" className={`${wrap} py-space-md`}>
        <div className="mx-auto w-full max-w-3xl flex flex-col gap-space-md">
          <SectionIntro id="method-title" icon="conversion_path" eyebrow="Methodology" title="How we work" />
          <ol className="grid gap-space-sm sm:grid-cols-2">
            {steps.map((s) => (
              <li key={s.n} className="bg-surface-container-lowest p-3.5 rounded-xl border border-surface-container-high/60 flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-secondary text-on-secondary text-[11px] font-bold flex items-center justify-center" aria-hidden="true">
                    {s.n}
                  </span>
                  <h3 className="font-label-lg text-label-lg text-on-surface font-bold">{s.title}</h3>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="expertise-title" className={`${wrap} py-space-md`}>
        <div className="mx-auto w-full max-w-3xl flex flex-col gap-space-md">
          <SectionIntro id="expertise-title" icon="verified" eyebrow="Expertise" title="Areas of expertise" />
          <ul className="grid gap-2 sm:grid-cols-2">
            {expertise.map((e) => (
              <li key={e} className="flex items-start gap-2 font-body-md text-body-md text-on-surface">
                <Icon name="check_circle" className="text-secondary text-[18px] shrink-0 mt-0.5" />
                <span>{e}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="founder-title" className={`${wrap} py-space-md`}>
        <div className="mx-auto w-full max-w-3xl flex flex-col gap-space-md">
          <SectionIntro id="founder-title" icon="handshake" eyebrow="Leadership" title="Meet the founder" />
          <Founder />
        </div>
      </section>

      <section aria-labelledby="contact-title" className={`${wrap} py-space-md`}>
        <div className="mx-auto w-full max-w-3xl">
          <Card className="p-space-md md:p-space-lg flex flex-col gap-space-sm">
            <h2 id="contact-title" className="font-headline-sm text-headline-sm text-on-surface font-bold">
              Visit or call us
            </h2>
            <address className="not-italic font-body-md text-body-md text-on-surface-variant flex flex-col gap-2">
              <span className="flex items-start gap-2">
                <Icon name="location_on" className="text-secondary text-[18px] mt-0.5" />
                <span>{site.contact.addressLines.join(', ')}</span>
              </span>
              <a href={site.contact.phoneHref} className="flex items-center gap-2 min-h-[40px] text-on-surface font-semibold">
                <Icon name="call" className="text-secondary text-[18px]" />
                {site.contact.phoneDisplay}
              </a>
              {site.contact.email && (
                <a href={`mailto:${site.contact.email}`} className="flex items-center gap-2 min-h-[40px] text-on-surface font-semibold">
                  <Icon name="mail" className="text-secondary text-[18px]" />
                  {site.contact.email}
                </a>
              )}
            </address>
            <Link to="/checklist" className="min-h-[44px] flex items-center gap-1.5 text-secondary font-label-md text-label-md font-bold">
              <span>Start with the free checklist</span>
              <Icon name="arrow_forward" className="text-[18px]" />
            </Link>
          </Card>
        </div>
      </section>

      <DarkCta
        id="about-cta"
        title="Talk to us about your business"
        text="Book a confidential discovery session. We will look at where control is slipping and what to fix first."
        to="/consultation"
        label="Book a Consultation"
      />
    </>
  );
}
