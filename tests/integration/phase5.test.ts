import { randomUUID } from 'node:crypto';
import { AggregateField } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { businessDate } from '@bms/domain';
import type { Caller } from '../../functions/src/lib/command.js';
import {
  addMember,
  call,
  createCompany,
  db,
  expectReason,
  makeUser,
  resetEmulators,
} from './helpers.js';

const TODAY = businessDate(new Date(), 'Africa/Lagos');
const HQ_STORE = 'HQ-store';

let admin: Caller;
let store: Caller;
let accountant: Caller;
let manager: Caller;
let sales: Caller;
let companyId: string;
let rice: string;
let cash: string;
let bank: string;
let vat: string;

const base = () => `companies/${companyId}`;
const doc = async (path: string) => (await db.doc(`${base()}/${path}`).get()).data()!;

async function accountId(subtype: string): Promise<string> {
  const snap = await db.collection(`${base()}/accounts`).where('subtype', '==', subtype).get();
  return snap.docs[0]!.id;
}

async function accountBalance(subtype: string): Promise<number> {
  const agg = await db
    .collection(`${base()}/ledgerEntries`)
    .where('accountId', '==', await accountId(subtype))
    .aggregate({ d: AggregateField.sum('debit'), c: AggregateField.sum('credit') })
    .get();
  return (agg.data().d ?? 0) - (agg.data().c ?? 0);
}

async function stock(productId: string) {
  const snap = await db.doc(`${base()}/stockBalances/${productId}__${HQ_STORE}`).get();
  return { qty: snap.get('qtyMilli') as number, value: snap.get('valueMinor') as number };
}

async function customer(code: string, creditLimit: string, paymentTermsDays = 30) {
  const { customerId } = await call<{ customerId: string }>(
    'customer.create',
    { companyId, code, name: `Customer ${code}`, paymentTermsDays, creditLimit },
    manager,
  );
  return customerId;
}

function sell(
  by: Caller,
  input: {
    customerId?: string;
    lines: Record<string, unknown>[];
    payments?: { accountId: string; amount: string }[];
    creditApprovalId?: string;
  },
  idempotencyKey?: string,
) {
  return call<{ invoiceId: string; number: string; journalId: string }>(
    'salesInvoice.post',
    { companyId, locationId: HQ_STORE, postingDate: TODAY, ...input },
    by,
    idempotencyKey,
  );
}

beforeEach(async () => {
  await resetEmulators();
  admin = await makeUser('owner@example.test');
  store = await makeUser('store@example.test');
  accountant = await makeUser('accounts@example.test');
  manager = await makeUser('manager@example.test');
  sales = await makeUser('sales@example.test');
  ({ companyId } = await createCompany(admin));
  await addMember(companyId, admin, store, ['store_officer']);
  await addMember(companyId, admin, accountant, ['accountant']);
  await addMember(companyId, admin, manager, ['manager']);
  await addMember(companyId, admin, sales, ['sales_officer']);
  ({ productId: rice } = await call<{ productId: string }>(
    'product.create',
    { companyId, sku: 'RICE', name: 'Rice 50kg', unit: 'bag', salePrice: '1000' },
    admin,
  ));
  const { supplierId } = await call<{ supplierId: string }>(
    'supplier.create',
    { companyId, code: 'MILLS', name: 'Lagos Mills', paymentTermsDays: 30 },
    accountant,
  );
  // 10 bags at 600 each
  await call(
    'goodsReceipt.post',
    {
      companyId,
      supplierId,
      locationId: HQ_STORE,
      postingDate: TODAY,
      lines: [{ productId: rice, quantity: '10', unitCost: '600' }],
    },
    store,
  );
  cash = await accountId('cash');
  bank = await accountId('bank');
  ({ taxCodeId: vat } = await call<{ taxCodeId: string }>(
    'taxCode.create',
    { companyId, code: 'VAT', name: 'Value added tax', rate: '7.5' },
    accountant,
  ));
});

describe('S1 tax codes and customers', () => {
  it('stores rates in basis points and keeps codes unique', async () => {
    expect((await doc(`taxCodes/${vat}`)).rateBp).toBe(750);
    await expectReason(
      call('taxCode.create', { companyId, code: 'vat', name: 'Again', rate: '5' }, accountant),
      'code_taken',
    );
    await expectReason(
      call('taxCode.create', { companyId, code: 'X', name: 'Bad', rate: '7.555' }, accountant),
      'validation_failed',
    );
    await expectReason(
      call('taxCode.create', { companyId, code: 'Y', name: 'Sales', rate: '5' }, sales),
      'missing_permission',
    );
  });

  it('lets managers and accountants manage customers, not sales officers', async () => {
    const c = await customer('SHOP', '50000');
    expect(await doc(`customers/${c}`)).toMatchObject({
      code: 'SHOP',
      creditLimitMinor: 5_000_000,
      balanceMinor: 0,
    });
    await expectReason(customer('shop', '0'), 'code_taken');
    await expectReason(
      call(
        'customer.create',
        { companyId, code: 'S2', name: 'Shop 2', paymentTermsDays: 0, creditLimit: '0' },
        sales,
      ),
      'missing_permission',
    );
    await call('customer.update', { companyId, customerId: c, creditLimit: '100' }, accountant);
    expect((await doc(`customers/${c}`)).creditLimitMinor).toBe(10_000);
  });
});

describe('S2 cash sales at the till', () => {
  it('posts revenue, output tax and cost of sales, and takes the goods out of stock', async () => {
    // 3 bags at 1,000 + 7.5% VAT = 3,225.00, paid in cash
    const { invoiceId, journalId } = await sell(sales, {
      lines: [{ productId: rice, quantity: '3', taxCodeId: vat }],
      payments: [{ accountId: cash, amount: '3225' }],
    });
    const inv = await doc(`salesInvoices/${invoiceId}`);
    expect(inv).toMatchObject({
      number: 'SI-000001',
      customerId: null,
      customerName: 'Walk-in customer',
      netMinor: 300_000,
      taxMinor: 22_500,
      totalMinor: 322_500,
      costMinor: 180_000,
      paidMinor: 322_500,
      status: 'paid',
    });
    expect(await stock(rice)).toEqual({ qty: 7000, value: 420_000 });
    expect(await accountBalance('cash')).toBe(322_500);
    expect(await accountBalance('revenue')).toBe(-300_000);
    expect(await accountBalance('outputTax')).toBe(-22_500);
    expect(await accountBalance('cogs')).toBe(180_000);
    expect(await accountBalance('receivable')).toBe(0);
    const journal = await doc(`journals/${journalId}`);
    expect(journal.source).toMatchObject({ type: 'salesInvoice', id: invoiceId });
    const avail = await doc(`stockAvailability/${rice}__${HQ_STORE}`);
    expect(avail.qtyMilli).toBe(7000);
    const moves = await db
      .collection(`${base()}/stockMovements`)
      .where('sourceId', '==', invoiceId)
      .get();
    expect(moves.docs.map((d) => [d.get('movementType'), d.get('qtyMilli')])).toEqual([
      ['sale', -3000],
    ]);
  });

  it('splits payment across cash and bank', async () => {
    await sell(sales, {
      lines: [{ productId: rice, quantity: '2' }],
      payments: [
        { accountId: cash, amount: '500' },
        { accountId: bank, amount: '1500' },
      ],
    });
    expect(await accountBalance('cash')).toBe(50_000);
    expect(await accountBalance('bank')).toBe(150_000);
  });

  it('takes tax out of prices when the company sells tax-inclusive', async () => {
    await call('company.updateSettings', { companyId, pricesIncludeTax: true }, admin);
    const { invoiceId } = await sell(sales, {
      lines: [{ productId: rice, quantity: '1', taxCodeId: vat }],
      payments: [{ accountId: cash, amount: '1000' }],
    });
    // 1,000.00 including 7.5%: tax = 100000 × 750 / 10750 = 6976.74 → 6,977 kobo
    expect(await doc(`salesInvoices/${invoiceId}`)).toMatchObject({
      pricesIncludeTax: true,
      netMinor: 93_023,
      taxMinor: 6_977,
      totalMinor: 100_000,
    });
  });

  it('requires walk-in sales to be paid in full and refuses overpayment', async () => {
    await expectReason(
      sell(sales, {
        lines: [{ productId: rice, quantity: '1' }],
        payments: [{ accountId: cash, amount: '900' }],
      }),
      'walk_in_unpaid',
    );
    await expectReason(
      sell(sales, {
        lines: [{ productId: rice, quantity: '1' }],
        payments: [{ accountId: cash, amount: '1100' }],
      }),
      'over_paid',
    );
    await expectReason(
      sell(sales, {
        lines: [{ productId: rice, quantity: '1' }],
        payments: [{ accountId: await accountId('revenue'), amount: '1000' }],
      }),
      'account_invalid',
    );
    expect(await stock(rice)).toEqual({ qty: 10_000, value: 600_000 });
  });

  it('refuses to sell more than is in stock, or from quarantine', async () => {
    await expectReason(
      sell(sales, {
        lines: [{ productId: rice, quantity: '11' }],
        payments: [{ accountId: cash, amount: '11000' }],
      }),
      'insufficient_stock',
    );
    await expectReason(
      call(
        'salesInvoice.post',
        {
          companyId,
          locationId: 'HQ-quarantine',
          postingDate: TODAY,
          lines: [{ productId: rice, quantity: '1' }],
          payments: [{ accountId: cash, amount: '1000' }],
        },
        sales,
      ),
      'location_inactive',
    );
  });

  it('does not sell twice when the same request is retried', async () => {
    const key = randomUUID();
    const input = {
      lines: [{ productId: rice, quantity: '1' }],
      payments: [{ accountId: cash, amount: '1000' }],
    };
    const first = await sell(sales, input, key);
    const again = await sell(sales, input, key);
    expect(again).toEqual(first);
    expect(await stock(rice)).toEqual({ qty: 9000, value: 540_000 });
  });
});

describe('S3 prices and discounts', () => {
  it('lets only users with price override change the price or give a discount', async () => {
    await expectReason(
      sell(sales, {
        lines: [{ productId: rice, quantity: '1', unitPrice: '900' }],
        payments: [{ accountId: cash, amount: '900' }],
      }),
      'price_override_not_allowed',
    );
    await expectReason(
      sell(sales, {
        lines: [{ productId: rice, quantity: '1', discount: '50' }],
        payments: [{ accountId: cash, amount: '950' }],
      }),
      'price_override_not_allowed',
    );
    // Typing the list price is not an override.
    await sell(sales, {
      lines: [{ productId: rice, quantity: '1', unitPrice: '1,000.00' }],
      payments: [{ accountId: cash, amount: '1000' }],
    });
    const { invoiceId } = await sell(manager, {
      lines: [{ productId: rice, quantity: '2', unitPrice: '950', discount: '100' }],
      payments: [{ accountId: cash, amount: '1800' }],
    });
    expect((await doc(`salesInvoices/${invoiceId}`)).lines[0]).toMatchObject({
      listPriceMinor: 100_000,
      unitPriceMinor: 95_000,
      discountMinor: 10_000,
      netMinor: 180_000,
    });
  });

  it('needs a price for products without one', async () => {
    await call('product.update', { companyId, productId: rice, salePrice: null }, admin);
    await expectReason(
      sell(manager, {
        lines: [{ productId: rice, quantity: '1' }],
        payments: [{ accountId: cash, amount: '1000' }],
      }),
      'price_required',
    );
  });
});

describe('S4 credit sales and credit limits', () => {
  it('sells on credit within the limit and due after the payment terms', async () => {
    const shop = await customer('SHOP', '5000', 14);
    const { invoiceId } = await sell(sales, {
      customerId: shop,
      lines: [{ productId: rice, quantity: '2' }],
      payments: [{ accountId: cash, amount: '500' }],
    });
    const inv = await doc(`salesInvoices/${invoiceId}`);
    expect(inv).toMatchObject({ totalMinor: 200_000, paidMinor: 50_000, status: 'open' });
    expect(inv.dueDate > TODAY).toBe(true);
    expect((await doc(`customers/${shop}`)).balanceMinor).toBe(150_000);
    expect(await accountBalance('receivable')).toBe(150_000);
    expect(await accountBalance('cash')).toBe(50_000);
  });

  it('blocks a sale over the limit unless a manager approves it', async () => {
    const shop = await customer('SHOP', '1500');
    await sell(sales, { customerId: shop, lines: [{ productId: rice, quantity: '1' }] });
    // Owes 1,000; another 1,000 on credit would make 2,000 > 1,500.
    const err = await expectReason(
      sell(sales, { customerId: shop, lines: [{ productId: rice, quantity: '1' }] }),
      'credit_limit_exceeded',
    );
    expect(err.message).toMatch(/2000\.00.*1500\.00/);

    const { approvalRequestId } = await call<{ approvalRequestId: string }>(
      'approval.request',
      {
        companyId,
        action: 'sales.creditOverride',
        target: { customerId: shop, amount: '1000' },
        reason: 'Regular customer, pays on Friday',
      },
      sales,
    );
    expect((await doc(`approvalRequests/${approvalRequestId}`)).target).toEqual({
      customerId: shop,
      customerName: 'Customer SHOP',
      amountMinor: 100_000,
    });
    await expectReason(
      call(
        'approval.decide',
        { companyId, approvalRequestId, decision: 'approved', reason: 'Looks fine' },
        accountant,
      ),
      'missing_permission',
    );
    await call(
      'approval.decide',
      { companyId, approvalRequestId, decision: 'approved', reason: 'Known customer' },
      manager,
    );
    // The approval covers up to the amount requested, once.
    await expectReason(
      sell(sales, {
        customerId: shop,
        lines: [{ productId: rice, quantity: '2' }],
        creditApprovalId: approvalRequestId,
      }),
      'credit_limit_exceeded',
    );
    const { invoiceId } = await sell(sales, {
      customerId: shop,
      lines: [{ productId: rice, quantity: '1' }],
      creditApprovalId: approvalRequestId,
    });
    expect((await doc(`salesInvoices/${invoiceId}`)).creditOverride).toEqual({
      by: 'approval',
      approvalId: approvalRequestId,
    });
    expect((await doc(`approvalRequests/${approvalRequestId}`)).status).toBe('used');
    await expectReason(
      sell(sales, {
        customerId: shop,
        lines: [{ productId: rice, quantity: '1' }],
        creditApprovalId: approvalRequestId,
      }),
      'credit_limit_exceeded',
    );
    expect((await doc(`customers/${shop}`)).balanceMinor).toBe(200_000);
  });

  it('treats a zero limit as cash only, and lets managers override directly', async () => {
    const cashOnly = await customer('CASH', '0');
    await expectReason(
      sell(sales, { customerId: cashOnly, lines: [{ productId: rice, quantity: '1' }] }),
      'credit_limit_exceeded',
    );
    await sell(sales, {
      customerId: cashOnly,
      lines: [{ productId: rice, quantity: '1' }],
      payments: [{ accountId: cash, amount: '1000' }],
    });
    const { invoiceId } = await sell(manager, {
      customerId: cashOnly,
      lines: [{ productId: rice, quantity: '1' }],
    });
    expect((await doc(`salesInvoices/${invoiceId}`)).creditOverride).toEqual({
      by: 'permission',
      approvalId: null,
    });
  });

  it('counts advances against the limit', async () => {
    const shop = await customer('SHOP', '0');
    await call(
      'customerReceipt.post',
      {
        companyId,
        customerId: shop,
        branchId: 'HQ',
        postingDate: TODAY,
        depositAccountId: cash,
        amount: '1000',
      },
      sales,
    );
    await sell(sales, { customerId: shop, lines: [{ productId: rice, quantity: '1' }] });
  });
});

describe('S5 customer receipts and allocations', () => {
  it('allocates to invoices, keeps the rest as an advance and applies it later', async () => {
    const shop = await customer('SHOP', '10000');
    const a = await sell(sales, { customerId: shop, lines: [{ productId: rice, quantity: '2' }] });
    const b = await sell(sales, { customerId: shop, lines: [{ productId: rice, quantity: '1' }] });
    const { receiptId, number } = await call<{ receiptId: string; number: string }>(
      'customerReceipt.post',
      {
        companyId,
        customerId: shop,
        branchId: 'HQ',
        postingDate: TODAY,
        depositAccountId: bank,
        amount: '2500',
        allocations: [{ invoiceId: a.invoiceId, amount: '2000' }],
      },
      sales,
    );
    expect(number).toBe('CR-000001');
    expect((await doc(`salesInvoices/${a.invoiceId}`)).status).toBe('paid');
    expect(await doc(`customers/${shop}`)).toMatchObject({
      balanceMinor: 100_000,
      advanceMinor: 50_000,
    });
    expect(await accountBalance('receivable')).toBe(100_000);
    expect(await accountBalance('customerAdvance')).toBe(-50_000);

    await expectReason(
      call(
        'customerReceipt.allocate',
        { companyId, receiptId, allocations: [{ invoiceId: b.invoiceId, amount: '600' }] },
        sales,
      ),
      'over_allocated',
    );
    await call(
      'customerReceipt.allocate',
      { companyId, receiptId, allocations: [{ invoiceId: b.invoiceId, amount: '500' }] },
      sales,
    );
    expect(await doc(`customers/${shop}`)).toMatchObject({
      balanceMinor: 50_000,
      advanceMinor: 0,
    });
    expect(await accountBalance('receivable')).toBe(50_000);
    expect(await accountBalance('customerAdvance')).toBe(0);
    expect((await doc(`customerReceipts/${receiptId}`)).allocatedMinor).toBe(250_000);
  });

  it("refuses allocations to another customer's invoices", async () => {
    const shop = await customer('SHOP', '10000');
    const other = await customer('OTHER', '10000');
    const a = await sell(sales, { customerId: other, lines: [{ productId: rice, quantity: '1' }] });
    await expectReason(
      call(
        'customerReceipt.post',
        {
          companyId,
          customerId: shop,
          branchId: 'HQ',
          postingDate: TODAY,
          depositAccountId: cash,
          amount: '1000',
          allocations: [{ invoiceId: a.invoiceId, amount: '1000' }],
        },
        sales,
      ),
      'invoice_not_found',
    );
  });
});

describe('S6 opening balances and access', () => {
  it('records amounts owed before go-live against opening balance equity', async () => {
    const shop = await customer('SHOP', '0');
    await expectReason(
      call(
        'customerOpeningBalance.post',
        {
          companyId,
          customerId: shop,
          branchId: 'HQ',
          asAtDate: TODAY,
          reference: 'OLD-1',
          amount: '7000',
        },
        sales,
      ),
      'missing_permission',
    );
    const { invoiceId } = await call<{ invoiceId: string }>(
      'customerOpeningBalance.post',
      {
        companyId,
        customerId: shop,
        branchId: 'HQ',
        asAtDate: TODAY,
        reference: 'OLD-1',
        amount: '7000',
      },
      accountant,
    );
    expect(await doc(`salesInvoices/${invoiceId}`)).toMatchObject({
      kind: 'opening',
      totalMinor: 700_000,
    });
    expect(await accountBalance('receivable')).toBe(700_000);
    expect(await accountBalance('openingBalanceEquity')).toBe(-700_000);
    expect((await doc(`customers/${shop}`)).balanceMinor).toBe(700_000);
  });

  it('keeps sales officers to their branches', async () => {
    const other = await makeUser('branch@example.test');
    await call('branch.create', { companyId, code: 'IKJ', name: 'Ikeja' }, admin);
    await addMember(companyId, admin, other, ['sales_officer'], ['IKJ']);
    await expectReason(
      sell(other, {
        lines: [{ productId: rice, quantity: '1' }],
        payments: [{ accountId: cash, amount: '1000' }],
      }),
      'branch_not_allowed',
    );
  });

  it('keeps customer balances equal to the receivables and advances accounts', async () => {
    const shop = await customer('SHOP', '100000');
    const other = await customer('OTHER', '100000');
    await sell(sales, { customerId: shop, lines: [{ productId: rice, quantity: '3' }] });
    await sell(sales, {
      customerId: other,
      lines: [{ productId: rice, quantity: '2', taxCodeId: vat }],
      payments: [{ accountId: cash, amount: '150' }],
    });
    await call(
      'customerReceipt.post',
      {
        companyId,
        customerId: other,
        branchId: 'HQ',
        postingDate: TODAY,
        depositAccountId: cash,
        amount: '5000',
      },
      sales,
    );
    const customers = await db.collection(`${base()}/customers`).get();
    const total = (k: string) => customers.docs.reduce((s, d) => s + (d.get(k) as number), 0);
    expect(total('balanceMinor')).toBe(await accountBalance('receivable'));
    expect(total('advanceMinor')).toBe(-(await accountBalance('customerAdvance')));
  });
});
