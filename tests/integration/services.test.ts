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
let accountant: Caller;
let sales: Caller;
let companyId: string;
let ids: Record<string, string>;
let rice: string;
let install: string;
let shop: string;

const base = () => `companies/${companyId}`;
const doc = async (path: string) => (await db.doc(`${base()}/${path}`).get()).data()!;

/** Debit minus credit on an account, optionally for one project only. */
async function balance(code: string, projectId?: string) {
  let q = db.collection(`${base()}/ledgerEntries`).where('accountId', '==', ids[code]);
  if (projectId) q = q.where('projectId', '==', projectId);
  const agg = await q
    .aggregate({ d: AggregateField.sum('debit'), c: AggregateField.sum('credit') })
    .get();
  return (agg.data().d ?? 0) - (agg.data().c ?? 0);
}

async function stockMovements(productId: string) {
  return (await db.collection(`${base()}/stockMovements`).where('productId', '==', productId).get())
    .size;
}

const sell = (by: Caller, lines: Record<string, unknown>[], extra: Record<string, unknown> = {}) =>
  call<{ invoiceId: string; number: string; journalId: string }>(
    'salesInvoice.post',
    { companyId, customerId: shop, locationId: HQ_STORE, postingDate: TODAY, lines, ...extra },
    by,
  );

beforeEach(async () => {
  await resetEmulators();
  admin = await makeUser('owner@example.test');
  manager = await makeUser('manager@example.test');
  accountant = await makeUser('accounts@example.test');
  sales = await makeUser('sales@example.test');
  ({ companyId } = await createCompany(admin));
  await addMember(companyId, admin, manager, ['manager']);
  await addMember(companyId, admin, accountant, ['accountant']);
  await addMember(companyId, admin, sales, ['sales_officer']);
  const snap = await db.collection(`${base()}/accounts`).get();
  ids = Object.fromEntries(snap.docs.map((d) => [d.get('code') as string, d.id]));
  ({ productId: rice } = await call<{ productId: string }>(
    'product.create',
    { companyId, sku: 'RICE', name: 'Rice 50kg', unit: 'bag', salePrice: '1000' },
    admin,
  ));
  ({ productId: install } = await call<{ productId: string }>(
    'product.create',
    {
      companyId,
      sku: 'INSTALL',
      name: 'Installation',
      type: 'service',
      unit: 'hr',
      salePrice: '500',
    },
    admin,
  ));
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
      lines: [{ productId: rice, quantity: '10', unitCost: '600' }],
    },
    admin,
  );
  ({ customerId: shop } = await call<{ customerId: string }>(
    'customer.create',
    { companyId, code: 'SHOP', name: 'Shop Ltd', paymentTermsDays: 30, creditLimit: '100000' },
    manager,
  ));
});

describe('V1 service items', () => {
  it('are never held in stock', async () => {
    expect((await doc(`products/${install}`)).type).toBe('service');
    const supplierId = (await db.collection(`${base()}/suppliers`).get()).docs[0]!.id;
    await expectReason(
      call(
        'goodsReceipt.post',
        {
          companyId,
          supplierId,
          locationId: HQ_STORE,
          postingDate: TODAY,
          lines: [{ productId: install, quantity: '1', unitCost: '10' }],
        },
        admin,
      ),
      'not_stocked',
    );
    await expectReason(
      call(
        'stockAdjustment.create',
        {
          companyId,
          kind: 'opening',
          locationId: HQ_STORE,
          reason: 'Opening stock',
          lines: [{ productId: install, quantity: '1', unitCost: '10' }],
        },
        admin,
      ),
      'not_stocked',
    );
    await expectReason(
      call('product.update', { companyId, productId: install, reorderLevel: '2' }, admin),
      'not_stocked',
    );
  });

  it('earn service revenue with no cost, beside goods on the same sale', async () => {
    const { invoiceId } = await sell(sales, [
      { productId: rice, quantity: '2' },
      { productId: install, quantity: '1.5' },
    ]);
    const invoice = await doc(`salesInvoices/${invoiceId}`);
    expect(
      invoice.lines.map((l: { itemType: string; costMinor: number }) => [l.itemType, l.costMinor]),
    ).toEqual([
      ['stock', 120_000],
      ['service', 0],
    ]);
    expect(invoice.totalMinor).toBe(275_000);
    expect(await balance('4100')).toBe(-200_000);
    expect(await balance('4200')).toBe(-75_000);
    expect(await balance('5100')).toBe(120_000);
    expect(await balance('1200')).toBe(275_000);
    expect(await stockMovements(install)).toBe(0);
  });

  it('can be credited without anything going back to stock', async () => {
    const { invoiceId } = await sell(manager, [{ productId: install, quantity: '2' }]);
    expect(await balance('5100')).toBe(0);
    await call(
      'creditNote.create',
      {
        companyId,
        invoiceId,
        reason: 'One hour not done',
        lines: [{ lineNo: 1, quantity: '1', condition: 'resalable' }],
      },
      manager,
    );
    expect(await balance('4200')).toBe(-50_000);
    expect(await balance('1200')).toBe(50_000);
    expect(await stockMovements(install)).toBe(0);
  });
});

describe('V2 projects', () => {
  it('collect the revenue and direct costs posted for them', async () => {
    const { projectId } = await call<{ projectId: string }>(
      'project.create',
      { companyId, code: 'fit-1', name: 'Shop fit-out', customerId: shop },
      manager,
    );
    expect((await doc(`projects/${projectId}`)).code).toBe('FIT-1');
    await sell(sales, [{ productId: install, quantity: '4' }], { projectId });
    const supplierId = (await db.collection(`${base()}/suppliers`).get()).docs[0]!.id;
    await call(
      'purchaseInvoice.post',
      {
        companyId,
        supplierId,
        branchId: 'HQ',
        invoiceDate: TODAY,
        supplierInvoiceNo: 'SUB-1',
        lines: [
          { kind: 'expense', accountId: ids['5400'], description: 'Subcontractor', amount: '800' },
        ],
        projectId,
      },
      accountant,
    );
    const { journalId } = await call<{ journalId: string }>(
      'journal.post',
      {
        companyId,
        branchId: 'HQ',
        postingDate: TODAY,
        memo: 'Site transport',
        lines: [
          { accountId: ids['6400'], debit: '150', credit: '' },
          { accountId: ids['1110'], debit: '', credit: '150' },
        ],
        projectId,
      },
      accountant,
    );
    expect(await balance('4200', projectId)).toBe(-200_000);
    expect(await balance('5400', projectId)).toBe(80_000);
    expect(await balance('6400', projectId)).toBe(15_000);
    // Untagged postings stay out of the project.
    await sell(sales, [{ productId: install, quantity: '1' }]);
    expect(await balance('4200', projectId)).toBe(-200_000);

    // A finished project takes no new postings, but its journals can still be reversed.
    await call('project.update', { companyId, projectId, status: 'completed' }, manager);
    await expectReason(
      sell(sales, [{ productId: install, quantity: '1' }], { projectId }),
      'project_inactive',
    );
    await call(
      'journal.reverse',
      { companyId, journalId, postingDate: TODAY, reason: 'Charged to the wrong job' },
      accountant,
    );
    expect(await balance('6400', projectId)).toBe(0);
  });

  it('for a customer cannot be billed to another', async () => {
    const { projectId } = await call<{ projectId: string }>(
      'project.create',
      { companyId, code: 'FIT-2', name: 'Shop fit-out', customerId: shop },
      manager,
    );
    const { customerId: other } = await call<{ customerId: string }>(
      'customer.create',
      { companyId, code: 'OTHER', name: 'Other Ltd', paymentTermsDays: 30, creditLimit: '100000' },
      manager,
    );
    await expectReason(
      sell(sales, [{ productId: install, quantity: '1' }], { projectId, customerId: other }),
      'project_customer_mismatch',
    );
    await expectReason(
      call('project.create', { companyId, code: 'fit-2', name: 'Again' }, manager),
      'code_taken',
    );
    await expectReason(
      call('project.create', { companyId, code: 'X', name: 'Not mine' }, sales),
      'missing_permission',
    );
  });
});

describe('V3 quotations', () => {
  const quote = (by: Caller, lines: Record<string, unknown>[]) =>
    call<{ quotationId: string; number: string }>(
      'quotation.create',
      {
        companyId,
        customerId: shop,
        branchId: 'HQ',
        quoteDate: TODAY,
        validUntil: TODAY,
        lines,
      },
      by,
    );
  const status = (quotationId: string, s: string, by: Caller = manager) =>
    call('quotation.setStatus', { companyId, quotationId, status: s }, by);

  it('post nothing, and become one invoice at the agreed prices', async () => {
    await expectReason(
      quote(sales, [{ productId: install, quantity: '10', discount: '500' }]),
      'price_override_not_allowed',
    );
    const { quotationId, number } = await quote(manager, [
      { productId: install, quantity: '10', discount: '500' },
      { productId: rice, quantity: '1' },
    ]);
    expect(number).toBe('QT-000001');
    const q = await doc(`quotations/${quotationId}`);
    expect([q.status, q.totalMinor]).toEqual(['draft', 550_000]);
    expect((await db.collection(`${base()}/journals`).get()).size).toBe(1); // the receipt only

    // A draft cannot be invoiced; once sent, a sales officer can bill it as quoted.
    const lines = [
      { productId: install, quantity: '10', discount: '500' },
      { productId: rice, quantity: '1' },
    ];
    await expectReason(sell(sales, lines, { quotationId }), 'quotation_not_open');
    await status(quotationId, 'sent', sales);
    const { invoiceId, number: invoiceNumber } = await sell(sales, lines, { quotationId });
    expect(await doc(`quotations/${quotationId}`)).toMatchObject({
      status: 'invoiced',
      invoiceId,
      invoiceNumber,
    });
    expect((await doc(`salesInvoices/${invoiceId}`)).quotationId).toBe(quotationId);
    await expectReason(sell(sales, lines, { quotationId }), 'quotation_not_open');
    await expectReason(status(quotationId, 'cancelled'), 'invalid_transition');
  });

  it('move only forward through their statuses', async () => {
    const { quotationId } = await quote(manager, [{ productId: install, quantity: '1' }]);
    await status(quotationId, 'sent');
    await status(quotationId, 'declined');
    await expectReason(status(quotationId, 'accepted'), 'invalid_transition');
    // An invoice for a declined quotation, or for another customer, is refused.
    const { quotationId: second } = await quote(manager, [{ productId: install, quantity: '1' }]);
    await status(second, 'accepted');
    await expectReason(
      sell(sales, [{ productId: install, quantity: '1' }], { quotationId }),
      'quotation_not_open',
    );
    await expectReason(
      call(
        'salesInvoice.post',
        {
          companyId,
          locationId: HQ_STORE,
          postingDate: TODAY,
          lines: [{ productId: install, quantity: '1' }],
          payments: [{ accountId: ids['1110'], amount: '500' }],
          quotationId: second,
        },
        sales,
      ),
      'quotation_customer_mismatch',
    );
  });
});
