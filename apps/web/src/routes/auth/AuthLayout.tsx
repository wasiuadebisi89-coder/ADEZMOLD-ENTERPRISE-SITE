import type { ReactNode } from 'react';
import {
  ArrowRight,
  BookOpenCheck,
  Boxes,
  ChartColumn,
  Factory,
  Landmark,
  ShieldCheck,
  ShoppingCart,
  Truck,
} from 'lucide-react';
import { Card } from '../../components/ui/feedback';

/** Modules around the ledger, clockwise from the top. */
const modules = [
  { icon: Truck, label: 'Purchasing' },
  { icon: Boxes, label: 'Stock' },
  { icon: ShoppingCart, label: 'Sales' },
  { icon: ChartColumn, label: 'Reports' },
  { icon: Factory, label: 'Services & production' },
  { icon: BookOpenCheck, label: 'Accounting' },
];

const flow = ['Buy', 'Stock', 'Sell', 'Ledger', 'Reports'];

/** The BMS mark: two colours, teal tile and gold bar. */
export function BmsLogo({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="7" className="fill-brand-700" />
      <text
        x="16"
        y="18.5"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="11"
        fontWeight="700"
        letterSpacing="0.2"
        fill="#fff"
      >
        BMS
      </text>
      <rect x="8" y="22" width="16" height="2.5" rx="1.25" className="fill-gold-400" />
    </svg>
  );
}

function Brand({ inverted = false }: { inverted?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <BmsLogo className={inverted ? 'size-10 rounded-lg ring-2 ring-gold-400/60' : 'size-9'} />
      <span className={`text-lg font-semibold ${inverted ? 'text-white' : 'text-brand-800'}`}>
        Adezmold <span className={inverted ? 'text-gold-400' : 'text-gold-700'}>BMS</span>
      </span>
    </div>
  );
}

/** Hub-and-spoke picture: every module posts into one ledger. */
function ModuleHub() {
  const r = 38;
  const points = modules.map((_, i) => {
    const a = ((-90 + i * 60) * Math.PI) / 180;
    return { x: 50 + r * Math.cos(a), y: 50 + r * Math.sin(a) };
  });
  return (
    <figure className="relative mx-auto aspect-square w-80 shrink-0 xl:w-[22rem]">
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden="true">
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="rgb(255 255 255 / 0.12)"
          strokeWidth="0.4"
        />
        {points.map((p, i) => (
          <line
            key={i}
            x1="50"
            y1="50"
            x2={p.x}
            y2={p.y}
            className="stroke-gold-400"
            strokeOpacity="0.7"
            strokeWidth="0.5"
            strokeDasharray="1.5 1.5"
          />
        ))}
      </svg>
      <div className="absolute top-1/2 left-1/2 flex size-[34%] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-gold-400 text-brand-900 shadow-lg ring-8 ring-gold-400/20">
        <Landmark className="size-7" aria-hidden="true" />
        <span className="mt-1 text-center text-xs leading-tight font-bold">
          One
          <br />
          ledger
        </span>
      </div>
      <ul>
        {modules.map(({ icon: Icon, label }, i) => (
          <li
            key={label}
            className="absolute flex w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center"
            style={{ left: `${points[i]!.x}%`, top: `${points[i]!.y}%` }}
          >
            <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-700 shadow-md ring-2 ring-white/20">
              <Icon className="size-6 text-gold-300" aria-hidden="true" />
            </span>
            <span className="mt-1.5 rounded-md bg-brand-900/90 px-1.5 py-0.5 text-xs leading-tight font-semibold text-white">
              {label}
            </span>
          </li>
        ))}
      </ul>
      <figcaption className="sr-only">
        Purchasing, stock, sales, reports, services and production all post into one accounting
        ledger.
      </figcaption>
    </figure>
  );
}

/** The welcome address and product infographic shown beside every sign-in screen. */
function Welcome() {
  return (
    <section
      aria-label="About Adezmold BMS"
      className="relative hidden overflow-hidden bg-gradient-to-br from-brand-900 to-brand-800 text-white lg:flex lg:w-[55%] lg:flex-col lg:justify-between lg:gap-8 lg:p-10 xl:p-14"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 -right-40 size-[30rem] rounded-full border-[3rem] border-white/5"
      />

      <div className="relative">
        <Brand inverted />
      </div>

      <div className="relative flex flex-col gap-8 2xl:flex-row 2xl:items-center">
        <div className="max-w-lg">
          <p className="text-sm font-semibold tracking-wider text-gold-400 uppercase">
            Business management for growing SMEs
          </p>
          <h2 className="mt-3 text-4xl leading-tight font-bold">
            Welcome to Adezmold&nbsp;<span className="text-gold-400">BMS</span>
          </h2>
          <p className="mt-4 text-base leading-relaxed text-white/85">
            Run your whole business from one place. Every purchase, sale and payment flows into one
            double-entry ledger as it happens, so your figures are always current and your accounts
            are ready when you need them.
          </p>
        </div>
        <ModuleHub />
      </div>

      <div className="relative space-y-5">
        <ol
          aria-label="How your business flows through BMS"
          className="flex flex-wrap items-center gap-2"
        >
          {flow.map((step, i) => (
            <li key={step} className="flex items-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-sm font-semibold ${
                  step === 'Ledger'
                    ? 'bg-gold-400 text-brand-900'
                    : 'bg-white/10 text-white ring-1 ring-white/20'
                }`}
              >
                {step}
              </span>
              {i < flow.length - 1 && (
                <ArrowRight className="size-4 text-gold-400" aria-hidden="true" />
              )}
            </li>
          ))}
        </ol>
        <p className="flex items-center gap-2 text-sm text-white/80">
          <ShieldCheck className="size-5 shrink-0 text-gold-400" aria-hidden="true" />
          Separate data for each company, role-based access and a full audit trail.
        </p>
      </div>
    </section>
  );
}

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh">
      <Welcome />
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-6 lg:hidden">
            <Brand />
            <p className="mt-3 text-sm text-slate-600">
              Welcome to Adezmold BMS: accounting, stock, purchasing, sales and reports for your
              business, in one place.
            </p>
          </div>
          <Card className="border-t-4 border-t-gold-400 p-6 sm:p-8">
            <h1 className="text-xl font-semibold">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </Card>
          {footer && <div className="mt-4 text-center text-sm text-slate-600">{footer}</div>}
        </div>
        <p className="mt-10 text-xs text-slate-500">
          &copy; {new Date().getFullYear()} Adezmold Enterprise. All rights reserved.
        </p>
      </main>
    </div>
  );
}
