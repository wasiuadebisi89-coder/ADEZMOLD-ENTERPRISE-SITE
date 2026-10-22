import { Link } from '../lib/router.jsx';
import { images, site } from '../config/site.js';
import { services } from '../content/services.js';
import { checklistItemCount, checklistSections, checklistTeaser, checklistTitle } from '../content/checklist.js';
import Icon from '../components/Icon.jsx';
import LeakageEstimator from '../components/LeakageEstimator.jsx';
import { SectionIntro, serviceTone as tone, wrap, inner } from '../components/ui.jsx';
import { steps } from '../content/process.js';


const pillars = [
  { icon: 'account_balance_wallet', title: 'Financial Control', sub: 'Margins & Ledger' },
  { icon: 'inventory_2', title: 'Stock Systems', sub: 'Transit Loss Control' },
  { icon: 'hub', title: 'Structuring', sub: 'Governance & Org' },
  { icon: 'checklist_rtl', title: 'Operations', sub: 'Auditable SOPs' },
];

const challenges = [
  {
    code: '01/Transit',
    problem: 'Unexplained stock differences between farm gate, transit, and store.',
    control: 'Standardised intake, grading and moisture checks, and weight records at every hand-over.',
  },
  {
    code: '02/Credit',
    problem: 'Cash flow tied up in delayed, unsecured credit to market buyers and middlemen.',
    control: 'Buyer credit limits, documented customer details and a strict recovery schedule.',
  },
  {
    code: '03/Governance',
    problem: 'Over-dependence on the owner to physically oversee every truck and transaction.',
    control: 'Clear delegation of authority and cross-checked staff sign-offs.',
  },
];

function Hero() {
  return (
    <section className={`${wrap} pt-5 md:pt-space-xl pb-space-lg`}>
      <div
        className={`${inner} flex flex-col gap-space-md md:grid md:grid-cols-2 md:gap-x-space-xl md:gap-y-space-md`}
        data-testid="hero"
      >
        {/* Mobile order follows the Stitch design: intro, image, CTAs, pillars. */}
        <div className="flex flex-col gap-space-md md:col-start-1 md:row-start-1 md:self-end">
          <div className="inline-flex items-center gap-2 self-start px-3 py-1.5 rounded-full bg-surface-container-lowest border border-secondary/20 shadow-sm relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-secondary/5 via-secondary/10 to-transparent pointer-events-none" />
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-secondary" />
            </span>
            <span className="relative font-label-sm text-label-sm uppercase tracking-wider font-semibold text-secondary">
              Institutional Advisory for Produce SMEs
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="font-headline-xl-mobile text-headline-xl-mobile md:font-headline-xl md:text-headline-xl text-on-surface tracking-tight font-bold leading-tight">
              Build a Produce Business You Can{' '}
              <span className="bg-gradient-to-r from-secondary via-secondary to-secondary/80 bg-clip-text text-transparent relative inline-block font-extrabold">
                Actually Control
                <span className="absolute bottom-0.5 left-0 w-full h-[3px] bg-gradient-to-r from-tertiary-fixed via-tertiary-fixed-dim to-transparent rounded-full opacity-90" />
              </span>
              .
            </h1>
            <p className="font-body-md text-body-md md:font-body-lg md:text-body-lg text-on-surface-variant leading-relaxed text-[14px]">
              Adezmold helps produce merchants, wholesalers, and distributors establish rigorous financial discipline, reduce
              inventory leakage, enforce staff accountability, and build repeatable operational structures.
            </p>
          </div>
        </div>

        <div className="md:col-start-2 md:row-start-1 md:row-span-2 md:self-center">
          <div className="relative w-full rounded-2xl overflow-hidden metallic-rim p-1 bg-gradient-to-b from-white/80 via-white/40 to-surface-container-high/30 backdrop-blur-md">
            <div className="relative w-full h-52 md:h-80 rounded-xl overflow-hidden bg-primary-container">
              <img
                src={images.hero.src}
                alt={images.hero.alt}
                fetchPriority="high"
                className="w-full h-full object-cover transform scale-[1.02] hover:scale-105 transition-transform duration-700 ease-out"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-primary-container/95 via-primary-container/35 to-transparent flex flex-col justify-end p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-tertiary-fixed pulse-dot shadow-[0_0_8px_rgba(255,215,130,0.8)]" />
                    <span className="font-label-sm text-label-sm tracking-wider uppercase text-tertiary-fixed font-semibold drop-shadow">
                      On-site advisory for produce traders
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-white/80 px-2 py-0.5 rounded-md bg-white/10 backdrop-blur-md border border-white/15">
                    Nigeria
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-space-sm pt-1 md:col-start-1 md:row-start-2 md:self-start">
          <Link
            to="/checklist"
            className="on-dark btn-sheen min-h-[50px] w-full px-space-md bg-primary-container text-surface-container-lowest font-label-lg text-label-lg rounded-xl flex items-center justify-between shadow-[0_8px_20px_-4px_rgba(10,25,47,0.35)] border border-primary-container/80 active:scale-[0.98] transition-all hover:bg-primary-container/95"
          >
            <span className="flex items-center gap-2.5">
              <Icon name="fact_check" className="text-tertiary-fixed text-[20px] drop-shadow-sm" />
              <span className="font-semibold tracking-tight">Get Free Checklist</span>
            </span>
            <span className="px-2.5 py-0.5 rounded-md bg-tertiary-container text-tertiary-fixed font-label-sm text-label-sm uppercase tracking-wider font-bold border border-tertiary-fixed/30 shadow-sm">
              Free PDF
            </span>
          </Link>
          <Link
            to="/services"
            className="group min-h-[48px] w-full px-space-md bg-surface-container-lowest text-on-surface font-label-lg text-label-lg rounded-xl flex items-center justify-between border border-surface-container-high/80 shadow-sm hover:border-secondary/40 active:scale-[0.98] transition-all"
          >
            <span className="flex items-center gap-2.5">
              <Icon name="explore" className="text-secondary text-[20px] transition-transform group-hover:rotate-45" />
              <span className="font-semibold text-on-surface">Explore Our Services</span>
            </span>
            <Icon name="arrow_forward" className="text-secondary text-[20px] transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        <div className="pt-2 md:col-span-2 md:row-start-3">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider font-semibold">
              Core Institutional Pillars
            </h2>
            <span className="text-[11px] text-secondary font-medium tracking-wide">4 Foundations</span>
          </div>
          <ul className="grid grid-cols-2 md:grid-cols-4 gap-space-sm">
            {pillars.map((p) => (
              <li
                key={p.title}
                className="depth-card bg-surface-container-lowest p-3.5 rounded-xl flex items-center gap-3 border border-surface-container-high/50"
              >
                <div className="w-10 h-10 rounded-lg bg-surface-container/70 border border-secondary/10 flex items-center justify-center shrink-0 text-secondary shadow-inner">
                  <Icon name={p.icon} className="text-[22px]" />
                </div>
                <div className="min-w-0">
                  <div className="font-label-sm text-label-sm text-on-surface font-bold truncate">{p.title}</div>
                  <div className="font-body-sm text-body-sm text-on-surface-variant text-[11px] truncate">{p.sub}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Services() {
  return (
    <section aria-labelledby="services-title" className={`${wrap} py-space-lg`}>
      <div className={`${inner} flex flex-col gap-space-md`}>
        <SectionIntro
          id="services-title"
          icon="business_center"
          eyebrow="Advisory Practice"
          title="Core Advisory Services"
          text="Built for produce merchants, perishables haulers, and bulk agricultural distributors."
        />
        <div className="flex flex-col gap-space-md lg:grid lg:grid-cols-3">
          {services.map((s) => {
            const t = tone[s.tone];
            return (
              <article
                key={s.id}
                className="group depth-card bg-surface-container-lowest rounded-2xl border border-surface-container-high/60 overflow-hidden flex flex-col"
              >
                <div className={`h-1 bg-gradient-to-r ${t.bar} to-transparent w-full`} />
                <div className="p-space-md flex flex-col gap-space-sm flex-1">
                  <div className="flex items-start justify-between gap-space-xs">
                    <div className="flex items-center gap-space-sm">
                      <div className={`w-10 h-10 shrink-0 rounded-xl border flex items-center justify-center shadow-sm ${t.iconBox}`}>
                        <Icon name={s.icon} className="text-[24px]" />
                      </div>
                      <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold tracking-tight">{s.title}</h3>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full font-label-sm text-label-sm font-bold border ${t.badge}`}>{s.badge}</span>
                  </div>
                  <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed text-[13.5px]">{s.summary}</p>
                  <div className="bg-surface-container-low/70 rounded-xl p-3 border border-surface-container-high/60 flex flex-col gap-2">
                    <div className="font-label-sm text-label-sm text-on-surface uppercase tracking-wide font-bold text-[11px] flex items-center justify-between">
                      <span>Key Deliverables</span>
                      <span className={`font-medium text-[10px] ${t.tag}`}>{s.tag}</span>
                    </div>
                    <ul className="flex flex-col gap-2">
                      {s.deliverables.map((d) => (
                        <li key={d} className="flex items-start gap-2 font-body-sm text-body-sm text-on-surface-variant">
                          <Icon name="check_circle" className="text-secondary text-[17px] shrink-0 mt-0.5" />
                          <span>{d}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Link
                    to={`/services#${s.id}`}
                    className="mt-auto min-h-[44px] flex items-center justify-between text-secondary font-label-md text-label-md pt-1 font-bold group-hover:text-secondary/80 transition-colors"
                  >
                    <span>{s.cta}</span>
                    <Icon name="arrow_forward" className="text-[18px] transition-transform group-hover:translate-x-1" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Challenges() {
  return (
    <section
      aria-labelledby="challenges-title"
      className={`${wrap} py-space-md bg-gradient-to-b from-surface-container-low via-surface-container-low/80 to-surface border-y border-surface-container-high/50`}
    >
      <div className={`${inner} flex flex-col gap-space-md`}>
        <SectionIntro
          id="challenges-title"
          icon="balance"
          eyebrow="Operational Reality"
          title="Common Challenges vs. Adezmold System"
          text="How day-to-day market pressure becomes a business you can measure and manage."
        />
        <div className="flex flex-col gap-space-sm lg:grid lg:grid-cols-3">
          {challenges.map((c) => (
            <div key={c.code} className="depth-card bg-surface-container-lowest rounded-xl p-space-md border border-surface-container-high/60 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-error-container/70 text-error font-label-sm text-label-sm font-semibold border border-error/20">
                  <span className="font-bold text-[11px]" aria-hidden="true">
                    ✕
                  </span>
                  <span>The Vulnerability</span>
                </div>
                <span className="text-[11px] text-on-surface-variant font-mono">{c.code}</span>
              </div>
              <p className="font-body-md text-body-md text-on-surface font-medium pt-1">{c.problem}</p>
              <div className="h-px bg-surface-container-high/60 my-1" />
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 self-start rounded-full bg-secondary-container text-on-secondary-container font-label-sm text-label-sm font-semibold border border-secondary/20">
                <span className="font-bold text-[11px]" aria-hidden="true">
                  ✓
                </span>
                <span>The Adezmold Control</span>
              </div>
              <p className="font-body-md text-body-md text-on-secondary-container bg-secondary-container/20 p-2.5 rounded-lg border-l-2 border-secondary font-medium text-[13.5px]">
                {c.control}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Process() {
  return (
    <section aria-labelledby="process-title" className={`${wrap} py-space-lg`}>
      <div className="mx-auto w-full max-w-3xl flex flex-col gap-space-md">
        <SectionIntro
          id="process-title"
          icon="conversion_path"
          eyebrow="Methodology"
          title="The 4-Step Advisory Path"
          text="Practical, structured, and carried out where your business actually operates."
        />
        <ol className="relative pl-7 flex flex-col gap-space-md mt-2">
          <div className="absolute left-3.5 top-4 bottom-4 w-[2px] bg-gradient-to-b from-secondary via-secondary to-primary-container" aria-hidden="true" />
          {steps.map((s) => (
            <li key={s.n} className="relative flex flex-col gap-1 bg-surface-container-lowest p-3.5 rounded-xl border border-surface-container-high/60 depth-card">
              <div
                className={`absolute -left-7 top-3.5 w-7 h-7 rounded-full font-bold font-label-sm text-label-sm flex items-center justify-center border-2 border-surface ${
                  s.final
                    ? 'bg-primary-container text-tertiary-fixed shadow-[0_0_10px_rgba(10,25,47,0.5)]'
                    : 'bg-secondary text-on-secondary shadow-[0_0_10px_rgba(27,67,50,0.5)]'
                }`}
                aria-hidden="true"
              >
                {s.n}
              </div>
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                  <span className="sr-only">Step {s.n}: </span>
                  {s.title}
                </h3>
                <span
                  className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                    s.final ? 'bg-tertiary-container text-tertiary-fixed' : 'bg-secondary-container text-on-secondary-container'
                  }`}
                >
                  {s.when}
                </span>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant text-[13.5px] mt-0.5">{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// Hidden while site.features.caseStudies is false. Add only verified results,
// published with the client's written permission.
const caseStudies = [];

function CaseStudies() {
  if (!site.features.caseStudies || caseStudies.length === 0) return null;
  return (
    <section aria-labelledby="cases-title" className={`${wrap} py-space-md`} data-testid="case-studies">
      <div className={`${inner} flex flex-col gap-space-md`}>
        <SectionIntro
          id="cases-title"
          icon="verified"
          eyebrow="Field Validated"
          title="Client Results"
          text="Verified outcomes from Adezmold engagements, shared with client permission."
        />
      </div>
    </section>
  );
}

function ChecklistBanner() {
  const remaining = checklistItemCount - checklistTeaser.length;
  return (
    <section aria-labelledby="checklist-title" className={`${wrap} py-space-md`}>
      <div className="mx-auto w-full max-w-3xl depth-card bg-surface-container-lowest rounded-2xl border border-tertiary-fixed-dim/30 p-space-md flex flex-col gap-space-sm relative overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-tertiary-fixed via-tertiary-fixed-dim to-tertiary-fixed -mt-space-md -mx-space-md mb-2" />
        <div className="inline-flex items-center gap-1.5 self-start px-2.5 py-0.5 rounded-full bg-tertiary-container text-tertiary-fixed font-label-sm text-label-sm font-semibold border border-tertiary-fixed/30 shadow-sm">
          <Icon name="stars" className="text-[16px] text-tertiary-fixed" />
          <span>Free Executive Resource</span>
        </div>
        <h2 id="checklist-title" className="font-headline-md text-headline-md text-on-surface font-bold tracking-tight">
          {checklistTitle}
        </h2>
        <p className="font-body-md text-body-md text-on-surface-variant text-[13.5px] leading-relaxed">
          Find where money slips away between buying, transport, storage, and sales collections before your next shipment.
        </p>
        <div className="bg-surface-container-low/80 p-3 rounded-xl border border-surface-container-high/60 flex flex-col gap-2">
          <ul className="flex flex-col gap-2">
            {checklistTeaser.map((item) => (
              <li key={item} className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface font-medium">
                <Icon name="check_box" className="text-secondary text-[17px]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <div className="font-label-sm text-label-sm text-on-surface-variant italic mt-0.5 text-[11px]">
            + {remaining} more practical checks across {checklistSections.length} areas of your business
          </div>
        </div>
        <Link
          to="/checklist"
          className="btn-sheen min-h-[48px] w-full bg-secondary text-on-secondary font-label-lg text-label-lg rounded-xl flex items-center justify-center gap-2 shadow-md hover:bg-secondary/90 active:scale-[0.98] transition-all font-semibold mt-1"
        >
          <Icon name="download" className="text-[20px]" />
          <span>Download Free Checklist</span>
        </Link>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section aria-labelledby="final-cta-title" className={`${wrap} py-space-lg`}>
      <div className="on-dark mx-auto w-full max-w-3xl depth-card-dark bg-gradient-to-b from-primary-container via-[#0d223f] to-primary-container text-surface-container-lowest rounded-2xl p-space-lg shadow-2xl flex flex-col gap-space-md text-center relative overflow-hidden border border-white/10">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
        <div className="absolute -top-12 -left-12 w-36 h-36 bg-tertiary-fixed/15 rounded-full blur-2xl pointer-events-none" />
        <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-tertiary-fixed/20 to-tertiary-fixed/5 border border-tertiary-fixed/30 text-tertiary-fixed flex items-center justify-center mx-auto shadow-inner">
          <Icon name="handshake" className="text-[30px] drop-shadow" />
        </div>
        <div className="relative flex flex-col gap-space-xs">
          <h2 id="final-cta-title" className="font-headline-lg text-headline-lg text-white font-extrabold tracking-tight">
            Ready to take command of your operations and profit?
          </h2>
          <p className="font-body-md text-body-md text-on-primary-container max-w-sm mx-auto text-[13.5px] leading-relaxed">
            Book a 45-minute confidential discovery session with Adezmold. We look at your structural bottlenecks and outline
            the first safeguards to put in place.
          </p>
        </div>
        <div className="relative flex flex-col gap-space-sm pt-2">
          <Link
            to="/consultation"
            className="min-h-[50px] w-full bg-gradient-to-r from-tertiary-fixed to-tertiary-fixed-dim text-primary-container font-label-lg text-label-lg rounded-xl flex items-center justify-center gap-2 shadow-lg hover:brightness-105 active:scale-[0.98] transition-all font-bold tracking-tight"
          >
            <Icon name="event_available" className="text-[20px]" />
            <span>Book an Executive Consultation</span>
          </Link>
          <div className="flex items-center justify-center gap-1.5 text-surface-container-high/80 font-label-sm text-label-sm text-[11px]">
            <Icon name="lock" className="text-[15px] text-tertiary-fixed" />
            <span>Your business information is handled in confidence.</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <>
      <Hero />
      <LeakageEstimator />
      <Services />
      <Challenges />
      <Process />
      <CaseStudies />
      <ChecklistBanner />
      <FinalCta />
    </>
  );
}
