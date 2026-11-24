import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { SupportContact } from '../../components/SupportContact';
import { SUPPORT } from '../../lib/support';
import { Brand } from '../auth/AuthLayout';

export const LEGAL_EFFECTIVE_DATE = '24 November 2026';

/** Page frame for the privacy policy and terms: readable without signing in. */
export function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link to="/" aria-label="Adezmold BMS home">
            <Brand />
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link className="text-brand-700 hover:underline" to="/privacy">
              Privacy
            </Link>
            <Link className="text-brand-700 hover:underline" to="/terms">
              Terms
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <article className="legal space-y-4 rounded-lg border bg-white p-6 text-sm leading-6 text-slate-700 shadow-sm sm:p-10 [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-slate-900 [&_li]:ml-5 [&_li]:list-disc">
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          <p className="text-xs text-slate-500">Effective {LEGAL_EFFECTIVE_DATE}</p>
          {children}
          <h2>Contact us</h2>
          <p>
            {SUPPORT.operator} ({SUPPORT.rcNumber}) runs Adezmold BMS. For questions about this
            page, or to use any of your rights, contact us:
          </p>
          <SupportContact subject={title} className="justify-start" />
        </article>
      </main>
    </div>
  );
}
