import { Printer } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useAuth } from '../lib/auth';
import { useCompany } from '../lib/company';
import { formatDateTime } from '../lib/utils';
import { BmsLogo } from '../routes/auth/AuthLayout';
import { Button } from './ui/button';

/**
 * Printing a report on A4 (or saving it as a PDF from the print dialog).
 *
 * While a report is printed the root element carries `data-printing="report"`; styles.css uses
 * it to hide the app around the report and lay the tables out for paper. The A4 page rule is
 * added only for that print, so other printouts (such as receipts) keep their own page size.
 */
export interface ReportPrintSetup {
  /** The report's name, for example "Trial balance". */
  title: string;
  /** What the figures cover, for example "As at 6 Nov 2026". */
  subtitle: string;
  orientation?: 'portrait' | 'landscape';
}

const STYLE_ID = 'report-print-page';

/** Quotes text for a CSS string. */
export function cssString(text: string): string {
  return `"${text.replace(/[\\"]/g, '\\$&').replace(/[\n\r]+/g, ' ')}"`;
}

/** The @page rule for an A4 report, with the company and page number in the footer. */
export function pageRule(setup: ReportPrintSetup, companyName: string): string {
  return `@page {
  size: A4 ${setup.orientation ?? 'portrait'};
  margin: 14mm 12mm 16mm;
  @bottom-left { content: ${cssString(`${companyName} · ${setup.title}`)}; font: 8pt sans-serif; color: #64748b; }
  @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt sans-serif; color: #64748b; }
}`;
}

/** A file name the browser offers when the report is saved as a PDF. */
export function pdfTitle(setup: ReportPrintSetup, companyName: string, isoDate: string): string {
  return `${setup.title} - ${companyName} - ${isoDate}`.replace(/[\\/:*?"<>|]+/g, ' ');
}

/**
 * Sets the page up for printing this report while it is on screen, whether printed with the
 * button or the browser's own print command. Pass null while the figures are loading.
 */
export function useReportPrint(setup: ReportPrintSetup | null) {
  const { company } = useCompany();
  const companyName = company?.legalName || company?.tradingName || 'Company';
  const [printedAt, setPrintedAt] = useState(() => new Date());
  const latest = useRef<{ setup: ReportPrintSetup | null; companyName: string }>(null);
  useLayoutEffect(() => {
    latest.current = { setup, companyName };
  });

  useEffect(() => {
    const root = document.documentElement;
    let savedTitle: string | null = null;
    const before = () => {
      const current = latest.current;
      if (!current?.setup) return;
      // The letterhead shows the time of printing, so it renders before the page is captured.
      flushSync(() => setPrintedAt(new Date()));
      root.dataset.printing = 'report';
      let style = document.getElementById(STYLE_ID);
      if (!style) {
        style = document.createElement('style');
        style.id = STYLE_ID;
        document.head.appendChild(style);
      }
      style.textContent = pageRule(current.setup, current.companyName);
      if (savedTitle === null) savedTitle = document.title;
      document.title = pdfTitle(
        current.setup,
        current.companyName,
        new Date().toISOString().slice(0, 10),
      );
    };
    const after = () => {
      delete root.dataset.printing;
      document.getElementById(STYLE_ID)?.remove();
      if (savedTitle !== null) document.title = savedTitle;
      savedTitle = null;
    };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
      after();
    };
  }, []);

  return {
    setup,
    printedAt,
    ready: setup !== null,
    print: () => {
      // beforeprint does this too; doing it first covers browsers that fire it late.
      window.dispatchEvent(new Event('beforeprint'));
      window.print();
    },
  };
}

export function PrintButton({ report }: { report: ReturnType<typeof useReportPrint> }) {
  return (
    <Button
      type="button"
      variant="secondary"
      className="sm:ml-auto"
      disabled={!report.ready}
      onClick={report.print}
      data-print-hide
    >
      <Printer className="size-4" aria-hidden /> Print or save PDF
    </Button>
  );
}

/** The letterhead on the printed report. Hidden on screen. */
export function ReportPrintHeader({ report }: { report: ReturnType<typeof useReportPrint> }) {
  const { company, member } = useCompany();
  const { user } = useAuth();
  if (!report.setup) return null;
  const { title, subtitle } = report.setup;
  const by = member?.displayName || user?.email || '';
  return (
    <div
      className="report-print-only mb-5 border-b-2 border-gold-400 pb-3"
      data-testid="print-header"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <BmsLogo className="size-11" />
          <div>
            <p className="text-lg font-bold leading-tight text-slate-900">
              {company?.legalName ?? ''}
            </p>
            {company && company.tradingName && company.tradingName !== company.legalName && (
              <p className="text-xs text-slate-600">Trading as {company.tradingName}</p>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold leading-tight text-brand-800">{title}</p>
          <p className="text-sm text-slate-700">{subtitle}</p>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-slate-500">
        Printed {formatDateTime(report.printedAt)}
        {by && <> by {by}</>} · Amounts in {company?.baseCurrency ?? 'NGN'}
      </p>
    </div>
  );
}
