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
let manager: Caller;
let store: Caller;
let accountant: Caller;
let sales: Caller;
let companyId: string;
let ids: Record<string, string>;
let flour: string;
let sugar: string;
let bread: string;
let bomId: string;

const base = () => `companies/${companyId}`;
const doc = async (path: string) => (await db.doc(`${base()}/${path}`).get()).data()!;

async function balance(code: string) {
  const agg = await db
    .collection(`${base()}/ledgerEntries`)
    .where('accountId', '==', ids[code])
    .aggregate({ d: AggregateField.sum('debit'), c: AggregateField.sum('credit') })
    .get();
  return (agg.data().d ?? 0) - (agg.data().c ?? 0);
}

const stockOf = async (productId: string) => doc(`stockBalances/${productId}__${HQ_STORE}`);

const product = async (sku: string, unit: string, extra: Record<string, unknown> = {}) =>
  (
    await call<{ productId: string }>(
      'product.create',
      { companyId, sku, name: sku, unit, ...extra },
      admin,
    )
  ).productId;

const order = async (quantity = '200') =>
  (
    await call<{ orderId: string; number: string }>(
      'productionOrder.create',
      { companyId, bomId, locationId: HQ_STORE, quantity },
      store,
    )
  ).orderId;

const move = (
  orderId: string,
  direction: 'issue' | 'return',
  lines: { productId: string; quantity: string }[],
  by: Caller = store,
) => call('productionOrder.moveMaterials', { companyId, orderId, direction, lines }, by);

const addCost = (orderId: string, accountCode: string, amount: string, by: Caller = accountant) =>
  call(
    'productionOrder.addCost',
    { companyId, orderId, accountId: ids[accountCode], description: 'Bakers wages', amount },
    by,
  );

beforeEach(async () => {
  await resetEmulators();
  admin = await makeUser('owner@example.test');
  manager = await makeUser('manager@example.test');
  store = await makeUser('store@example.test');
  accountant = await makeUser('accounts@example.test');
  sales = await makeUser('sales@example.test');
  ({ companyId } = await createCompany(admin));
  await addMember(companyId, admin, manager, ['manager']);
  await addMember(companyId, admin, store, ['store_officer']);
  await addMember(companyId, admin, accountant, ['accountant']);
  await addMember(companyId, admin, sales, ['sales_officer']);
  const snap = await db.collection(`${base()}/accounts`).get();
  ids = Object.fromEntries(snap.docs.map((d) => [d.get('code') as string, d.id]));
  flour = await product('FLOUR', 'kg');
  sugar = await product('SUGAR', 'kg');
  bread = await product('BREAD', 'pcs', { salePrice: '50' });
  const { supplierId } = await call<{ supplierId: string }>(
    'supplier.create',
    { companyId, code: 'MILLS', name: 'Lagos Mills', paymentTermsDays: 30 },
    admin,
  );
  await call(
    'goodsReceipt.post',
    {
      companyId,
      supplierId,
      locationId: HQ_STORE,
      postingDate: TODAY,
      lines: [
        { productId: flour, quantity: '100', unitCost: '200' },
        { productId: sugar, quantity: '20', unitCost: '500' },
      ],
    },
    admin,
  );
  ({ bomId } = await call<{ bomId: string }>(
    'bom.create',
    {
      companyId,
      productId: bread,
      name: 'Bread, 100 loaves',
      outputQuantity: '100',
      components: [
        { productId: flour, quantity: '10' },
        { productId: sugar, quantity: '2' },
      ],
    },
    store,
  ));
});

describe('P1 bills of materials', () => {
  it('list stocked components only, never the product itself', async () => {
    const install = await product('INSTALL', 'hr', { type: 'service' });
    const bom = (components: { productId: string; quantity: string }[], by: Caller = store) =>
      call(
        'bom.create',
        { companyId, productId: bread, name: 'Bad', outputQuantity: '1', components },
        by,
      );
    await expectReason(bom([{ productId: install, quantity: '1' }]), 'not_stocked');
    await expectReason(bom([{ productId: bread, quantity: '1' }]), 'component_is_output');
    await expectReason(
      bom([
        { productId: flour, quantity: '1' },
        { productId: flour, quantity: '2' },
      ]),
      'duplicate_product',
    );
    await expectReason(bom([{ productId: flour, quantity: '1' }], sales), 'missing_permission');

    await call('bom.setStatus', { companyId, bomId, status: 'inactive' }, manager);
    await expectReason(order(), 'bom_inactive');
  });
});

describe('P2 production orders', () => {
  it('carry materials and direct costs at actual cost into finished goods', async () => {
    const orderId = await order('200');
    const created = await doc(`productionOrders/${orderId}`);
    expect(created.number).toBe('MO-000001');
    expect(created.components.map((c: { requiredQtyMilli: number }) => c.requiredQtyMilli)).toEqual(
      [20_000, 4_000],
    );

    // Materials leave the store at cost (Dr WIP, Cr Inventory); unused ones come back.
    await move(orderId, 'issue', [
      { productId: flour, quantity: '22' },
      { productId: sugar, quantity: '4' },
    ]);
    await move(orderId, 'return', [{ productId: flour, quantity: '2' }]);
    expect((await stockOf(flour)).qtyMilli).toBe(80_000);
    expect(await balance('1320')).toBe(600_000);
    expect(await balance('1300')).toBe(3_000_000 - 600_000);

    // A direct cost: Dr WIP, Cr the account chosen.
    await addCost(orderId, '1110', '1000');
    expect(await balance('1320')).toBe(700_000);
    expect(await balance('1110')).toBe(-100_000);
    expect((await doc(`productionOrders/${orderId}`)).wipMinor).toBe(700_000);

    // Normal loss is absorbed by the good output; abnormal loss takes its share and is
    // written off (DECISION 22): 700,000 × 5 ÷ (190 + 5) = 17,949.
    await expectReason(
      call(
        'productionOrder.complete',
        { companyId, orderId, goodQuantity: '190', abnormalLossQuantity: '5' },
        store,
      ),
      'write_off_account_required',
    );
    await call(
      'productionOrder.complete',
      {
        companyId,
        orderId,
        goodQuantity: '190',
        normalLossQuantity: '5',
        abnormalLossQuantity: '5',
        writeOffAccountId: ids['5200'],
      },
      store,
    );
    const done = await doc(`productionOrders/${orderId}`);
    expect(done).toMatchObject({
      status: 'completed',
      goodQtyMilli: 190_000,
      normalLossQtyMilli: 5_000,
      abnormalLossQtyMilli: 5_000,
      finishedCostMinor: 682_051,
      writtenOffMinor: 17_949,
      wipMinor: 0,
    });
    expect(await stockOf(bread)).toMatchObject({ qtyMilli: 190_000, valueMinor: 682_051 });
    expect(await balance('1320')).toBe(0);
    expect(await balance('5200')).toBe(17_949);
    expect(await balance('1300')).toBe(2_400_000 + 682_051);
    const movements = await db
      .collection(`${base()}/stockMovements`)
      .where('sourceId', '==', orderId)
      .get();
    expect(movements.docs.map((d) => d.get('movementType')).sort()).toEqual([
      'production_issue',
      'production_issue',
      'production_output',
      'production_return',
    ]);

    // A finished order takes nothing more.
    await expectReason(
      move(orderId, 'issue', [{ productId: flour, quantity: '1' }]),
      'order_not_open',
    );
  });

  it('refuse what does not belong to the order', async () => {
    const orderId = await order();
    await expectReason(
      move(orderId, 'issue', [{ productId: bread, quantity: '1' }]),
      'not_a_component',
    );
    await expectReason(
      move(orderId, 'issue', [{ productId: flour, quantity: '101' }]),
      'insufficient_stock',
    );
    await expectReason(
      move(orderId, 'return', [{ productId: flour, quantity: '1' }]),
      'return_exceeds_issued',
    );
    await expectReason(
      call('productionOrder.complete', { companyId, orderId, goodQuantity: '1' }, store),
      'no_cost',
    );
    // Direct costs choose a ledger account, so they are for accountants and managers.
    await expectReason(addCost(orderId, '1110', '10', store), 'missing_permission');
    await expectReason(addCost(orderId, '1200', '10'), 'account_not_allowed');
    await expectReason(addCost(orderId, '4100', '10'), 'account_not_allowed');
  });

  it('can be cancelled, writing off any cost they still hold', async () => {
    const empty = await order();
    await call(
      'productionOrder.cancel',
      { companyId, orderId: empty, reason: 'Not needed' },
      store,
    );
    expect((await doc(`productionOrders/${empty}`)).status).toBe('cancelled');

    const orderId = await order();
    await move(orderId, 'issue', [{ productId: sugar, quantity: '2' }]);
    await expectReason(
      call('productionOrder.cancel', { companyId, orderId, reason: 'Oven broke' }, store),
      'write_off_account_required',
    );
    await expectReason(
      call(
        'productionOrder.cancel',
        { companyId, orderId, reason: 'Oven broke', writeOffAccountId: ids['1110'] },
        store,
      ),
      'account_not_allowed',
    );
    await call(
      'productionOrder.cancel',
      { companyId, orderId, reason: 'Oven broke', writeOffAccountId: ids['5200'] },
      store,
    );
    expect(await doc(`productionOrders/${orderId}`)).toMatchObject({
      status: 'cancelled',
      writtenOffMinor: 100_000,
      wipMinor: 0,
    });
    expect(await balance('1320')).toBe(0);
    expect(await balance('5200')).toBe(100_000);
  });
});
