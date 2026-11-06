import { describe, expect, it } from 'vitest';
import { chunk, encodeReceipt } from './escpos';
import {
  customerPaymentReceipt,
  layoutReceipt,
  plainMoney,
  saleReceipt,
  supplierPaymentReceipt,
  toPrintable,
  type ReceiptHeader,
} from './receipt';
import type { SalesInvoiceRow, SalesLineRow } from './sales';

const header: ReceiptHeader = {
  tradingName: 'Adezmold',
  legalName: 'ADEZMOLD NIG LTD',
  branchName: 'Head office',
  branchAddress: '12 Allen Avenue, Ikeja, Lagos',
  currency: 'NGN',
  printedAt: '06/11/2026, 09:00',
};

const line = (over: Partial<SalesLineRow> = {}): SalesLineRow => ({
  lineNo: 1,
  productId: 'p1',
  sku: 'RICE-50',
  productName: 'Rice 50kg bag',
  unit: 'bag',
  qtyMilli: 2000,
  listPriceMinor: 100000,
  unitPriceMinor: 100000,
  discountMinor: 0,
  netMinor: 200000,
  taxCodeId: 'vat',
  taxCode: 'VAT',
  taxRateBp: 750,
  taxMinor: 15000,
  grossMinor: 215000,
  costMinor: 120000,
  returnedQtyMilli: 0,
  ...over,
});

const sale = (over: Partial<SalesInvoiceRow> = {}): Omit<SalesInvoiceRow, 'id'> => ({
  number: 'INV-000001',
  kind: 'invoice',
  customerId: null,
  customerName: 'Walk-in customer',
  branchId: 'b1',
  locationId: 'l1',
  invoiceDate: '2026-11-06',
  dueDate: '2026-11-06',
  reference: null,
  memo: null,
  pricesIncludeTax: false,
  lines: [line()],
  netMinor: 200000,
  taxMinor: 15000,
  totalMinor: 215000,
  costMinor: 120000,
  payments: [{ accountId: 'cash', accountName: 'Cash in till', amountMinor: 215000 }],
  paidMinor: 215000,
  creditedMinor: 0,
  status: 'paid',
  creditOverride: null,
  journalId: 'j1',
  postedAt: null as never,
  postedBy: 'u1',
  ...over,
});

const text = (rows: { text: string }[]) => rows.map((r) => r.text);

describe('plainMoney and toPrintable', () => {
  it('groups thousands without a currency symbol', () => {
    expect(plainMoney(123456789, 'NGN')).toBe('1,234,567.89');
    expect(plainMoney(-5, 'NGN')).toBe('-0.05');
    expect(plainMoney(1000, 'JPY')).toBe('1,000');
  });
  it('turns text into the ASCII a thermal printer can print', () => {
    expect(toPrintable('Café — ₦5 · “ok”')).toBe('Cafe - N5 - "ok"');
    expect(toPrintable('汉')).toBe('?');
  });
});

describe('layoutReceipt', () => {
  for (const columns of [32, 48]) {
    it(`never prints past ${columns} columns`, () => {
      const r = saleReceipt(
        sale({
          customerName: 'A customer with an unusually long registered business name Ltd',
          lines: [line({ productName: 'Supercalifragilisticexpialidocious-extra-long-name x' })],
        }),
        header,
      );
      for (const row of layoutReceipt(r, columns)) {
        expect(row.text.length).toBeLessThanOrEqual(row.big ? columns / 2 : columns);
      }
    });
  }

  it('lays out a paid till sale with totals right-aligned', () => {
    const rows = layoutReceipt(saleReceipt(sale(), header, { tenderedMinor: 220000 }), 32);
    const t = text(rows);
    expect(rows[0]).toMatchObject({ text: 'Adezmold', big: true, align: 'center' });
    expect(t).toContain('SALES RECEIPT');
    expect(t).toContain('Rice 50kg bag');
    expect(t).toContain('  2 bag x 1,000.00      2,000.00');
    expect(t).toContain('Subtotal                2,000.00');
    expect(t).toContain('VAT 7.5%                  150.00');
    expect(t).toContain('TOTAL NGN               2,150.00');
    expect(t).toContain('Cash received           2,200.00');
    expect(t).toContain('Change                     50.00');
    expect(t.some((l) => l.startsWith('Balance due'))).toBe(false);
    expect(t.at(-1)).toContain('Printed 06/11/2026');
  });

  it('calls an unpaid sale an invoice and shows what is still owed', () => {
    const t = text(
      layoutReceipt(
        saleReceipt(
          sale({ payments: [], paidMinor: 0, status: 'open', dueDate: '2026-11-20' }),
          header,
        ),
        32,
      ),
    );
    expect(t).toContain('SALES INVOICE');
    expect(t).toContain('Due                   20/11/2026');
    expect(t).toContain('Balance due             2,150.00');
  });

  it('shows tax as included when prices include tax', () => {
    const t = text(
      layoutReceipt(
        saleReceipt(
          sale({
            pricesIncludeTax: true,
            lines: [line({ netMinor: 186047, taxMinor: 13953, grossMinor: 200000 })],
            netMinor: 186047,
            taxMinor: 13953,
            totalMinor: 200000,
            paidMinor: 200000,
          }),
          header,
        ),
        32,
      ),
    );
    expect(t).toContain('  2 bag x 1,000.00      2,000.00');
    expect(t).toContain('Includes VAT 7.5%         139.53');
    expect(t.some((l) => l.startsWith('Subtotal'))).toBe(false);
  });

  it('prints payment receipts and vouchers with their allocations', () => {
    const allocations = [
      {
        invoiceId: 'i',
        invoiceNumber: 'INV-000002',
        amountMinor: 30000,
        journalId: 'j',
        allocatedAt: null as never,
      },
    ];
    const pay = text(
      layoutReceipt(
        customerPaymentReceipt(
          {
            number: 'RCT-000001',
            customerId: 'c',
            customerName: 'Bola Stores',
            branchId: 'b1',
            postingDate: '2026-11-06',
            depositAccountId: 'a',
            depositAccountName: 'GTBank',
            amountMinor: 50000,
            allocatedMinor: 30000,
            reference: null,
            memo: null,
            allocations,
            journalId: 'j',
            postedAt: null as never,
            postedBy: 'u',
          },
          header,
        ),
        48,
      ),
    );
    expect(pay).toContain('PAYMENT RECEIPT');
    expect(pay.find((l) => l.startsWith('  INV-000002'))).toMatch(/300\.00$/);
    expect(pay.find((l) => l.startsWith('Held as credit'))).toMatch(/200\.00$/);

    const voucher = text(
      layoutReceipt(
        supplierPaymentReceipt(
          {
            number: 'PAY-000001',
            supplierId: 's',
            supplierName: 'Lagos Mills Ltd',
            branchId: 'b1',
            postingDate: '2026-11-06',
            paymentAccountId: 'a',
            paymentAccountName: 'Cash',
            amountMinor: 30000,
            allocatedMinor: 30000,
            reference: 'TRF 1234',
            memo: null,
            allocations,
            journalId: 'j',
            postedAt: null as never,
          },
          header,
        ),
        32,
      ),
    );
    expect(voucher).toContain('PAYMENT VOUCHER');
    expect(voucher).toContain('Ref'.padEnd(24) + 'TRF 1234');
    expect(voucher.some((l) => l.startsWith('Advance held'))).toBe(false);
  });
});

describe('encodeReceipt', () => {
  it('initialises, styles, prints each row and feeds before cutting', () => {
    const bytes = encodeReceipt([
      { text: 'Shop', align: 'center', bold: true, big: true },
      { text: 'a', align: 'left', bold: false, big: false },
    ]);
    expect([...bytes.slice(0, 5)]).toEqual([0x1b, 0x40, 0x1b, 0x61, 0]);
    const s = [...bytes];
    const has = (seq: number[]) => s.some((_, i) => seq.every((b, j) => s[i + j] === b));
    expect(has([0x1b, 0x61, 1])).toBe(true); // centre
    expect(has([0x1b, 0x45, 1])).toBe(true); // bold on
    expect(has([0x1d, 0x21, 0x11])).toBe(true); // double size
    expect(has([...'Shop'].map((c) => c.charCodeAt(0)).concat(0x0a))).toBe(true);
    expect(has([0x61, 0x0a])).toBe(true);
    expect([...bytes.slice(-7)]).toEqual([0x1b, 0x64, 4, 0x1d, 0x56, 0x42, 0x00]);
  });

  it('leaves the cut out when asked, and splits into write-sized chunks', () => {
    const bytes = encodeReceipt(
      [{ text: 'x'.repeat(50), align: 'left', bold: false, big: false }],
      {
        cut: false,
      },
    );
    expect([...bytes.slice(-3)]).toEqual([0x1b, 0x64, 4]);
    const parts = chunk(bytes, 20);
    expect(parts.every((p) => p.length <= 20)).toBe(true);
    expect(parts.reduce((n, p) => n + p.length, 0)).toBe(bytes.length);
  });
});
