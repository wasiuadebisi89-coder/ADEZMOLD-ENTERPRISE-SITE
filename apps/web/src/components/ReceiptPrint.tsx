import { doc } from 'firebase/firestore';
import { Bluetooth, Printer, ReceiptText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  bluetoothSupported,
  choosePrinter,
  pairedPrinterName,
  PrinterError,
  sendToPrinter,
} from '../lib/bluetoothPrinter';
import { useCompany } from '../lib/company';
import { encodeReceipt } from '../lib/escpos';
import { db } from '../lib/firebase';
import { useDoc } from '../lib/firestore-hooks';
import {
  layoutReceipt,
  PAPER,
  type PaperWidth,
  type Receipt,
  type ReceiptHeader,
  type ReceiptRowOut,
} from '../lib/receipt';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Dialog } from './ui/dialog';
import { Alert } from './ui/feedback';

const PAPER_KEY = 'bms.receiptPaper';

function savedPaper(): PaperWidth {
  try {
    const v = localStorage.getItem(PAPER_KEY);
    if (v === '58' || v === '80') return v;
  } catch {
    /* storage blocked */
  }
  return '58';
}

/** The receipt as it comes off the printer: monospace rows, double-size title. */
export function ReceiptPaper({
  rows,
  columns,
  className,
}: {
  rows: ReceiptRowOut[];
  columns: number;
  className?: string;
}) {
  return (
    <div
      className={cn('receipt-paper font-mono leading-tight text-black', className)}
      style={{ width: `${columns}ch` }}
      data-testid="receipt-paper"
    >
      {rows.map((r, i) => (
        <div
          key={i}
          className={cn(
            'whitespace-pre',
            r.align === 'center' && 'text-center',
            r.bold && 'font-bold',
            r.big && 'receipt-big',
          )}
        >
          {r.text || ' '}
        </div>
      ))}
    </div>
  );
}

/** Narrow page and nothing else, for the system print dialog. */
function PrintSheet({ rows, paper }: { rows: ReceiptRowOut[]; paper: PaperWidth }) {
  const columns = PAPER[paper].columns;
  // 58 mm rolls print 48 mm wide, 80 mm rolls 72 mm; a monospace glyph is about 0.6em wide.
  const printable = paper === '58' ? 48 : 72;
  const fontMm = printable / columns / 0.6;
  return createPortal(
    <div id="receipt-print" aria-hidden>
      <style>{`
        #receipt-print { display: none; }
        @media print {
          @page { size: ${paper}mm auto; margin: 0; }
          html, body { background: #fff !important; }
          body > *:not(#receipt-print) { display: none !important; }
          #receipt-print { display: block; padding: 2mm ${(Number(paper) - printable) / 2}mm; }
          #receipt-print .receipt-paper { font-size: ${fontMm.toFixed(2)}mm; width: ${printable}mm !important; }
          #receipt-print .receipt-big { font-size: ${(fontMm * 2).toFixed(2)}mm; }
        }
      `}</style>
      <ReceiptPaper rows={rows} columns={columns} />
    </div>,
    document.body,
  );
}

interface BranchDoc {
  name: string;
  address?: string;
}

/** The company and branch lines every receipt starts with. */
export function useReceiptHeader(
  branchId: string,
  medium: ReceiptHeader['medium'] = 'paper',
): ReceiptHeader {
  const { companyId, company } = useCompany();
  const branchRef = useMemo(
    () => (branchId ? doc(db, `companies/${companyId}/branches/${branchId}`) : null),
    [companyId, branchId],
  );
  const branch = useDoc<BranchDoc>(branchRef);
  const [printedAt] = useState(() =>
    new Intl.DateTimeFormat('en-GB', { dateStyle: 'short', timeStyle: 'short' }).format(new Date()),
  );
  return useMemo(
    () => ({
      tradingName: company?.tradingName || company?.legalName || 'Receipt',
      legalName: company?.legalName ?? null,
      branchName: branch.data?.name ?? null,
      branchAddress: branch.data?.address ?? null,
      currency: company?.baseCurrency ?? 'NGN',
      printedAt,
      medium,
    }),
    [company, branch.data, printedAt, medium],
  );
}

export function PrintReceiptButton({
  build,
  branchId,
  title = 'Receipt',
  label = 'Receipt',
}: {
  build: (h: ReceiptHeader) => Receipt;
  branchId: string;
  title?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <ReceiptText className="size-4" aria-hidden /> {label}
      </Button>
      {open && (
        <ReceiptDialog
          build={build}
          branchId={branchId}
          title={title}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ReceiptDialog({
  build,
  branchId,
  title,
  onClose,
}: {
  build: (h: ReceiptHeader) => Receipt;
  branchId: string;
  title: string;
  onClose: () => void;
}) {
  const header = useReceiptHeader(branchId);
  const [paper, setPaperState] = useState<PaperWidth>(savedPaper);
  const [printer, setPrinter] = useState(pairedPrinterName);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const setPaper = (p: PaperWidth) => {
    setPaperState(p);
    try {
      localStorage.setItem(PAPER_KEY, p);
    } catch {
      /* storage blocked */
    }
  };

  const columns = PAPER[paper].columns;
  const rows = useMemo(() => layoutReceipt(build(header), columns), [build, header, columns]);

  const bluetooth = async (change: boolean) => {
    setMessage(null);
    setBusy(true);
    try {
      if (change || !printer) setPrinter(await choosePrinter());
      await sendToPrinter(encodeReceipt(rows));
      setMessage({ tone: 'success', text: `Sent to ${pairedPrinterName()}.` });
    } catch (e) {
      setMessage({
        tone: 'error',
        text: e instanceof PrinterError ? e.message : 'Printing failed. Try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  const canBluetooth = bluetoothSupported();

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description="For portable 58 mm and 80 mm thermal printers."
    >
      <div className="space-y-4">
        <div role="radiogroup" aria-label="Paper width" className="flex gap-2">
          {(Object.keys(PAPER) as PaperWidth[]).map((p) => (
            <Button
              key={p}
              size="sm"
              role="radio"
              aria-checked={paper === p}
              variant={paper === p ? 'primary' : 'secondary'}
              onClick={() => setPaper(p)}
            >
              {PAPER[p].label}
            </Button>
          ))}
        </div>
        <div className="overflow-x-auto rounded-md bg-slate-100 p-3">
          <div className="mx-auto w-fit bg-white p-3 shadow-sm">
            <ReceiptPaper
              rows={rows}
              columns={columns}
              className="text-[11px] [&_.receipt-big]:text-[22px]"
            />
          </div>
        </div>
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        {!canBluetooth && (
          <p className="text-xs text-slate-500">
            Bluetooth printing needs Chrome or Edge on Android or a computer. Use Print to send the
            receipt through this device&apos;s print dialog instead.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canBluetooth && printer && (
            <button
              type="button"
              className="mr-auto text-sm text-brand-700 underline"
              onClick={() => void bluetooth(true)}
              disabled={busy}
            >
              Printer: {printer} (change)
            </button>
          )}
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden /> Print
          </Button>
          {canBluetooth && (
            <Button onClick={() => void bluetooth(false)} loading={busy}>
              <Bluetooth className="size-4" aria-hidden />
              {printer ? 'Print to Bluetooth printer' : 'Connect Bluetooth printer'}
            </Button>
          )}
        </div>
      </div>
      <PrintSheet rows={rows} paper={paper} />
    </Dialog>
  );
}
