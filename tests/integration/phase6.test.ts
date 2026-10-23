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
const HQ_QUARANTINE = 'HQ-quarantine';

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

async function stock(productId: string, locationId = HQ_STORE) {
  const snap = await db.doc(`${base()}/stockBalances/${productId}__${locationId}`).get();
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

type Created = { creditNoteId: string; number: string; status: string; journalId: string | null };

function returnGoods(
  by: Caller,
  invoiceId: string,
  lines: { lineNo: number; quantity: string; condition?: 'resalable' | 'damaged' }[],
  extra: Record<string, unknown> = {},
  idempotencyKey?: string,
) {
  return call<Created>(
    'creditNote.create',
    {
      companyId,
      invoiceId,
      reason: 'Customer brought it back',
      lines: lines.map((l) => ({ condition: 'resalable', ...l })),
      ...extra,
    },
    by,
    idempotencyKey,
  );
}

function refund(
  by: Caller,
  source: { type: 'customerReceipt' | 'creditNote'; id: string },
  amount: string,
) {
  return call<{ refundId: string; number: string; status: string }>(
    'customerRefund.create',
    { companyId, source, accountId: cash, amount, reason: 'Customer asked for the money back' },
    by,
  );
}

async function journalCount() {
  return (await db.collection(`${base()}/journals`).count().get()).data().count;
}

describe('R1 returns on credit sales', () => {
  it('takes goods back at cost and reduces what is owed, revenue and tax', async () => {
    const shop = await customer('SHOP', '5000');
    const sale = await sell(manager, {
      customerId: shop,
      lines: [{ productId: rice, quantity: '2', taxCodeId: vat }],
    });
    const cn = await returnGoods(manager, sale.invoiceId, [{ lineNo: 1, quantity: '1' }]);
    expect(cn.number).toBe('CN-000001');
    expect(cn.status).toBe('posted');

    const note = await doc(`creditNotes/${cn.creditNoteId}`);
    expect(note).toMatchObject({
      netMinor: 100_000,
      taxMinor: 7_500,
      totalMinor: 107_500,
      costMinor: 60_000,
      allocatedMinor: 107_500,
      refundedMinor: 0,
    });
    const invoice = await doc(`salesInvoices/${sale.invoiceId}`);
    expect(invoice.creditedMinor).toBe(107_500);
    expect(invoice.returnedMinor).toBe(107_500);
    expect(invoice.status).toBe('open');
    expect(invoice.lines[0]).toMatchObject({ returnedQtyMilli: 1000, returnedCostMinor: 60_000 });
    expect((await doc(`customers/${shop}`)).balanceMinor).toBe(107_500);

    expect(await stock(rice)).toEqual({ qty: 9000, value: 540_000 });
    expect(await accountBalance('receivable')).toBe(107_500);
    expect(await accountBalance('revenue')).toBe(-100_000);
    expect(await accountBalance('outputTax')).toBe(-7_500);
    expect(await accountBalance('cogs')).toBe(60_000);
    const journal = await doc(`journals/${cn.journalId}`);
    expect(journal.source).toMatchObject({ type: 'creditNote', number: 'CN-000001' });

    const audit = await db
      .collection(`${base()}/auditLogs`)
      .where('entityType', '==', 'creditNote')
      .get();
    expect(audit.size).toBe(1);
  });

  it('never returns more than was sold, and splits partial returns exactly', async () => {
    const shop = await customer('SHOP', '5000');
    const sale = await sell(manager, {
      customerId: shop,
      lines: [{ productId: rice, quantity: '3', taxCodeId: vat }],
    });
    await returnGoods(manager, sale.invoiceId, [{ lineNo: 1, quantity: '1' }]);
    await returnGoods(manager, sale.invoiceId, [{ lineNo: 1, quantity: '1' }]);
    await expectReason(
      returnGoods(manager, sale.invoiceId, [{ lineNo: 1, quantity: '2' }]),
      'over_returned',
    );
    await returnGoods(manager, sale.invoiceId, [{ lineNo: 1, quantity: '1' }]);
    const invoice = await doc(`salesInvoices/${sale.invoiceId}`);
    // Everything came back: the credits add up exactly to the sale.
    expect(invoice.lines[0].returnedNetMinor).toBe(invoice.lines[0].netMinor);
    expect(invoice.lines[0].returnedTaxMinor).toBe(invoice.lines[0].taxMinor);
    expect(invoice.creditedMinor).toBe(invoice.totalMinor);
    expect(invoice.status).toBe('paid');
    expect(await stock(rice)).toEqual({ qty: 10_000, value: 600_000 });
    expect(await accountBalance('receivable')).toBe(0);
    await expectReason(
      returnGoods(manager, sale.invoiceId, [{ lineNo: 2, quantity: '1' }]),
      'line_not_found',
    );
  });

  it('does not return twice when the same request is retried', async () => {
    const shop = await customer('SHOP', '5000');
    const sale = await sell(manager, {
      customerId: shop,
      lines: [{ productId: rice, quantity: '2' }],
    });
    const key = randomUUID();
    const a = await returnGoods(manager, sale.invoiceId, [{ lineNo: 1, quantity: '1' }], {}, key);
    const b = await returnGoods(manager, sale.invoiceId, [{ lineNo: 1, quantity: '1' }], {}, key);
    expect(b.creditNoteId).toBe(a.creditNoteId);
    expect((await doc(`salesInvoices/${sale.invoiceId}`)).lines[0].returnedQtyMilli).toBe(1000);
  });

  it('refuses opening balances and other branches', async () => {
    const shop = await customer('SHOP', '5000');
    const { invoiceId } = await call<{ invoiceId: string }>(
      'customerOpeningBalance.post',
      {
        companyId,
        customerId: shop,
        branchId: 'HQ',
        asAtDate: TODAY,
        amount: '500',
        reference: 'Old ledger',
      },
      accountant,
    );
    await expectReason(
      returnGoods(manager, invoiceId, [{ lineNo: 1, quantity: '1' }]),
      'not_returnable',
    );
  });
});

describe('R2 credit kept, applied and refunded', () => {
  it('keeps credit on a paid sale as an advance, then refunds part and applies the rest', async () => {
    const shop = await customer('SHOP', '5000');
    const paid = await sell(manager, {
      customerId: shop,
      lines: [{ productId: rice, quantity: '1' }],
      payments: [{ accountId: cash, amount: '1000' }],
    });
    const cn = await returnGoods(manager, paid.invoiceId, [{ lineNo: 1, quantity: '1' }]);
    expect(await doc(`creditNotes/${cn.creditNoteId}`)).toMatchObject({
      totalMinor: 100_000,
      allocatedMinor: 0,
    });
    expect((await doc(`customers/${shop}`)).advanceMinor).toBe(100_000);
    expect(await accountBalance('customerAdvance')).toBe(-100_000);

    const rf = await refund(accountant, { type: 'creditNote', id: cn.creditNoteId }, '400');
    expect(rf).toMatchObject({ number: 'RF-000001', status: 'posted' });
    expect((await doc(`creditNotes/${cn.creditNoteId}`)).refundedMinor).toBe(40_000);
    expect((await doc(`customers/${shop}`)).advanceMinor).toBe(60_000);
    expect(await accountBalance('customerAdvance')).toBe(-60_000);
    await expectReason(
      refund(accountant, { type: 'creditNote', id: cn.creditNoteId }, '700'),
      'over_refunded',
    );

    const owed = await sell(manager, {
      customerId: shop,
      lines: [{ productId: rice, quantity: '1' }],
    });
    await call(
      'creditNote.allocate',
      {
        companyId,
        creditNoteId: cn.creditNoteId,
        allocations: [{ invoiceId: owed.invoiceId, amount: '600' }],
      },
      accountant,
    );
    expect((await doc(`salesInvoices/${owed.invoiceId}`)).paidMinor).toBe(60_000);
    expect(await doc(`customers/${shop}`)).toMatchObject({ balanceMinor: 40_000, advanceMinor: 0 });
    await expectReason(
      refund(accountant, { type: 'creditNote', id: cn.creditNoteId }, '1'),
      'over_refunded',
    );
  });

  it('refunds an unallocated receipt and counts refunds when it is applied later', async () => {
    const shop = await customer('SHOP', '5000');
    const { receiptId } = await call<{ receiptId: string }>(
      'customerReceipt.post',
      {
        companyId,
        customerId: shop,
        branchId: 'HQ',
        postingDate: TODAY,
        depositAccountId: bank,
        amount: '500',
      },
      accountant,
    );
    await refund(accountant, { type: 'customerReceipt', id: receiptId }, '300');
    expect((await doc(`customerReceipts/${receiptId}`)).refundedMinor).toBe(30_000);
    const owed = await sell(manager, {
      customerId: shop,
      lines: [{ productId: rice, quantity: '1' }],
    });
    await expectReason(
      call(
        'customerReceipt.allocate',
        { companyId, receiptId, allocations: [{ invoiceId: owed.invoiceId, amount: '300' }] },
        accountant,
      ),
      'over_allocated',
    );
  });

  it('pays back only from cash or bank accounts', async () => {
    const shop = await customer('SHOP', '5000');
    const { receiptId } = await call<{ receiptId: string }>(
      'customerReceipt.post',
      {
        companyId,
        customerId: shop,
        branchId: 'HQ',
        postingDate: TODAY,
        depositAccountId: bank,
        amount: '500',
      },
      accountant,
    );
    await expectReason(
      call(
        'customerRefund.create',
        {
          companyId,
          source: { type: 'customerReceipt', id: receiptId },
          accountId: await accountId('revenue'),
          amount: '100',
          reason: 'Wrong account',
        },
        accountant,
      ),
      'account_invalid',
    );
  });
});

describe('R3 walk-in returns', () => {
  it('pays a walk-in customer back at once from the account chosen', async () => {
    const sale = await sell(manager, {
      lines: [{ productId: rice, quantity: '1' }],
      payments: [{ accountId: cash, amount: '1000' }],
    });
    await expectReason(
      returnGoods(manager, sale.invoiceId, [{ lineNo: 1, quantity: '1' }]),
      'refund_account_required',
    );
    const cn = await returnGoods(manager, sale.invoiceId, [{ lineNo: 1, quantity: '1' }], {
      refundAccountId: cash,
    });
    expect(await doc(`creditNotes/${cn.creditNoteId}`)).toMatchObject({
      status: 'posted',
      refundedMinor: 100_000,
      allocatedMinor: 0,
    });
    expect(await accountBalance('cash')).toBe(0);
    expect(await accountBalance('revenue')).toBe(0);
    expect(await accountBalance('customerAdvance')).toBe(0);
    expect(await stock(rice)).toEqual({ qty: 10_000, value: 600_000 });
  });

  it("keeps a customer's credit on their account rather than paying it out", async () => {
    const shop = await customer('SHOP', '5000');
    const sale = await sell(manager, {
      customerId: shop,
      lines: [{ productId: rice, quantity: '1' }],
    });
    await expectReason(
      returnGoods(manager, sale.invoiceId, [{ lineNo: 1, quantity: '1' }], {
        refundAccountId: cash,
      }),
      'refund_account_not_allowed',
    );
  });
});

describe('R4 damaged goods', () => {
  it('go to quarantine at the cost they were sold at', async () => {
    const shop = await customer('SHOP', '5000');
    const sale = await sell(manager, {
      customerId: shop,
      lines: [{ productId: rice, quantity: '2' }],
    });
    const damaged = [{ lineNo: 1, quantity: '1', condition: 'damaged' as const }];
    await expectReason(returnGoods(manager, sale.invoiceId, damaged), 'quarantine_required');
    await expectReason(
      returnGoods(manager, sale.invoiceId, damaged, { quarantineLocationId: HQ_STORE }),
      'location_invalid',
    );
    await returnGoods(manager, sale.invoiceId, damaged, { quarantineLocationId: HQ_QUARANTINE });
    expect(await stock(rice, HQ_QUARANTINE)).toEqual({ qty: 1000, value: 60_000 });
    expect(await stock(rice)).toEqual({ qty: 8000, value: 480_000 });
    expect(await accountBalance('inventory')).toBe(540_000);
    const moves = await db
      .collection(`${base()}/stockMovements`)
      .where('movementType', '==', 'sales_return')
      .get();
    expect(moves.docs.map((d) => d.get('locationId'))).toEqual([HQ_QUARANTINE]);
  });
});

describe('R5 approvals', () => {
  it("holds a sales officer's return until a manager approves it", async () => {
    const sale = await sell(sales, {
      lines: [{ productId: rice, quantity: '2' }],
      payments: [{ accountId: cash, amount: '2000' }],
    });
    const before = await journalCount();
    const cn = await returnGoods(sales, sale.invoiceId, [{ lineNo: 1, quantity: '1' }], {
      refundAccountId: cash,
    });
    expect(cn.status).toBe('pending');
    expect(await journalCount()).toBe(before);
    expect(await stock(rice)).toEqual({ qty: 8000, value: 480_000 });

    const decide = (by: Caller, decision: 'approved' | 'rejected', id = cn.creditNoteId) =>
      call(
        'creditNote.decide',
        { companyId, creditNoteId: id, decision, reason: 'Checked the goods' },
        by,
      );
    await expectReason(decide(sales, 'approved'), 'missing_permission');
    await expectReason(decide(accountant, 'approved'), 'missing_permission');
    await decide(manager, 'approved');
    const note = await doc(`creditNotes/${cn.creditNoteId}`);
    expect(note).toMatchObject({
      status: 'posted',
      decidedBy: manager.uid,
      refundedMinor: 100_000,
    });
    expect(note.postingDate).toBe(TODAY);
    expect(await stock(rice)).toEqual({ qty: 9000, value: 540_000 });
    await expectReason(decide(manager, 'approved'), 'not_pending');

    const second = await returnGoods(sales, sale.invoiceId, [{ lineNo: 1, quantity: '1' }], {
      refundAccountId: cash,
    });
    await decide(manager, 'rejected', second.creditNoteId);
    expect((await doc(`creditNotes/${second.creditNoteId}`)).status).toBe('rejected');
    expect(await stock(rice)).toEqual({ qty: 9000, value: 540_000 });
  });

  it('re-checks a pending return when it is approved', async () => {
    const shop = await customer('SHOP', '5000');
    const sale = await sell(sales, {
      customerId: shop,
      lines: [{ productId: rice, quantity: '1' }],
    });
    const pending = await returnGoods(sales, sale.invoiceId, [{ lineNo: 1, quantity: '1' }]);
    await returnGoods(manager, sale.invoiceId, [{ lineNo: 1, quantity: '1' }]);
    await expectReason(
      call(
        'creditNote.decide',
        { companyId, creditNoteId: pending.creditNoteId, decision: 'approved', reason: 'Checked' },
        manager,
      ),
      'over_returned',
    );
  });

  it("holds a sales officer's refund until a manager approves it, never their own", async () => {
    const shop = await customer('SHOP', '5000');
    const { receiptId } = await call<{ receiptId: string }>(
      'customerReceipt.post',
      {
        companyId,
        customerId: shop,
        branchId: 'HQ',
        postingDate: TODAY,
        depositAccountId: cash,
        amount: '500',
      },
      sales,
    );
    const rf = await refund(sales, { type: 'customerReceipt', id: receiptId }, '200');
    expect(rf.status).toBe('pending');
    expect((await doc(`customers/${shop}`)).advanceMinor).toBe(50_000);

    const decide = (by: Caller) =>
      call(
        'customerRefund.decide',
        { companyId, refundId: rf.refundId, decision: 'approved', reason: 'Agreed' },
        by,
      );
    await expectReason(decide(sales), 'missing_permission');
    await expectReason(decide(accountant), 'missing_permission');
    await decide(manager);
    expect(await doc(`customerRefunds/${rf.refundId}`)).toMatchObject({
      status: 'posted',
      decidedBy: manager.uid,
    });
    expect((await doc(`customers/${shop}`)).advanceMinor).toBe(30_000);
    expect(await accountBalance('cash')).toBe(30_000);

    // Someone who can approve but raised the refund themselves cannot approve it.
    const { roleId } = await call<{ roleId: string }>(
      'role.create',
      {
        companyId,
        name: 'Refund desk',
        description: 'Raises and approves refunds',
        permissions: ['sales.read', 'sales.refund.request', 'sales.refund.approve'],
      },
      admin,
    );
    const desk = await makeUser('desk@example.test');
    await addMember(companyId, admin, desk, [roleId]);
    const own = await refund(desk, { type: 'customerReceipt', id: receiptId }, '100');
    await expectReason(
      call(
        'customerRefund.decide',
        { companyId, refundId: own.refundId, decision: 'approved', reason: 'Mine' },
        desk,
      ),
      'self_approval',
    );
  });
});

describe('R6 ledger stays in step', () => {
  it('keeps customer balances, advances and stock equal to their control accounts', async () => {
    const a = await customer('A', '10000');
    const b = await customer('B', '10000');
    const s1 = await sell(manager, {
      customerId: a,
      lines: [{ productId: rice, quantity: '3', taxCodeId: vat }],
    });
    const s2 = await sell(manager, {
      customerId: b,
      lines: [{ productId: rice, quantity: '2' }],
      payments: [{ accountId: bank, amount: '500' }],
    });
    await returnGoods(manager, s1.invoiceId, [{ lineNo: 1, quantity: '2' }]);
    const cnB = await returnGoods(manager, s2.invoiceId, [{ lineNo: 1, quantity: '2' }]);
    await refund(accountant, { type: 'creditNote', id: cnB.creditNoteId }, '250');
    const customers = await db.collection(`${base()}/customers`).get();
    const sum = (k: string) => customers.docs.reduce((s, d) => s + (d.get(k) as number), 0);
    expect(await accountBalance('receivable')).toBe(sum('balanceMinor'));
    expect(await accountBalance('customerAdvance')).toBe(-sum('advanceMinor'));
    const balances = await db.collection(`${base()}/stockBalances`).get();
    const stockValue = balances.docs.reduce((s, d) => s + (d.get('valueMinor') as number), 0);
    expect(await accountBalance('inventory')).toBe(stockValue);
  });
});

describe('R7 bank reconciliation', () => {
  async function bankEntries() {
    const snap = await db
      .collection(`${base()}/ledgerEntries`)
      .where('accountId', '==', bank)
      .orderBy('postingDate')
      .get();
    return snap.docs.map((d) => d.id);
  }

  const reconcile = (
    by: Caller,
    statementBalance: string,
    entryIds: string[],
    statementDate = TODAY,
  ) =>
    call<{ reconciliationId: string }>(
      'bankReconciliation.complete',
      { companyId, accountId: bank, statementDate, statementBalance, entryIds },
      by,
    );

  it('clears entries that add up to the statement, once each', async () => {
    for (let i = 0; i < 2; i++) {
      await sell(manager, {
        lines: [{ productId: rice, quantity: '1' }],
        payments: [{ accountId: bank, amount: '1000' }],
      });
    }
    const [first, second] = await bankEntries();
    await expectReason(reconcile(sales, '1000', [first!]), 'missing_permission');
    await expectReason(reconcile(accountant, '999', [first!]), 'reconciliation_difference');
    const { reconciliationId } = await reconcile(accountant, '1000', [first!]);
    expect(await doc(`bankStates/${bank}`)).toMatchObject({
      reconciledBalanceMinor: 100_000,
      lastReconciliationId: reconciliationId,
    });
    await expectReason(reconcile(accountant, '2000', [first!, second!]), 'entry_cleared');
    await expectReason(
      reconcile(accountant, '2000', [second!], '2000-01-01'),
      'statement_before_last',
    );
    await reconcile(accountant, '2000', [second!]);
    expect((await doc(`bankStates/${bank}`)).reconciledBalanceMinor).toBe(200_000);
    expect((await db.collection(`${base()}/bankClearings`).get()).size).toBe(2);
  });

  it('only reconciles cash and bank accounts, with entries from that account', async () => {
    await sell(manager, {
      lines: [{ productId: rice, quantity: '1' }],
      payments: [{ accountId: cash, amount: '1000' }],
    });
    const cashEntry = (
      await db.collection(`${base()}/ledgerEntries`).where('accountId', '==', cash).get()
    ).docs[0]!.id;
    await expectReason(reconcile(accountant, '1000', [cashEntry]), 'entry_not_found');
    await expectReason(
      call(
        'bankReconciliation.complete',
        {
          companyId,
          accountId: await accountId('revenue'),
          statementDate: TODAY,
          statementBalance: '0',
          entryIds: [],
        },
        accountant,
      ),
      'account_invalid',
    );
  });
});
