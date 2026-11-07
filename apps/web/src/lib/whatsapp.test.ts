import { describe, expect, it } from 'vitest';
import { goodsReceivedReceipt, saleReceipt, type ReceiptHeader } from './receipt';
import type { ReceiptRow } from './purchasing';
import type { SalesInvoiceRow } from './sales';
import {
  customerReminderMessage,
  daysBetween,
  receiptMessage,
  supplierBalanceMessage,
  whatsappLink,
  whatsappNumber,
  type BalanceMessageInput,
} from './whatsapp';

describe('whatsappNumber', () => {
  it.each([
    ['0803 123 4567', '2348031234567'],
    ['08031234567', '2348031234567'],
    ['803-123-4567', '2348031234567'],
    ['+234 803 123 4567', '2348031234567'],
    ['+234 (0) 803 123 4567', '2348031234567'],
    ['002348031234567', '2348031234567'],
    ['2348031234567', '2348031234567'],
    ['0803 123 4567 / 0705 000 0000', '2348031234567'],
    ['+44 7700 900123', '447700900123'],
  ])('reads %s', (raw, want) => {
    expect(whatsappNumber(raw, 'NG')).toBe(want);
  });

  it.each([null, '', 'none', '12345', '0803 123 45', '+234 803 123 45678'])('refuses %s', (raw) => {
    expect(whatsappNumber(raw, 'NG')).toBeNull();
  });

  it('uses the company country for local numbers', () => {
    expect(whatsappNumber('024 123 4567', 'GH')).toBe('233241234567');
  });
});

describe('whatsappLink', () => {
  it('encodes the message and leaves the chat open to choose without a number', () => {
    expect(whatsappLink('2348031234567', 'Total: ₦1,000 & more')).toBe(
      'https://wa.me/2348031234567?text=Total%3A%20%E2%82%A61%2C000%20%26%20more',
    );
    expect(whatsappLink(null, 'Hi')).toBe('https://wa.me/?text=Hi');
  });
});

const header: ReceiptHeader = {
  tradingName: 'Adezmold',
  legalName: 'ADEZMOLD NIG LTD',
  branchName: 'Head office',
  branchAddress: null,
  currency: 'NGN',
  printedAt: '07/11/2026, 09:00',
  medium: 'message',
};

const sale: Omit<SalesInvoiceRow, 'id'> = {
  number: 'INV-000007',
  kind: 'invoice',
  customerId: 'c1',
  customerName: 'Bola Stores',
  branchId: 'b1',
  locationId: 'l1',
  invoiceDate: '2026-11-07',
  dueDate: '2026-11-21',
  reference: null,
  memo: null,
  pricesIncludeTax: false,
  lines: [
    {
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
      taxCodeId: null,
      taxCode: null,
      taxRateBp: 0,
      taxMinor: 0,
      grossMinor: 200000,
      costMinor: 120000,
      returnedQtyMilli: 0,
    },
  ],
  netMinor: 200000,
  taxMinor: 0,
  totalMinor: 200000,
  costMinor: 120000,
  paidMinor: 50000,
  creditedMinor: 0,
  payments: [{ accountId: 'a1', accountName: '1110 Cash on hand', amountMinor: 50000 }],
  status: 'open',
} as unknown as Omit<SalesInvoiceRow, 'id'>;

describe('receiptMessage', () => {
  it('turns the printed receipt into chat lines without the print time', () => {
    const text = receiptMessage(saleReceipt(sale, header), 'Kindly pay the balance.');
    expect(text).toBe(
      [
        '*Adezmold*',
        'ADEZMOLD NIG LTD',
        'Head office',
        '',
        '*SALES INVOICE*',
        '',
        'No.: INV-000007',
        'Date: 07/11/2026',
        'Customer: Bola Stores',
        'Due: 21/11/2026',
        '',
        '• Rice 50kg bag',
        '   2 bag x 1,000.00 = 2,000.00',
        '',
        'Subtotal: 2,000.00',
        '*TOTAL NGN: 2,000.00*',
        'Paid - Cash on hand: 500.00',
        '*Balance due: 1,500.00*',
        '',
        'Thank you for your patronage',
        '',
        'Kindly pay the balance.',
      ].join('\n'),
    );
    expect(text).not.toContain('Printed');
  });

  it('leaves the signature lines off a goods received note', () => {
    const grn = {
      number: 'GRN-000001',
      supplierName: 'Dangote Flour',
      postingDate: '2026-11-07',
      reference: null,
      memo: null,
      lines: [],
      totalMinor: 0,
    } as unknown as Omit<ReceiptRow, 'id'>;
    expect(receiptMessage(goodsReceivedReceipt(grn, header))).not.toContain('Received by');
    expect(
      goodsReceivedReceipt(grn, { ...header, medium: 'paper' }).blocks.some(
        (b) => b.kind === 'text' && b.text.startsWith('Received by'),
      ),
    ).toBe(true);
  });
});

const base: BalanceMessageInput = {
  companyName: 'Adezmold',
  partyName: 'Bola Stores',
  contactName: 'Mrs Bola',
  partyCode: 'C001',
  currency: 'NGN',
  asAt: '2026-11-07',
  balanceMinor: 250000,
  advanceMinor: 0,
  invoices: [
    {
      number: 'INV-000002',
      invoiceDate: '2026-10-01',
      dueDate: '2026-10-31',
      outstandingMinor: 150000,
    },
    {
      number: 'INV-000007',
      invoiceDate: '2026-11-07',
      dueDate: '2026-11-21',
      outstandingMinor: 100000,
    },
  ],
  invoicesComplete: true,
};

describe('daysBetween', () => {
  it('counts calendar days', () => {
    expect(daysBetween('2026-10-31', '2026-11-07')).toBe(7);
    expect(daysBetween('2026-11-21', '2026-11-07')).toBe(-14);
  });
});

describe('customerReminderMessage', () => {
  it('lists each unpaid invoice, how late it is, and where to pay', () => {
    const text = customerReminderMessage({
      ...base,
      bank: { bankName: 'GTBank', accountName: 'ADEZMOLD NIG LTD', accountNumber: '0123456789' },
    });
    expect(text).toContain('Dear Mrs Bola,');
    expect(text).toContain('your account (C001) shows *₦2,500.00* outstanding');
    expect(text).toContain('• INV-000002 of 01/10/2026: ₦1,500.00, due 31/10/2026, 7 days overdue');
    expect(text).toContain('• INV-000007 of 07/11/2026: ₦1,000.00, due 21/11/2026');
    expect(text).toContain('Kindly pay into:\nGTBank\nAccount name: ADEZMOLD NIG LTD');
    expect(text).toContain('Please quote INV-000002 as your payment reference');
  });

  it('sets money on account against the balance', () => {
    const text = customerReminderMessage({ ...base, advanceMinor: 50000 });
    expect(text).toContain('You also have ₦500.00 on account');
    expect(text).toContain('leaving *₦2,000.00* to pay');
    const covered = customerReminderMessage({ ...base, advanceMinor: 300000 });
    expect(covered).toContain('which covers it');
    expect(covered).not.toContain('payment reference');
  });

  it('says when only some invoices are listed', () => {
    expect(customerReminderMessage({ ...base, invoicesComplete: false })).toContain(
      'Including these invoices:',
    );
  });
});

describe('supplierBalanceMessage', () => {
  const supplier = {
    ...base,
    partyName: 'Dangote Flour',
    contactName: null,
    invoices: [{ ...base.invoices[0]!, theirNumber: 'DF-889' }],
    balanceMinor: 150000,
  };

  it('asks the supplier to confirm what we owe them', () => {
    const text = supplierBalanceMessage(supplier);
    expect(text).toContain('Dear Dangote Flour,');
    expect(text).toContain('Our records show *₦1,500.00* owed to you on these invoices:');
    expect(text).toContain('• INV-000002 (your invoice DF-889) of 01/10/2026');
    expect(text).toContain('Kindly confirm this agrees with your records');
  });

  it('reminds the supplier of an advance they still hold', () => {
    const text = supplierBalanceMessage({
      ...supplier,
      balanceMinor: 0,
      invoices: [],
      advanceMinor: 80000,
    });
    expect(text).toContain('*₦800.00* paid to you in advance and not yet supplied');
    expect(text).toContain('refund the amount');
  });

  it('nets an advance against invoices', () => {
    expect(supplierBalanceMessage({ ...supplier, advanceMinor: 200000 })).toContain(
      'That leaves *₦500.00* in our favour.',
    );
    expect(supplierBalanceMessage({ ...supplier, advanceMinor: 50000 })).toContain(
      'That leaves *₦1,000.00* owed to you.',
    );
  });
});
