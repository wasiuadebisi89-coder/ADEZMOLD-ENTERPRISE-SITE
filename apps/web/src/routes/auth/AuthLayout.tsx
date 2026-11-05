import type { ReactNode } from 'react';
import {
  BookOpenCheck,
  Boxes,
  ChartColumn,
  Factory,
  ShieldCheck,
  ShoppingCart,
  Truck,
} from 'lucide-react';
import { Card } from '../../components/ui/feedback';

const features = [
  {
    icon: BookOpenCheck,
    title: 'Accounting',
    text: 'Double-entry ledger, journals, periods and year-end close.',
  },
  {
    icon: Boxes,
    title: 'Stock',
    text: 'Products, locations, counts and weighted-average costing.',
  },
  {
    icon: Truck,
    title: 'Purchasing',
    text: 'Supplier invoices, goods received and supplier payments.',
  },
  {
    icon: ShoppingCart,
    title: 'Sales',
    text: 'Quotes, invoices, till sales, receipts, returns and refunds.',
  },
  {
    icon: ChartColumn,
    title: 'Reports',
    text: 'Trial balance, financial statements, ageing and valuation.',
  },
  {
    icon: Factory,
    title: 'Services & production',
    text: 'Jobs, work in progress and production orders.',
  },
];

function Brand({ inverted = false }: { inverted?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <img
        src="/favicon.svg"
        alt=""
        className={inverted ? 'size-9 rounded-lg ring-2 ring-white/30' : 'size-8'}
      />
      <span className={`text-lg font-semibold ${inverted ? 'text-white' : 'text-slate-900'}`}>
        Adezmold BMS
      </span>
    </div>
  );
}

/** The welcome address and product write-up shown beside every sign-in screen. */
function Welcome() {
  return (
    <section
      aria-label="About Adezmold BMS"
      className="relative hidden overflow-hidden bg-gradient-to-br from-brand-800 via-brand-700 to-slate-900 text-white lg:flex lg:w-[55%] lg:flex-col lg:justify-between lg:p-12 xl:p-16"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 -right-32 size-[28rem] rounded-full bg-white/5"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 -left-24 size-[32rem] rounded-full bg-brand-600/20"
      />

      <div className="relative">
        <Brand inverted />
      </div>

      <div className="relative max-w-xl py-10">
        <p className="text-sm font-semibold tracking-wider text-brand-100 uppercase">
          Business management for growing SMEs
        </p>
        <h2 className="mt-3 text-4xl leading-tight font-bold xl:text-5xl">
          Welcome to Adezmold&nbsp;BMS
        </h2>
        <p className="mt-5 text-lg leading-relaxed text-white/85">
          Run your whole business from one place. Adezmold BMS brings your books, stock, buying and
          selling together, so every sale, purchase and payment lands in a proper double-entry
          ledger the moment it happens. Your figures are always up to date, and your accounts are
          ready when you need them.
        </p>

        <ul className="mt-10 grid gap-x-6 gap-y-5 sm:grid-cols-2">
          {features.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                <Icon className="size-5 text-brand-100" aria-hidden="true" />
              </span>
              <span>
                <span className="block font-semibold">{title}</span>
                <span className="block text-sm leading-snug text-white/75">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="relative flex items-start gap-3 rounded-xl bg-white/10 p-4 ring-1 ring-white/15">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand-100" aria-hidden="true" />
        <p className="text-sm leading-relaxed text-white/85">
          Each company&rsquo;s data is kept separate, every user works within their role, and every
          posting leaves an audit trail. Built on IFRS for SMEs.
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
          <Card className="p-6 sm:p-8">
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
