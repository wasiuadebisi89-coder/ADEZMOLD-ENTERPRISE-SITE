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
let oil: string;
let mills: string;

const base = () => `companies/${companyId}`;

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

async function stock(productId: string, locationId = HQ_STORE) {
  const snap = await db.doc(`${base()}/stockBalances/${productId}__${locationId}`).get();
  return { qty: snap.get('qtyMilli') as number, value: snap.get('valueMinor') as number };
}

const doc = async (path: string) => (await db.doc(`${base()}/${path}`).get()).data()!;

async function supplier(code: string, name: string, paymentTermsDays = 30) {
  const { supplierId } = await call<{ supplierId: string }>(
    'supplier.create',
    { companyId, code, name, paymentTermsDays },
    accountant,
  );
  return supplierId;
}

async function receive(
  supplierId: string,
  lines: { productId: string; quantity: string; unitCost: string }[],
) {
  return call<{ goodsReceiptId: string; number: string }>(
    'goodsReceipt.post',
    { companyId, supplierId, locationId: HQ_STORE, postingDate: TODAY, lines },
    store,
  );
}

let invoiceNo = 0;
async function invoice(
  supplierId: string,
  lines: Record<string, unknown>[],
  extra: Record<string, unknown> = {},
) {
  invoiceNo += 1;
  return call<{ invoiceId: string; number: string }>(
    'purchaseInvoice.post',
    {
      companyId,
      supplierId,
      branchId: 'HQ',
      invoiceDate: TODAY,
      supplierInvoiceNo: `INV-${invoiceNo}`,
      lines,
      ...extra,
    },
    accountant,
  );
}

async function adjust(productId: string, quantity: string) {
  const { adjustmentId } = await call<{ adjustmentId: string }>(
    'stockAdjustment.create',
    {
      companyId,
      kind: 'adjustment',
      locationId: HQ_STORE,
      reason: 'Stock used',
      lines: [{ productId, quantity }],
    },
    store,
  );
  await call(
    'stockAdjustment.decide',
    { companyId, adjustmentId, decision: 'approved', reason: 'Checked on the shelf' },
    manager,
  );
}

beforeEach(async () => {
  await resetEmulators();
  invoiceNo = 0;
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
    { companyId, sku: 'RICE', name: 'Rice 50kg', unit: 'bag' },
    admin,
  ));
  ({ productId: oil } = await call<{ productId: string }>(
    'product.create',
    { companyId, sku: 'OIL', name: 'Palm oil', unit: 'l' },
    admin,
  ));
  mills = await supplier('MILLS', 'Lagos Mills Ltd');
});

describe('P1 suppliers', () => {
  it('keeps codes unique and limits who manages suppliers', async () => {
    await expectReason(supplier('mills', 'Another Mills'), 'code_taken');
    await expectReason(
      call('supplier.create', { companyId, code: 'X', name: 'X Ltd', paymentTermsDays: 0 }, store),
      'missing_permission',
    );
    await call(
      'supplier.update',
      { companyId, supplierId: mills, paymentTermsDays: 45, phone: '0800' },
      accountant,
    );
    expect(await doc(`suppliers/${mills}`)).toMatchObject({ paymentTermsDays: 45, phone: '0800' });
  });

  it('an inactive supplier cannot deliver or invoice', async () => {
    await call('supplier.update', { companyId, supplierId: mills, status: 'inactive' }, accountant);
    await expectReason(
      receive(mills, [{ productId: rice, quantity: '1', unitCost: '100' }]),
      'supplier_inactive',
    );
  });
});

describe('P2 goods receipts', () => {
  it('put stock in at the entered cost against GRNI', async () => {
    const r = await receive(mills, [
      { productId: rice, quantity: '10', unitCost: '65000' },
      { productId: oil, quantity: '25.5', unitCost: '1200.50' },
    ]);
    expect(r.number).toBe('GRN-000001');
    expect(await stock(rice)).toEqual({ qty: 10_000, value: 65_000_000 });
    expect(await stock(oil)).toEqual({ qty: 25_500, value: 3_061_275 });
    expect(await accountBalance('inventory')).toBe(68_061_275);
    expect(await accountBalance('grni')).toBe(-68_061_275);
    const grn = await doc(`goodsReceipts/${r.goodsReceiptId}`);
    expect(grn).toMatchObject({ invoiceStatus: 'not_invoiced', totalMinor: 68_061_275 });
    expect((await doc('')).locks.costingMethod).toBe(true);
    const moves = await db
      .collection(`${base()}/stockMovements`)
      .where('sourceId', '==', r.goodsReceiptId)
      .get();
    expect(moves.size).toBe(2);
  });

  it('need receipt permission; sales officers cannot receive', async () => {
    await expectReason(
      call(
        'goodsReceipt.post',
        {
          companyId,
          supplierId: mills,
          locationId: HQ_STORE,
          postingDate: TODAY,
          lines: [{ productId: rice, quantity: '1', unitCost: '1' }],
        },
        sales,
      ),
      'missing_permission',
    );
  });
});

describe('P3 invoices matched to receipts', () => {
  it('clear GRNI, owe the supplier and refuse over-invoicing and duplicates', async () => {
    const r = await receive(mills, [{ productId: rice, quantity: '10', unitCost: '65000' }]);
    const line = { kind: 'receipt', goodsReceiptId: r.goodsReceiptId, lineNo: 1 };
    const inv = await invoice(mills, [{ ...line, quantity: '6', amount: '400000' }]);
    // GRNI for 6 bags is 390,000; the 10,000 difference is all still on hand.
    expect(await stock(rice)).toEqual({ qty: 10_000, value: 66_000_000 });
    expect(await accountBalance('grni')).toBe(-26_000_000);
    expect(await accountBalance('payable')).toBe(-40_000_000);
    const pi = await doc(`purchaseInvoices/${inv.invoiceId}`);
    expect(pi).toMatchObject({ number: 'PI-000001', status: 'open', totalMinor: 40_000_000 });
    expect(pi.dueDate > TODAY).toBe(true);
    expect((await doc(`suppliers/${mills}`)).balanceMinor).toBe(40_000_000);
    expect((await doc(`goodsReceipts/${r.goodsReceiptId}`)).invoiceStatus).toBe('partly_invoiced');

    await expectReason(
      invoice(mills, [{ ...line, quantity: '5', amount: '325000' }]),
      'over_cleared',
    );
    await expectReason(
      call(
        'purchaseInvoice.post',
        {
          companyId,
          supplierId: mills,
          branchId: 'HQ',
          invoiceDate: TODAY,
          supplierInvoiceNo: 'inv- 1',
          lines: [{ ...line, quantity: '1', amount: '65000' }],
        },
        accountant,
      ),
      'duplicate_supplier_invoice',
    );

    await invoice(mills, [{ ...line, quantity: '4', amount: '260000' }]);
    expect(await accountBalance('grni')).toBe(0);
    expect((await doc(`goodsReceipts/${r.goodsReceiptId}`)).invoiceStatus).toBe('invoiced');
  });

  it('sends the share of a price difference for goods already used to cost of sales', async () => {
    const r = await receive(mills, [{ productId: oil, quantity: '10', unitCost: '100' }]);
    await adjust(oil, '-6');
    await invoice(mills, [
      {
        kind: 'receipt',
        goodsReceiptId: r.goodsReceiptId,
        lineNo: 1,
        quantity: '10',
        amount: '1100',
      },
    ]);
    // 100.00 difference: 4 of 10 litres still here → 40.00 to stock, 60.00 to cost of sales.
    expect(await stock(oil)).toEqual({ qty: 4_000, value: 44_000 });
    expect(await accountBalance('cogs')).toBe(6_000);
  });

  it('with FIFO, only the invoiced receipt’s remaining layer is revalued', async () => {
    await call('company.updateSettings', { companyId, costingMethod: 'fifo' }, admin);
    const a = await receive(mills, [{ productId: oil, quantity: '10', unitCost: '100' }]);
    const b = await receive(mills, [{ productId: oil, quantity: '10', unitCost: '200' }]);
    await adjust(oil, '-15'); // all of A, half of B
    await invoice(mills, [
      {
        kind: 'receipt',
        goodsReceiptId: a.goodsReceiptId,
        lineNo: 1,
        quantity: '10',
        amount: '1100',
      },
      {
        kind: 'receipt',
        goodsReceiptId: b.goodsReceiptId,
        lineNo: 1,
        quantity: '10',
        amount: '2100',
      },
    ]);
    // A: nothing left → 100.00 to cost of sales. B: 5 of 10 left → 50.00 to stock, 50.00 COGS.
    expect(await stock(oil)).toEqual({ qty: 5_000, value: 105_000 });
    expect(await accountBalance('cogs')).toBe(15_000);
    const layers = await db
      .collection(`${base()}/costLayers`)
      .where('sourceId', '==', b.goodsReceiptId)
      .get();
    expect(layers.docs[0]!.get('valueRemaining')).toBe(105_000);
  });
});

describe('P4 expenses, input tax and landed costs', () => {
  it('spread a freight charge over a receipt and record tax as entered', async () => {
    const shipper = await supplier('SHIP', 'Fast Freight');
    const r = await receive(mills, [
      { productId: rice, quantity: '3', unitCost: '100' },
      { productId: oil, quantity: '1', unitCost: '100' },
    ]);
    const transport = (await db.collection(`${base()}/accounts`).where('code', '==', '6400').get())
      .docs[0]!.id;
    const inv = await invoice(
      shipper,
      [
        {
          kind: 'landed',
          goodsReceiptId: r.goodsReceiptId,
          description: 'Freight in',
          basis: 'value',
          amount: '40',
        },
        {
          kind: 'expense',
          accountId: transport,
          description: 'Delivery to customer',
          amount: '25',
        },
      ],
      { inputTax: '4.88' },
    );
    expect(await stock(rice)).toEqual({ qty: 3_000, value: 33_000 });
    expect(await stock(oil)).toEqual({ qty: 1_000, value: 11_000 });
    expect(await accountBalance('inputTax')).toBe(488);
    expect(await accountBalance('payable')).toBe(-6_988);
    const pi = await doc(`purchaseInvoices/${inv.invoiceId}`);
    expect(pi.lines[0]).toMatchObject({ kind: 'landed', inventoryMinor: 4_000, cogsMinor: 0 });
    expect(pi.totalMinor).toBe(6_988);
  });

  it('refuses control accounts on expense lines', async () => {
    await expectReason(
      invoice(mills, [
        {
          kind: 'expense',
          accountId: await accountId('inventory'),
          description: 'Sneaky',
          amount: '10',
        },
      ]),
      'account_invalid',
    );
  });
});

describe('P5 payments', () => {
  it('settle invoices, keep the rest as an advance, and apply it later', async () => {
    const bank = await accountId('bank');
    const r = await receive(mills, [{ productId: rice, quantity: '2', unitCost: '1000' }]);
    const inv = await invoice(mills, [
      {
        kind: 'receipt',
        goodsReceiptId: r.goodsReceiptId,
        lineNo: 1,
        quantity: '2',
        amount: '2000',
      },
    ]);
    await expectReason(
      call(
        'supplierPayment.post',
        {
          companyId,
          supplierId: mills,
          branchId: 'HQ',
          postingDate: TODAY,
          paymentAccountId: bank,
          amount: '3000',
          allocations: [{ invoiceId: inv.invoiceId, amount: '2500' }],
        },
        accountant,
      ),
      'over_allocated',
    );
    await expectReason(
      call(
        'supplierPayment.post',
        {
          companyId,
          supplierId: mills,
          branchId: 'HQ',
          postingDate: TODAY,
          paymentAccountId: await accountId('payable'),
          amount: '1',
        },
        accountant,
      ),
      'account_invalid',
    );
    const pay = await call<{ paymentId: string; number: string }>(
      'supplierPayment.post',
      {
        companyId,
        supplierId: mills,
        branchId: 'HQ',
        postingDate: TODAY,
        paymentAccountId: bank,
        amount: '3000',
        allocations: [{ invoiceId: inv.invoiceId, amount: '1500' }],
      },
      accountant,
    );
    expect(pay.number).toBe('SP-000001');
    expect(await accountBalance('bank')).toBe(-300_000);
    expect(await accountBalance('payable')).toBe(-50_000);
    expect(await accountBalance('supplierAdvance')).toBe(150_000);
    expect(await doc(`suppliers/${mills}`)).toMatchObject({
      balanceMinor: 50_000,
      advanceMinor: 150_000,
    });

    await call(
      'supplierPayment.allocate',
      {
        companyId,
        paymentId: pay.paymentId,
        allocations: [{ invoiceId: inv.invoiceId, amount: '500' }],
      },
      accountant,
    );
    expect((await doc(`purchaseInvoices/${inv.invoiceId}`)).status).toBe('paid');
    expect(await accountBalance('payable')).toBe(0);
    expect(await accountBalance('supplierAdvance')).toBe(100_000);
    expect(await doc(`suppliers/${mills}`)).toMatchObject({
      balanceMinor: 0,
      advanceMinor: 100_000,
    });
    expect((await doc(`supplierPayments/${pay.paymentId}`)).allocations).toHaveLength(2);
  });

  it('store officers cannot pay suppliers', async () => {
    await expectReason(
      call(
        'supplierPayment.post',
        {
          companyId,
          supplierId: mills,
          branchId: 'HQ',
          postingDate: TODAY,
          paymentAccountId: await accountId('bank'),
          amount: '1',
        },
        store,
      ),
      'missing_permission',
    );
  });
});

describe('P6 supplier returns', () => {
  it('release GRNI for goods not yet invoiced, with any cost difference to price variance', async () => {
    const a = await receive(mills, [{ productId: oil, quantity: '10', unitCost: '100' }]);
    await receive(mills, [{ productId: oil, quantity: '10', unitCost: '200' }]);
    // Average is 150.00; returning 2 litres of the 100.00 receipt.
    const ret = await call<{ returnId: string; number: string }>(
      'supplierReturn.post',
      {
        companyId,
        supplierId: mills,
        locationId: HQ_STORE,
        postingDate: TODAY,
        reason: 'Leaking drums',
        lines: [{ goodsReceiptId: a.goodsReceiptId, lineNo: 1, quantity: '2' }],
      },
      accountant,
    );
    expect(ret.number).toBe('SR-000001');
    expect(await stock(oil)).toEqual({ qty: 18_000, value: 270_000 });
    expect(await accountBalance('grni')).toBe(-280_000);
    expect(await accountBalance('purchasePriceVariance')).toBe(10_000);
    const grn = await doc(`goodsReceipts/${a.goodsReceiptId}`);
    expect(grn.lines[0].clearedQtyMilli).toBe(2_000);
  });

  it('credit invoiced goods at the invoiced price against that invoice', async () => {
    const r = await receive(mills, [{ productId: rice, quantity: '4', unitCost: '1000' }]);
    const inv = await invoice(mills, [
      {
        kind: 'receipt',
        goodsReceiptId: r.goodsReceiptId,
        lineNo: 1,
        quantity: '4',
        amount: '4400',
      },
    ]);
    const line = { goodsReceiptId: r.goodsReceiptId, lineNo: 1, invoiceId: inv.invoiceId };
    const ret = (quantity: string) =>
      call(
        'supplierReturn.post',
        {
          companyId,
          supplierId: mills,
          locationId: HQ_STORE,
          postingDate: TODAY,
          reason: 'Torn bags',
          lines: [{ ...line, quantity }],
        },
        accountant,
      );
    await ret('1');
    // Credit 1,100.00 at the invoiced price; stock out at 1,100.00 (cost was revalued on invoice).
    expect(await doc(`purchaseInvoices/${inv.invoiceId}`)).toMatchObject({
      creditedMinor: 110_000,
    });
    expect((await doc(`suppliers/${mills}`)).balanceMinor).toBe(330_000);
    expect(await accountBalance('payable')).toBe(-330_000);
    expect(await stock(rice)).toEqual({ qty: 3_000, value: 330_000 });
    await expectReason(ret('4'), 'over_returned');
  });

  it('refuses a credit larger than what is still owed on the invoice', async () => {
    const r = await receive(mills, [{ productId: rice, quantity: '2', unitCost: '1000' }]);
    const inv = await invoice(mills, [
      {
        kind: 'receipt',
        goodsReceiptId: r.goodsReceiptId,
        lineNo: 1,
        quantity: '2',
        amount: '2000',
      },
    ]);
    await call(
      'supplierPayment.post',
      {
        companyId,
        supplierId: mills,
        branchId: 'HQ',
        postingDate: TODAY,
        paymentAccountId: await accountId('bank'),
        amount: '2000',
        allocations: [{ invoiceId: inv.invoiceId, amount: '2000' }],
      },
      accountant,
    );
    await expectReason(
      call(
        'supplierReturn.post',
        {
          companyId,
          supplierId: mills,
          locationId: HQ_STORE,
          postingDate: TODAY,
          reason: 'Late return',
          lines: [
            {
              goodsReceiptId: r.goodsReceiptId,
              lineNo: 1,
              invoiceId: inv.invoiceId,
              quantity: '1',
            },
          ],
        },
        accountant,
      ),
      'invoice_settled',
    );
    expect(await stock(rice)).toEqual({ qty: 2_000, value: 200_000 });
  });
});

describe('P7 opening balances and branch scope', () => {
  it('records what was owed at go-live against opening balance equity', async () => {
    await call(
      'supplierOpeningBalance.post',
      {
        companyId,
        supplierId: mills,
        branchId: 'HQ',
        asAtDate: TODAY,
        supplierInvoiceNo: 'OLD-77',
        amount: '125000',
      },
      accountant,
    );
    expect(await accountBalance('payable')).toBe(-12_500_000);
    expect(await accountBalance('openingBalanceEquity')).toBe(12_500_000);
    expect((await doc(`suppliers/${mills}`)).balanceMinor).toBe(12_500_000);
  });

  it('branch-scoped staff receive only at their branch', async () => {
    await call('branch.create', { companyId, code: 'IKJ', name: 'Ikeja' }, admin);
    const scoped = await makeUser('ikeja@example.test');
    await addMember(companyId, admin, scoped, ['store_officer'], ['IKJ']);
    await expectReason(
      call(
        'goodsReceipt.post',
        {
          companyId,
          supplierId: mills,
          locationId: HQ_STORE,
          postingDate: TODAY,
          lines: [{ productId: rice, quantity: '1', unitCost: '1' }],
        },
        scoped,
      ),
      'branch_not_allowed',
    );
  });
});

describe('P8 subledgers agree with the ledger', () => {
  it('suppliers, advances, GRNI and stock each equal their control account', async () => {
    const shipper = await supplier('SHIP', 'Fast Freight');
    const bank = await accountId('bank');
    const r1 = await receive(mills, [
      { productId: rice, quantity: '7', unitCost: '333.33' },
      { productId: oil, quantity: '12.5', unitCost: '77.77' },
    ]);
    const r2 = await receive(mills, [{ productId: rice, quantity: '3', unitCost: '350' }]);
    const i1 = await invoice(mills, [
      {
        kind: 'receipt',
        goodsReceiptId: r1.goodsReceiptId,
        lineNo: 1,
        quantity: '5',
        amount: '1700',
      },
      {
        kind: 'receipt',
        goodsReceiptId: r1.goodsReceiptId,
        lineNo: 2,
        quantity: '12.5',
        amount: '950',
      },
    ]);
    await invoice(shipper, [
      {
        kind: 'landed',
        goodsReceiptId: r1.goodsReceiptId,
        description: 'Freight',
        basis: 'quantity',
        amount: '99.99',
      },
    ]);
    await adjust(rice, '-4');
    await call(
      'supplierReturn.post',
      {
        companyId,
        supplierId: mills,
        locationId: HQ_STORE,
        postingDate: TODAY,
        reason: 'Wrong grade',
        lines: [
          { goodsReceiptId: r2.goodsReceiptId, lineNo: 1, quantity: '1' },
          { goodsReceiptId: r1.goodsReceiptId, lineNo: 1, invoiceId: i1.invoiceId, quantity: '1' },
        ],
      },
      accountant,
    );
    await call(
      'supplierPayment.post',
      {
        companyId,
        supplierId: mills,
        branchId: 'HQ',
        postingDate: TODAY,
        paymentAccountId: bank,
        amount: '2000',
        allocations: [{ invoiceId: i1.invoiceId, amount: '1500.01' }],
      },
      accountant,
    );

    const suppliers = await db.collection(`${base()}/suppliers`).get();
    const owed = suppliers.docs.reduce((s, d) => s + (d.get('balanceMinor') as number), 0);
    const advances = suppliers.docs.reduce((s, d) => s + (d.get('advanceMinor') as number), 0);
    expect(await accountBalance('payable')).toBe(-owed);
    expect(await accountBalance('supplierAdvance')).toBe(advances);

    const receipts = await db.collection(`${base()}/goodsReceipts`).get();
    let uninvoiced = 0;
    for (const d of receipts.docs) {
      for (const l of d.get('lines') as { valueMinor: number; clearedValueMinor: number }[]) {
        uninvoiced += l.valueMinor - l.clearedValueMinor;
      }
    }
    expect(await accountBalance('grni')).toBe(-uninvoiced);

    const balances = await db.collection(`${base()}/stockBalances`).get();
    const stockValue = balances.docs.reduce((s, d) => s + (d.get('valueMinor') as number), 0);
    expect(await accountBalance('inventory')).toBe(stockValue);
  });
});
