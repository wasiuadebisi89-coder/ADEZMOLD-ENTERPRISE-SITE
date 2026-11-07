import { formatMoney } from '@bms/domain';
import type { Receipt } from './receipt';

/**
 * WhatsApp click-to-chat: a wa.me link opens WhatsApp (app or web) on a chat with the number,
 * with the message typed in and waiting for the user to press Send. Nothing is sent by the
 * system itself, so no WhatsApp Business account or API key is needed.
 */

/** Country calling codes for the countries a company is most likely to be in. */
const CALLING_CODE: Record<string, string> = {
  NG: '234',
  GH: '233',
  KE: '254',
  ZA: '27',
  GB: '44',
  US: '1',
};

/** Local numbers in these countries start with a trunk 0 that the international form drops. */
const TRUNK_ZERO = new Set(['NG', 'GH', 'KE', 'ZA', 'GB']);

/**
 * The number as wa.me wants it: country code and number, digits only, no plus.
 * Accepts +234 803 123 4567, 00234..., 0803 123 4567 (in the company's country) and
 * 803 123 4567. Null when it cannot be read as a phone number.
 */
export function whatsappNumber(raw: string | null | undefined, country = 'NG'): string | null {
  if (!raw) return null;
  // Take the first number when several are written, e.g. "0803... / 0705...".
  const first = raw.split(/[/,;]| or /i)[0]!.trim();
  const international = /^(\+|00)/.test(first);
  let digits = first.replace(/\D/g, '');
  if (!international) {
    const code = CALLING_CODE[country.toUpperCase()];
    if (!code) return digits.length >= 8 && digits.length <= 15 ? digits : null;
    if (digits.startsWith(code) && digits.length > code.length + 7) {
      /* already has the country code */
    } else if (TRUNK_ZERO.has(country.toUpperCase()) && digits.startsWith('0')) {
      digits = code + digits.slice(1);
    } else {
      digits = code + digits;
    }
  } else if (first.startsWith('00')) {
    digits = digits.slice(2);
  }
  // Nigeria: +234 then a 10 digit number; a stray trunk 0 after the code is common.
  if (digits.startsWith('2340')) digits = '234' + digits.slice(4);
  if (digits.length < 8 || digits.length > 15) return null;
  if (digits.startsWith('234') && digits.length !== 13) return null;
  return digits;
}

/** The click-to-chat link. With no number WhatsApp asks which chat to send it to. */
export function whatsappLink(number: string | null, text: string): string {
  return `https://wa.me/${number ?? ''}?text=${encodeURIComponent(text)}`;
}

/**
 * A receipt as a chat message: the same rows as the printed receipt, but as ordinary lines
 * (a phone screen is narrower than any receipt roll in a proportional font), with WhatsApp's
 * *bold* for headings and totals.
 */
export function receiptMessage(receipt: Receipt, note?: string | null): string {
  const lines: string[] = [];
  const bold = (t: string) => (t.trim() ? `*${t.trim()}*` : '');
  for (const b of receipt.blocks) {
    switch (b.kind) {
      case 'title':
        lines.push(bold(b.text));
        break;
      case 'center':
        lines.push(b.bold ? bold(b.text) : b.text);
        break;
      case 'text':
        lines.push(b.text);
        break;
      case 'pair': {
        const indented = b.left.startsWith(' ');
        const text = `${indented ? '   ' : ''}${b.left.trim()}: ${b.right}`;
        lines.push(b.bold ? bold(text) : text);
        break;
      }
      case 'item':
        lines.push(`• ${b.name}`, `   ${b.detail.trim()} = ${b.amount}`);
        break;
      case 'rule':
      case 'blank':
        lines.push('');
        break;
    }
  }
  if (note?.trim()) lines.push('', note.trim());
  return tidy(lines);
}

/** Joins lines, with no blank line twice in a row or at either end. */
function tidy(lines: string[]): string {
  const out: string[] = [];
  for (const l of lines.map((x) => x.replace(/\s+$/, ''))) {
    if (l === '' && (out.length === 0 || out[out.length - 1] === '')) continue;
    out.push(l);
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n');
}

export const formatDayMonthYear = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

/** Whole days from one ISO date to another; positive when `to` is later. */
export function daysBetween(from: string, to: string): number {
  const t = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y!, m! - 1, d!);
  };
  return Math.round((t(to) - t(from)) / 86_400_000);
}

export interface OpenInvoiceLine {
  number: string;
  /** The supplier's own invoice number, on purchase invoices. */
  theirNumber?: string | null;
  invoiceDate: string;
  dueDate: string;
  outstandingMinor: number;
}

export interface BankDetailsForMessage {
  bankName: string;
  accountName: string;
  accountNumber: string;
}

export interface BalanceMessageInput {
  companyName: string;
  partyName: string;
  contactName?: string | null;
  partyCode: string;
  currency: string;
  /** Today, as an ISO date. */
  asAt: string;
  /** What is owed on invoices: by the customer to us, or by us to the supplier. */
  balanceMinor: number;
  /** Money on account: a customer's unused payments and credits, or our advance to a supplier. */
  advanceMinor: number;
  /** Open invoices, oldest due first. */
  invoices: OpenInvoiceLine[];
  /** False when the user can see only some of the invoices (their own sales). */
  invoicesComplete: boolean;
  bank?: BankDetailsForMessage | null;
}

function invoiceLine(i: OpenInvoiceLine, asAt: string, currency: string): string {
  const late = daysBetween(i.dueDate, asAt);
  const due =
    late > 0
      ? `due ${formatDayMonthYear(i.dueDate)}, ${late} day${late === 1 ? '' : 's'} overdue`
      : late === 0
        ? 'due today'
        : `due ${formatDayMonthYear(i.dueDate)}`;
  const theirs = i.theirNumber ? ` (your invoice ${i.theirNumber})` : '';
  return `• ${i.number}${theirs} of ${formatDayMonthYear(i.invoiceDate)}: ${formatMoney(
    i.outstandingMinor,
    currency,
  )}, ${due}`;
}

function bankLines(bank: BankDetailsForMessage | null | undefined): string[] {
  if (!bank) return [];
  return [
    bank.bankName,
    `Account name: ${bank.accountName}`,
    `Account number: ${bank.accountNumber}`,
  ];
}

/** A reminder to a customer of what they owe us. */
export function customerReminderMessage(x: BalanceMessageInput): string {
  const m = (v: number) => formatMoney(v, x.currency);
  const lines = [
    `Dear ${x.contactName?.trim() || x.partyName},`,
    '',
    `This is a friendly reminder from *${x.companyName}*. As at ${formatDayMonthYear(
      x.asAt,
    )}, your account (${x.partyCode}) shows *${m(x.balanceMinor)}* outstanding.`,
  ];
  if (x.invoices.length > 0) {
    lines.push('', x.invoicesComplete ? 'Unpaid invoices:' : 'Including these invoices:');
    for (const i of x.invoices) lines.push(invoiceLine(i, x.asAt, x.currency));
  }
  const net = x.balanceMinor - x.advanceMinor;
  if (x.advanceMinor > 0 && x.balanceMinor > 0) {
    lines.push(
      '',
      net > 0
        ? `You also have ${m(x.advanceMinor)} on account, which we will set against it, leaving *${m(net)}* to pay.`
        : `You also have ${m(x.advanceMinor)} on account, which covers it. Nothing more is needed.`,
    );
  }
  if (net > 0) {
    if (x.bank) lines.push('', 'Kindly pay into:', ...bankLines(x.bank));
    lines.push(
      '',
      `Please quote ${x.invoices[0]?.number ?? x.partyCode} as your payment reference. If you have already paid, kindly send us the payment details so we can update your account.`,
    );
  }
  lines.push('', 'Thank you for your business.', x.companyName);
  return tidy(lines);
}

/**
 * A note to a supplier about the balance between us. When we owe them it is a statement for
 * them to check against their records; when they hold our money (an advance not yet used) it
 * is a reminder to deliver against it or pay it back.
 */
export function supplierBalanceMessage(x: BalanceMessageInput): string {
  const m = (v: number) => formatMoney(v, x.currency);
  const lines = [
    `Dear ${x.contactName?.trim() || x.partyName},`,
    '',
    `Statement of account from *${x.companyName}* as at ${formatDayMonthYear(x.asAt)}.`,
  ];
  if (x.balanceMinor > 0) {
    lines.push('', `Our records show *${m(x.balanceMinor)}* owed to you on these invoices:`);
    for (const i of x.invoices) lines.push(invoiceLine(i, x.asAt, x.currency));
  }
  if (x.advanceMinor > 0) {
    lines.push(
      '',
      x.balanceMinor > 0
        ? `We also have *${m(x.advanceMinor)}* paid to you in advance and not yet set against an invoice.`
        : `Our records show *${m(x.advanceMinor)}* paid to you in advance and not yet supplied or invoiced. Kindly let us know when to expect the goods, or refund the amount.`,
    );
    const net = x.advanceMinor - x.balanceMinor;
    if (x.balanceMinor > 0)
      lines.push(
        net >= 0
          ? `That leaves *${m(net)}* in our favour.`
          : `That leaves *${m(-net)}* owed to you.`,
      );
    if (net > 0 && x.bank) lines.push('', 'Refunds can be paid into:', ...bankLines(x.bank));
  }
  if (x.balanceMinor <= 0 && x.advanceMinor <= 0)
    lines.push('', 'Our records show nothing outstanding between us.');
  lines.push(
    '',
    'Kindly confirm this agrees with your records, or let us know of any difference.',
    '',
    'Thank you.',
    x.companyName,
  );
  return tidy(lines);
}
