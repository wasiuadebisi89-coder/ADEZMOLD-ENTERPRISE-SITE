import { formatQuantity, formatRatePercent, toDecimalString } from '@bms/domain';
import type { UnitCode } from '@bms/domain';
import type { ExpenseRow } from './expenses';
import type { InvoiceRow, PaymentRow, ReceiptRow } from './purchasing';
import type { CustomerReceiptRow, SalesInvoiceRow } from './sales';

/**
 * A receipt for a small thermal printer, described once and laid out as fixed-width
 * text. The same rows feed the on-screen preview, the system print dialog and the
 * ESC/POS bytes sent over Bluetooth, so what the cashier sees is what prints.
 */
export type ReceiptBlock =
  | { kind: 'title'; text: string }
  | { kind: 'center'; text: string; bold?: boolean }
  | { kind: 'text'; text: string }
  | { kind: 'pair'; left: string; right: string; bold?: boolean }
  | { kind: 'item'; name: string; detail: string; amount: string }
  | { kind: 'rule' }
  | { kind: 'blank' };

export interface Receipt {
  blocks: ReceiptBlock[];
}

export interface ReceiptRowOut {
  text: string;
  align: 'left' | 'center';
  bold: boolean;
  /** Double width and height on the printer; half as many characters fit. */
  big: boolean;
}

export const PAPER = {
  '58': { label: '58 mm', columns: 32 },
  '80': { label: '80 mm', columns: 48 },
} as const;
export type PaperWidth = keyof typeof PAPER;

export interface ReceiptHeader {
  tradingName: string;
  legalName?: string | null;
  branchName?: string | null;
  branchAddress?: string | null;
  currency: string;
  /** When the receipt is printed, already formatted. */
  printedAt: string;
  /**
   * paper (the default) for the printer; message for a chat message, which has no print
   * time and no lines to sign on.
   */
  medium?: 'paper' | 'message';
}

const onPaper = (h: ReceiptHeader) => (h.medium ?? 'paper') === 'paper';

/** Thermal printers only know plain ASCII in their default code page. */
export function toPrintable(text: string): string {
  return text
    .replace(/₦/g, 'N')
    .replace(/[‐-―−]/g, '-')
    .replace(/[·•]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s/g, ' ')
    .replace(/[^\x20-\x7e]/g, '?');
}

/** Amount with thousands separators and no symbol, e.g. 1,250.50. */
export function plainMoney(minor: number | bigint, currency: string): string {
  const s = toDecimalString(BigInt(minor), currency);
  const negative = s.startsWith('-');
  const [whole = '0', frac] = (negative ? s.slice(1) : s).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}${frac ? '.' + frac : ''}`;
}

function wrap(text: string, width: number): string[] {
  const clean = toPrintable(text);
  // Keep a leading indent such as the two spaces under an item name.
  const indent = /^ */.exec(clean)![0].slice(0, Math.max(0, width - 1));
  const words = clean.trim().split(' ').filter(Boolean);
  const out: string[] = [];
  let line = indent;
  for (let word of words) {
    while (line.length + (line.trim() ? 1 : 0) + word.length > width) {
      if (line.trim()) {
        out.push(line);
        line = '';
        continue;
      }
      // Nothing on the line yet and the word still does not fit: break the word.
      const room = width - line.length;
      out.push(line + word.slice(0, room));
      line = '';
      word = word.slice(room);
    }
    if (word) line = line.trim() ? `${line} ${word}` : line + word;
  }
  if (line.trim()) out.push(line);
  return out.length ? out : [''];
}

/** Left text and right text on one line; the left wraps when both do not fit. */
function pair(left: string, right: string, width: number): string[] {
  const r = toPrintable(right).slice(0, width);
  const room = width - r.length - 1;
  if (room < 4) return [...wrap(left, width), r.padStart(width)];
  const lines = wrap(left, room);
  const last = lines.pop()!;
  return [...lines, last.padEnd(width - r.length) + r];
}

/** Lays a receipt out as rows that each fit the paper's character width. */
export function layoutReceipt(receipt: Receipt, columns: number): ReceiptRowOut[] {
  const rows: ReceiptRowOut[] = [];
  const add = (text: string, align: 'left' | 'center' = 'left', bold = false, big = false) =>
    rows.push({ text, align, bold, big });
  for (const b of receipt.blocks) {
    switch (b.kind) {
      case 'title': {
        const half = Math.floor(columns / 2);
        const words = toPrintable(b.text).trim();
        if (words.length <= half) add(words, 'center', true, true);
        else for (const l of wrap(b.text, columns)) add(l, 'center', true);
        break;
      }
      case 'center':
        for (const l of wrap(b.text, columns)) add(l, 'center', b.bold ?? false);
        break;
      case 'text':
        for (const l of wrap(b.text, columns)) add(l);
        break;
      case 'pair':
        for (const l of pair(b.left, b.right, columns)) add(l, 'left', b.bold ?? false);
        break;
      case 'item':
        for (const l of wrap(b.name, columns)) add(l);
        for (const l of pair(`  ${b.detail}`, b.amount, columns)) add(l);
        break;
      case 'rule':
        add('-'.repeat(columns));
        break;
      case 'blank':
        add('');
        break;
    }
  }
  return rows;
}

function header(h: ReceiptHeader, title: string): ReceiptBlock[] {
  const blocks: ReceiptBlock[] = [{ kind: 'title', text: h.tradingName }];
  if (h.legalName && h.legalName !== h.tradingName)
    blocks.push({ kind: 'center', text: h.legalName });
  if (h.branchName) blocks.push({ kind: 'center', text: h.branchName });
  if (h.branchAddress) blocks.push({ kind: 'center', text: h.branchAddress });
  blocks.push({ kind: 'rule' }, { kind: 'center', text: title, bold: true }, { kind: 'rule' });
  return blocks;
}

function footer(h: ReceiptHeader, thanks: string | null): ReceiptBlock[] {
  return [
    { kind: 'rule' },
    ...(thanks ? [{ kind: 'center', text: thanks } as const] : []),
    ...(onPaper(h) ? [{ kind: 'center', text: `Printed ${h.printedAt}` } as const] : []),
  ];
}

const formatIsoDate = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const q = (milli: number, unit: UnitCode) => formatQuantity(milli, unit);

/** Ledger codes mean nothing to a customer: "1110 Cash on hand" prints as "Cash on hand". */
const accountLabel = (name: string) => name.replace(/^\d+\s+/, '');

export interface SaleExtras {
  /** Cash handed over at the till, when this receipt is printed straight after the sale. */
  tenderedMinor?: number | null;
}

export function saleReceipt(
  i: Omit<SalesInvoiceRow, 'id'>,
  h: ReceiptHeader,
  extras: SaleExtras = {},
): Receipt {
  const c = h.currency;
  const m = (v: number) => plainMoney(v, c);
  const left = i.totalMinor - i.paidMinor - i.creditedMinor;
  const title =
    i.kind === 'opening' ? 'OPENING BALANCE' : left > 0 ? 'SALES INVOICE' : 'SALES RECEIPT';
  const blocks: ReceiptBlock[] = [
    ...header(h, title),
    { kind: 'pair', left: 'No.', right: i.number },
    { kind: 'pair', left: 'Date', right: formatIsoDate(i.invoiceDate) },
    { kind: 'pair', left: 'Customer', right: i.customerName },
  ];
  if (left > 0) blocks.push({ kind: 'pair', left: 'Due', right: formatIsoDate(i.dueDate) });
  if (i.reference && i.reference !== i.number)
    blocks.push({ kind: 'pair', left: 'Ref', right: i.reference });
  blocks.push({ kind: 'rule' });

  for (const l of i.lines) {
    const amount = i.pricesIncludeTax ? l.grossMinor : l.netMinor;
    blocks.push({
      kind: 'item',
      name: l.productName,
      detail: `${q(l.qtyMilli, l.unit)} ${l.unit} x ${m(l.unitPriceMinor)}`,
      amount: m(amount),
    });
    if (l.discountMinor > 0)
      blocks.push({ kind: 'pair', left: '  Discount', right: `-${m(l.discountMinor)}` });
  }
  blocks.push({ kind: 'rule' });

  const taxes = new Map<string, { rateBp: number; minor: number }>();
  for (const l of i.lines) {
    if (!l.taxCode || l.taxMinor === 0) continue;
    const t = taxes.get(l.taxCode) ?? { rateBp: l.taxRateBp, minor: 0 };
    t.minor += l.taxMinor;
    taxes.set(l.taxCode, t);
  }
  const taxLabel = (code: string, rateBp: number) => `${code} ${formatRatePercent(rateBp)}%`;
  if (i.pricesIncludeTax) {
    blocks.push({ kind: 'pair', left: `TOTAL ${c}`, right: m(i.totalMinor), bold: true });
    for (const [code, t] of taxes)
      blocks.push({
        kind: 'pair',
        left: `Includes ${taxLabel(code, t.rateBp)}`,
        right: m(t.minor),
      });
  } else {
    if (i.lines.length > 0) blocks.push({ kind: 'pair', left: 'Subtotal', right: m(i.netMinor) });
    for (const [code, t] of taxes)
      blocks.push({ kind: 'pair', left: taxLabel(code, t.rateBp), right: m(t.minor) });
    blocks.push({ kind: 'pair', left: `TOTAL ${c}`, right: m(i.totalMinor), bold: true });
  }

  for (const p of i.payments)
    blocks.push({
      kind: 'pair',
      left: `Paid - ${accountLabel(p.accountName)}`,
      right: m(p.amountMinor),
    });
  const tendered = extras.tenderedMinor ?? null;
  if (tendered !== null && tendered > i.paidMinor) {
    blocks.push({ kind: 'pair', left: 'Cash received', right: m(tendered) });
    blocks.push({ kind: 'pair', left: 'Change', right: m(tendered - i.paidMinor), bold: true });
  }
  if ((i.returnedMinor ?? 0) > 0)
    blocks.push({ kind: 'pair', left: 'Credited for returns', right: m(i.returnedMinor ?? 0) });
  if (left > 0) blocks.push({ kind: 'pair', left: 'Balance due', right: m(left), bold: true });
  if (i.memo) blocks.push({ kind: 'blank' }, { kind: 'text', text: i.memo });
  blocks.push(...footer(h, 'Thank you for your patronage'));
  return { blocks };
}

export function customerPaymentReceipt(
  x: Omit<CustomerReceiptRow, 'id'>,
  h: ReceiptHeader,
): Receipt {
  const m = (v: number) => plainMoney(v, h.currency);
  const blocks: ReceiptBlock[] = [
    ...header(h, 'PAYMENT RECEIPT'),
    { kind: 'pair', left: 'No.', right: x.number },
    { kind: 'pair', left: 'Date', right: formatIsoDate(x.postingDate) },
    { kind: 'pair', left: 'Received from', right: x.customerName },
    { kind: 'pair', left: 'Paid into', right: accountLabel(x.depositAccountName) },
  ];
  if (x.reference) blocks.push({ kind: 'pair', left: 'Ref', right: x.reference });
  blocks.push(
    { kind: 'rule' },
    { kind: 'pair', left: `AMOUNT ${h.currency}`, right: m(x.amountMinor), bold: true },
  );
  if (x.allocations.length > 0) {
    blocks.push({ kind: 'blank' }, { kind: 'text', text: 'Applied to' });
    for (const a of x.allocations)
      blocks.push({ kind: 'pair', left: `  ${a.invoiceNumber}`, right: m(a.amountMinor) });
  }
  const unused = x.amountMinor - x.allocatedMinor - (x.refundedMinor ?? 0);
  if (unused > 0) blocks.push({ kind: 'pair', left: 'Held as credit', right: m(unused) });
  if (x.memo) blocks.push({ kind: 'blank' }, { kind: 'text', text: x.memo });
  blocks.push(...footer(h, 'Thank you'));
  return { blocks };
}

export function goodsReceivedReceipt(r: Omit<ReceiptRow, 'id'>, h: ReceiptHeader): Receipt {
  const m = (v: number) => plainMoney(v, h.currency);
  const blocks: ReceiptBlock[] = [
    ...header(h, 'GOODS RECEIVED NOTE'),
    { kind: 'pair', left: 'No.', right: r.number },
    { kind: 'pair', left: 'Date', right: formatIsoDate(r.postingDate) },
    { kind: 'pair', left: 'Supplier', right: r.supplierName },
  ];
  if (r.reference) blocks.push({ kind: 'pair', left: 'Ref', right: r.reference });
  blocks.push({ kind: 'rule' });
  for (const l of r.lines) {
    blocks.push({
      kind: 'item',
      name: `${l.sku} ${l.productName}`,
      detail: `${q(l.qtyMilli, l.unit)} ${l.unit}`,
      amount: m(l.valueMinor),
    });
  }
  blocks.push(
    { kind: 'rule' },
    { kind: 'pair', left: `TOTAL ${h.currency}`, right: m(r.totalMinor), bold: true },
  );
  if (r.memo) blocks.push({ kind: 'blank' }, { kind: 'text', text: r.memo });
  if (onPaper(h))
    blocks.push(
      { kind: 'blank' },
      { kind: 'text', text: 'Received by: ____________' },
      { kind: 'blank' },
      { kind: 'text', text: 'Delivered by: ___________' },
    );
  blocks.push(...footer(h, null));
  return { blocks };
}

export function purchaseInvoiceReceipt(i: Omit<InvoiceRow, 'id'>, h: ReceiptHeader): Receipt {
  const m = (v: number) => plainMoney(v, h.currency);
  const left = i.totalMinor - i.paidMinor - i.creditedMinor;
  const blocks: ReceiptBlock[] = [
    ...header(h, i.kind === 'opening' ? 'SUPPLIER OPENING BALANCE' : 'PURCHASE INVOICE'),
    { kind: 'pair', left: 'No.', right: i.number },
    { kind: 'pair', left: 'Supplier', right: i.supplierName },
    { kind: 'pair', left: 'Their invoice', right: i.supplierInvoiceNo },
    { kind: 'pair', left: 'Date', right: formatIsoDate(i.invoiceDate) },
    { kind: 'pair', left: 'Due', right: formatIsoDate(i.dueDate) },
    { kind: 'rule' },
  ];
  for (const l of i.lines) {
    if (l.qtyMilli !== null && l.unit) {
      blocks.push({
        kind: 'item',
        name: l.description,
        detail: `${q(l.qtyMilli, l.unit)} ${l.unit}`,
        amount: m(l.amountMinor),
      });
    } else blocks.push({ kind: 'pair', left: l.description, right: m(l.amountMinor) });
  }
  blocks.push({ kind: 'rule' });
  if (i.inputTaxMinor > 0) {
    blocks.push({ kind: 'pair', left: 'Subtotal', right: m(i.totalMinor - i.inputTaxMinor) });
    blocks.push({ kind: 'pair', left: 'Input tax', right: m(i.inputTaxMinor) });
  }
  blocks.push({ kind: 'pair', left: `TOTAL ${h.currency}`, right: m(i.totalMinor), bold: true });
  if (i.paidMinor > 0) blocks.push({ kind: 'pair', left: 'Paid', right: m(i.paidMinor) });
  if (i.creditedMinor > 0)
    blocks.push({ kind: 'pair', left: 'Credited', right: m(i.creditedMinor) });
  blocks.push({ kind: 'pair', left: 'Balance', right: m(left), bold: true });
  if (i.memo) blocks.push({ kind: 'blank' }, { kind: 'text', text: i.memo });
  blocks.push(...footer(h, null));
  return { blocks };
}

export function supplierPaymentReceipt(x: Omit<PaymentRow, 'id'>, h: ReceiptHeader): Receipt {
  const m = (v: number) => plainMoney(v, h.currency);
  const blocks: ReceiptBlock[] = [
    ...header(h, 'PAYMENT VOUCHER'),
    { kind: 'pair', left: 'No.', right: x.number },
    { kind: 'pair', left: 'Date', right: formatIsoDate(x.postingDate) },
    { kind: 'pair', left: 'Paid to', right: x.supplierName },
    { kind: 'pair', left: 'Paid from', right: accountLabel(x.paymentAccountName) },
  ];
  if (x.reference) blocks.push({ kind: 'pair', left: 'Ref', right: x.reference });
  blocks.push(
    { kind: 'rule' },
    { kind: 'pair', left: `AMOUNT ${h.currency}`, right: m(x.amountMinor), bold: true },
  );
  if (x.allocations.length > 0) {
    blocks.push({ kind: 'blank' }, { kind: 'text', text: 'Applied to' });
    for (const a of x.allocations)
      blocks.push({ kind: 'pair', left: `  ${a.invoiceNumber}`, right: m(a.amountMinor) });
  }
  const unused = x.amountMinor - x.allocatedMinor;
  if (unused > 0) blocks.push({ kind: 'pair', left: 'Advance held', right: m(unused) });
  if (x.memo) blocks.push({ kind: 'blank' }, { kind: 'text', text: x.memo });
  if (onPaper(h))
    blocks.push({ kind: 'blank' }, { kind: 'text', text: 'Received by: ____________' });
  blocks.push(...footer(h, null));
  return { blocks };
}

export function expenseVoucher(x: Omit<ExpenseRow, 'id'>, h: ReceiptHeader): Receipt {
  const m = (v: number) => plainMoney(v, h.currency);
  const paid = x.mode === 'paid';
  const blocks: ReceiptBlock[] = [
    ...header(h, 'EXPENSE VOUCHER'),
    { kind: 'pair', left: 'No.', right: x.number },
    { kind: 'pair', left: 'Date', right: formatIsoDate(x.expenseDate) },
    { kind: 'pair', left: paid ? 'Paid to' : 'Owed to', right: x.payee },
  ];
  if (paid && x.paymentAccountName)
    blocks.push({ kind: 'pair', left: 'Paid from', right: accountLabel(x.paymentAccountName) });
  if (!paid && x.purchaseInvoiceNumber)
    blocks.push({ kind: 'pair', left: 'Invoice', right: x.purchaseInvoiceNumber });
  if (!paid && x.dueDate)
    blocks.push({ kind: 'pair', left: 'Due', right: formatIsoDate(x.dueDate) });
  if (x.reference) blocks.push({ kind: 'pair', left: 'Ref', right: x.reference });
  blocks.push({ kind: 'rule' });
  for (const l of x.lines)
    blocks.push({ kind: 'pair', left: l.description, right: m(l.amountMinor) });
  blocks.push({ kind: 'rule' });
  if (x.inputTaxMinor > 0) {
    blocks.push({ kind: 'pair', left: 'Subtotal', right: m(x.subtotalMinor) });
    blocks.push({ kind: 'pair', left: 'Input tax', right: m(x.inputTaxMinor) });
  }
  blocks.push({ kind: 'pair', left: `TOTAL ${h.currency}`, right: m(x.totalMinor), bold: true });
  if (x.memo) blocks.push({ kind: 'blank' }, { kind: 'text', text: x.memo });
  if (onPaper(h) && paid)
    blocks.push({ kind: 'blank' }, { kind: 'text', text: 'Received by: ____________' });
  blocks.push(...footer(h, null));
  return { blocks };
}
