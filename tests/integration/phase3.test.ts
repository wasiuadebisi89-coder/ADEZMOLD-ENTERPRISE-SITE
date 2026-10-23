import { AggregateField } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
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

let admin: Caller;
let store: Caller;
let manager: Caller;
let companyId: string;
const HQ_STORE = 'HQ-store';

const base = () => `companies/${companyId}`;

async function product(sku: string, unit = 'pcs') {
  const { productId } = await call<{ productId: string }>(
    'product.create',
    { companyId, sku, name: `Product ${sku}`, unit },
    admin,
  );
  return productId;
}

/** Store officer raises, manager approves: the normal two-person flow. */
async function adjust(
  kind: 'adjustment' | 'count' | 'opening',
  lines: { productId: string; quantity: string; unitCost?: string }[],
  locationId = HQ_STORE,
) {
  const { adjustmentId } = await call<{ adjustmentId: string }>(
    'stockAdjustment.create',
    { companyId, kind, locationId, reason: `Test ${kind}`, lines },
    store,
  );
  return call<{ journalId: string | null; value: string; status: string }>(
    'stockAdjustment.decide',
    { companyId, adjustmentId, decision: 'approved', reason: 'Checked on the shelf' },
    manager,
  );
}

async function balance(productId: string, locationId = HQ_STORE) {
  const snap = await db.doc(`${base()}/stockBalances/${productId}__${locationId}`).get();
  return snap.exists ? { qty: snap.get('qtyMilli'), value: snap.get('valueMinor') } : null;
}

async function accountBalance(subtype: string): Promise<number> {
  const acct = await db.collection(`${base()}/accounts`).where('subtype', '==', subtype).get();
  const agg = await db
    .collection(`${base()}/ledgerEntries`)
    .where('accountId', '==', acct.docs[0]!.id)
    .aggregate({ d: AggregateField.sum('debit'), c: AggregateField.sum('credit') })
    .get();
  return (agg.data().d ?? 0) - (agg.data().c ?? 0);
}

beforeEach(async () => {
  await resetEmulators();
  admin = await makeUser('owner@example.test');
  store = await makeUser('store@example.test');
  manager = await makeUser('manager@example.test');
  ({ companyId } = await createCompany(admin));
  await addMember(companyId, admin, store, ['store_officer']);
  await addMember(companyId, admin, manager, ['manager']);
});

describe('I1 locations and catalogue', () => {
  it('gives every branch a store and a quarantine location', async () => {
    await call('branch.create', { companyId, code: 'IKJ', name: 'Ikeja' }, admin);
    const locations = await db.collection(`${base()}/locations`).get();
    expect(locations.docs.map((d) => d.id).sort()).toEqual([
      'HQ-quarantine',
      'HQ-store',
      'IKJ-quarantine',
      'IKJ-store',
    ]);
  });

  it('keeps SKUs unique, checks units and categories, and limits who edits products', async () => {
    await product('CEM-50');
    await expectReason(
      call('product.create', { companyId, sku: 'cem-50', name: 'Again', unit: 'pcs' }, admin),
      'sku_taken',
    );
    await expectReason(
      call(
        'product.create',
        { companyId, sku: 'ROD', name: 'Rod', unit: 'pcs', reorderLevel: '1.5' },
        admin,
      ),
      'invalid_quantity',
    );
    const { categoryId } = await call<{ categoryId: string }>(
      'category.create',
      { companyId, name: 'Building' },
      store,
    );
    await call('category.update', { companyId, categoryId, status: 'inactive' }, store);
    await expectReason(
      call('product.create', { companyId, sku: 'ROD', name: 'Rod', unit: 'm', categoryId }, store),
      'category_invalid',
    );
    const id = await product('SAND', 'kg');
    const p = (await db.doc(`${base()}/products/${id}`).get()).data()!;
    expect(p).toMatchObject({ sku: 'SAND', unit: 'kg', status: 'active', hasMovements: false });

    const sales = await makeUser('sales@example.test');
    await addMember(companyId, admin, sales, ['sales_officer']);
    await expectReason(
      call('product.update', { companyId, productId: id, name: 'Sharp sand' }, sales),
      'missing_permission',
    );
  });
});

describe('I2 opening stock', () => {
  it('needs a second person, then posts stock, movements and the ledger together', async () => {
    const id = await product('CEM-50');
    const { adjustmentId, number } = await call<{ adjustmentId: string; number: string }>(
      'stockAdjustment.create',
      {
        companyId,
        kind: 'opening',
        locationId: HQ_STORE,
        reason: 'Stock at go-live',
        lines: [{ productId: id, quantity: '10', unitCost: '100' }],
      },
      store,
    );
    expect(number).toBe('OST-000001');
    expect(await balance(id)).toBeNull();
    await expectReason(
      call(
        'stockAdjustment.decide',
        { companyId, adjustmentId, decision: 'approved', reason: 'Mine' },
        store,
      ),
      'missing_permission',
    );
    const res = await call<{ journalId: string; value: string }>(
      'stockAdjustment.decide',
      { companyId, adjustmentId, decision: 'approved', reason: 'Counted at go-live' },
      manager,
    );
    expect(res.value).toBe('100000');
    expect(await balance(id)).toEqual({ qty: 10_000, value: 100_000 });

    const journal = (await db.doc(`${base()}/journals/${res.journalId}`).get()).data()!;
    expect(journal).toMatchObject({
      origin: 'system',
      source: { type: 'stockAdjustment', id: adjustmentId, number: 'OST-000001' },
      totalDebit: 100_000,
    });
    expect(journal.lines.map((l: { accountCode: string }) => l.accountCode)).toEqual([
      '1300',
      '3300',
    ]);
    const company = (await db.doc(base()).get()).data()!;
    expect(company.locks.costingMethod).toBe(true);
    expect((await db.doc(`${base()}/products/${id}`).get()).get('hasMovements')).toBe(true);
  });

  it('refuses self-approval, missing costs and a second opening for the same place', async () => {
    const id = await product('CEM-50');
    const { adjustmentId } = await call<{ adjustmentId: string }>(
      'stockAdjustment.create',
      {
        companyId,
        kind: 'opening',
        locationId: HQ_STORE,
        reason: 'Go-live',
        lines: [{ productId: id, quantity: '10', unitCost: '100' }],
      },
      admin,
    );
    await expectReason(
      call(
        'stockAdjustment.decide',
        { companyId, adjustmentId, decision: 'approved', reason: 'Self' },
        admin,
      ),
      'self_approval',
    );
    await expectReason(
      call(
        'stockAdjustment.create',
        {
          companyId,
          kind: 'opening',
          locationId: HQ_STORE,
          reason: 'No cost',
          lines: [{ productId: id, quantity: '10' }],
        },
        store,
      ),
      'cost_required',
    );
    await adjust('opening', [{ productId: id, quantity: '5', unitCost: '100' }]);
    await expectReason(
      adjust('opening', [{ productId: id, quantity: '5', unitCost: '100' }]),
      'opening_after_movements',
    );
  });
});

describe('I3 weighted average costing', () => {
  it('re-averages on additions and values removals at the average', async () => {
    const id = await product('CEM-50');
    await adjust('opening', [{ productId: id, quantity: '10', unitCost: '100' }]);
    await adjust('adjustment', [{ productId: id, quantity: '10', unitCost: '140' }]);
    expect(await balance(id)).toEqual({ qty: 20_000, value: 240_000 });

    const res = await adjust('adjustment', [{ productId: id, quantity: '-5' }]);
    expect(res.value).toBe('-60000');
    expect(await balance(id)).toEqual({ qty: 15_000, value: 180_000 });
    const journal = (await db.doc(`${base()}/journals/${res.journalId}`).get()).data()!;
    expect(journal.lines).toMatchObject([
      { accountCode: '5200', debit: 60_000 },
      { accountCode: '1300', credit: 60_000 },
    ]);
  });

  it('values found stock at the current average when no cost is entered', async () => {
    const id = await product('CEM-50');
    await adjust('opening', [{ productId: id, quantity: '4', unitCost: '250' }]);
    const res = await adjust('adjustment', [{ productId: id, quantity: '2' }]);
    expect(res.value).toBe('50000');
  });

  it('never lets stock go negative; the request stays pending', async () => {
    const id = await product('CEM-50');
    await adjust('opening', [{ productId: id, quantity: '3', unitCost: '10' }]);
    const { adjustmentId } = await call<{ adjustmentId: string }>(
      'stockAdjustment.create',
      {
        companyId,
        kind: 'adjustment',
        locationId: HQ_STORE,
        reason: 'Breakage',
        lines: [{ productId: id, quantity: '-4' }],
      },
      store,
    );
    await expectReason(
      call(
        'stockAdjustment.decide',
        { companyId, adjustmentId, decision: 'approved', reason: 'Looks right' },
        manager,
      ),
      'insufficient_stock',
    );
    expect(await balance(id)).toEqual({ qty: 3000, value: 3000 });
    expect((await db.doc(`${base()}/stockAdjustments/${adjustmentId}`).get()).get('status')).toBe(
      'pending',
    );
  });
});

describe('I4 stock counts', () => {
  it('records the expected quantity at count time and posts the difference', async () => {
    const id = await product('CEM-50');
    const other = await product('ROD-12');
    await adjust('opening', [
      { productId: id, quantity: '15', unitCost: '120' },
      { productId: other, quantity: '7', unitCost: '50' },
    ]);
    const { adjustmentId } = await call<{ adjustmentId: string; number: string }>(
      'stockAdjustment.create',
      {
        companyId,
        kind: 'count',
        locationId: HQ_STORE,
        reason: 'Month-end count',
        lines: [
          { productId: id, quantity: '12' },
          { productId: other, quantity: '7' },
        ],
      },
      store,
    );
    const adj = (await db.doc(`${base()}/stockAdjustments/${adjustmentId}`).get()).data()!;
    expect(adj.number).toBe('CNT-000001');
    expect(adj.lines).toMatchObject([
      { expectedMilli: 15_000, enteredMilli: 12_000, deltaMilli: -3000 },
      { expectedMilli: 7000, deltaMilli: 0 },
    ]);
    const accountant = await makeUser('acct@example.test');
    await addMember(companyId, admin, accountant, ['accountant']);
    await expectReason(
      call(
        'stockAdjustment.decide',
        { companyId, adjustmentId, decision: 'approved', reason: 'Not my call' },
        accountant,
      ),
      'missing_permission',
    );
    const res = await call<{ value: string }>(
      'stockAdjustment.decide',
      { companyId, adjustmentId, decision: 'approved', reason: 'Recounted twice' },
      manager,
    );
    expect(res.value).toBe('-36000');
    expect(await balance(id)).toEqual({ qty: 12_000, value: 144_000 });
    expect(await balance(other)).toEqual({ qty: 7000, value: 35_000 });
    const movements = await db
      .collection(`${base()}/stockMovements`)
      .where('sourceId', '==', adjustmentId)
      .get();
    expect(movements.size).toBe(1);
  });
});

describe('I5 FIFO costing', () => {
  it('can be chosen before stock exists, issues oldest cost first, then locks', async () => {
    await call('company.updateSettings', { companyId, costingMethod: 'fifo' }, admin);
    const id = await product('CEM-50');
    await adjust('opening', [{ productId: id, quantity: '10', unitCost: '100' }]);
    await adjust('adjustment', [{ productId: id, quantity: '10', unitCost: '140' }]);
    const res = await adjust('adjustment', [{ productId: id, quantity: '-15' }]);
    expect(res.value).toBe('-170000');
    expect(await balance(id)).toEqual({ qty: 5000, value: 70_000 });
    const layers = await db
      .collection(`${base()}/costLayers`)
      .where('productId', '==', id)
      .orderBy('seq')
      .get();
    expect(layers.docs.map((d) => [d.get('seq'), d.get('qtyRemaining'), d.get('open')])).toEqual([
      [1, 0, false],
      [2, 5000, true],
    ]);
    await expectReason(
      call('company.updateSettings', { companyId, costingMethod: 'weighted_average' }, admin),
      'costing_method_locked',
    );
  });
});

describe('I6 rejection, permissions and branch scope', () => {
  it('a rejected adjustment changes nothing', async () => {
    const id = await product('CEM-50');
    const { adjustmentId } = await call<{ adjustmentId: string }>(
      'stockAdjustment.create',
      {
        companyId,
        kind: 'opening',
        locationId: HQ_STORE,
        reason: 'Go-live',
        lines: [{ productId: id, quantity: '10', unitCost: '100' }],
      },
      store,
    );
    await call(
      'stockAdjustment.decide',
      { companyId, adjustmentId, decision: 'rejected', reason: 'Wrong cost' },
      manager,
    );
    expect(await balance(id)).toBeNull();
    expect((await db.collection(`${base()}/journals`).get()).size).toBe(0);
    await expectReason(
      call(
        'stockAdjustment.decide',
        { companyId, adjustmentId, decision: 'approved', reason: 'Changed mind' },
        manager,
      ),
      'adjustment_not_pending',
    );
  });

  it('sales officers cannot adjust stock; scoped staff only at their branch', async () => {
    const id = await product('CEM-50');
    const sales = await makeUser('sales@example.test');
    await addMember(companyId, admin, sales, ['sales_officer']);
    const req = {
      companyId,
      kind: 'adjustment',
      locationId: HQ_STORE,
      reason: 'Found',
      lines: [{ productId: id, quantity: '1', unitCost: '1' }],
    };
    await expectReason(call('stockAdjustment.create', req, sales), 'missing_permission');

    await call('branch.create', { companyId, code: 'IKJ', name: 'Ikeja' }, admin);
    const ikeja = await makeUser('ikeja@example.test');
    await addMember(companyId, admin, ikeja, ['store_officer'], ['IKJ']);
    await expectReason(call('stockAdjustment.create', req, ikeja), 'branch_not_allowed');
    await expect(
      call('stockAdjustment.create', { ...req, locationId: 'IKJ-store' }, ikeja),
    ).resolves.toMatchObject({ number: 'ADJ-000001' });
  });
});

describe('I7 stock and ledger agree', () => {
  it('the inventory control account equals the value of stock on hand', async () => {
    const a = await product('CEM-50');
    const b = await product('SAND', 'kg');
    await adjust('opening', [
      { productId: a, quantity: '10', unitCost: '100.3333' },
      { productId: b, quantity: '2.5', unitCost: '33.3333' },
    ]);
    await adjust('adjustment', [
      { productId: a, quantity: '-3' },
      { productId: b, quantity: '0.75', unitCost: '40' },
    ]);
    await adjust('count', [{ productId: a, quantity: '6' }]);
    await adjust('opening', [{ productId: a, quantity: '1', unitCost: '5' }], 'HQ-quarantine');

    const balances = await db.collection(`${base()}/stockBalances`).get();
    const stockValue = balances.docs.reduce((s, d) => s + (d.get('valueMinor') as number), 0);
    const movements = await db.collection(`${base()}/stockMovements`).get();
    const movementValue = movements.docs.reduce((s, d) => s + (d.get('valueMinor') as number), 0);
    expect(movementValue).toBe(stockValue);
    expect(await accountBalance('inventory')).toBe(stockValue);
  });
});
