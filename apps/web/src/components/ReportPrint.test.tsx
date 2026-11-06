import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cssString, pageRule, pdfTitle, PrintButton, useReportPrint } from './ReportPrint';

vi.mock('../lib/company', () => ({
  useCompany: () => ({ company: { legalName: 'ADEZMOLD NIG LTD', tradingName: 'Adezmold' } }),
}));

vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: null }) }));

describe('page setup', () => {
  it('lays the report on A4 with the company and page number in the footer', () => {
    const rule = pageRule({ title: 'Trial balance', subtitle: '' }, 'ADEZMOLD NIG LTD');
    expect(rule).toContain('size: A4 portrait');
    expect(rule).toContain('"ADEZMOLD NIG LTD · Trial balance"');
    expect(rule).toContain('counter(pages)');
    expect(pageRule({ title: 'X', subtitle: '', orientation: 'landscape' }, 'C')).toContain(
      'A4 landscape',
    );
  });

  it('quotes names safely for CSS', () => {
    expect(cssString('A "B" \\ C')).toBe('"A \\"B\\" \\\\ C"');
  });

  it('suggests a file name without characters files cannot hold', () => {
    expect(pdfTitle({ title: 'Profit and loss', subtitle: '' }, 'A/B Ltd', '2026-11-06')).toBe(
      'Profit and loss - A B Ltd - 2026-11-06',
    );
  });
});

function Harness({ ready }: { ready: boolean }) {
  const report = useReportPrint(ready ? { title: 'Balance sheet', subtitle: 'As at' } : null);
  return <PrintButton report={report} />;
}

describe('PrintButton', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('waits for the figures', () => {
    render(<Harness ready={false} />);
    expect(screen.getByRole('button', { name: /print/i })).toBeDisabled();
  });

  it('prints the report as A4 and puts the page back afterwards', async () => {
    document.title = 'BMS';
    let during: { printing?: string; title: string; style?: string } | null = null;
    vi.spyOn(window, 'print').mockImplementation(() => {
      during = {
        printing: document.documentElement.dataset.printing,
        title: document.title,
        style: document.getElementById('report-print-page')?.textContent,
      };
      window.dispatchEvent(new Event('afterprint'));
    });
    render(<Harness ready />);
    await userEvent.click(screen.getByRole('button', { name: /print/i }));
    expect(during).toMatchObject({ printing: 'report' });
    expect(during!.title).toMatch(/^Balance sheet - ADEZMOLD NIG LTD - \d{4}-\d{2}-\d{2}$/);
    expect(during!.style).toContain('A4');
    expect(document.documentElement.dataset.printing).toBeUndefined();
    expect(document.getElementById('report-print-page')).toBeNull();
    expect(document.title).toBe('BMS');
  });
});
