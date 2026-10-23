/**
 * Concurrency and load (docs/bms/LOAD_TESTING.md). Many requests at once against one company
 * must still give gap-free numbers, balanced books, no negative stock and one result per
 * idempotency key. Firestore transactions retry on contention; a request that still loses is
 * refused as a whole, so nothing half-posted is left behind.
 */
import { randomUUID } from 'node:crypto';
import { AggregateField } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { businessDate } from '@bms/domain';
import type { Caller } from '../../functions/src/lib/command.js';
import { CommandError } from '../../functions/src/lib/errors.js';
import { addMember, call, createCompany, db, makeUser, resetEmulators } from './helpers.js';

const TODAY = businessDate(new Date(), 'Africa/Lagos');
const HQ_STORE = 'HQ-store';

let admin: Caller;
let sales: Caller;
let companyId: string;
let ids: Record<string, string>;
const base = () => `companies/${companyId}`;

async function ledgerTotals() {
  const agg = await db
    .collection(`${base()}/ledgerEntries`)
    .aggregate({ d: AggregateField.sum('debit'), c: AggregateField.sum('credit') })
    .get();
  return { debit: agg.data().d ?? 0, credit: agg.data().c ?? 0 };
}

function expectContiguous(numbers: string[], prefix: string) {
  const n = numbers.map((x) => Number(x.slice(prefix.length + 1))).sort((a, b) => a - b);
  expect(n).toEqual(Array.from({ length: n.length }, (_, i) => i + 1));
}

/** Outcomes of a batch: what succeeded, and the reasons the rest were refused. */
async function settle<T>(promises: Promise<T>[]) {
  const results = await Promise.allSettled(promises);
  const ok = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  const reasons = results.flatMap((r) =>
    r.status === 'rejected'
      ? [r.reason instanceof CommandError ? r.reason.reason : String(r.reason)]
      : [],
  );
  return { ok, reasons };
}

beforeEach(async () => {
  await resetEmulators();
  admin = await makeUser('owner@example.test');
  sales = await makeUser('sales@example.test');
  ({ companyId } = await createCompany(admin));
  await addMember(companyId, admin, sales, ['sales_officer']);
  const snap = await db.collection(`${base()}/accounts`).get();
  ids = Object.fromEntries(snap.docs.map((d) => [d.get('code') as string, d.id]));
});

const journal = (amount: string, key?: string) =>
  call<{ journalId: string; number: string }>(
    'journal.post',
    {
      companyId,
      branchId: 'HQ',
      postingDate: TODAY,
      memo: 'Load',
      lines: [
        { accountId: ids['1110'], debit: amount, credit: '' },
        { accountId: ids['4900'], debit: '', credit: amount },
      ],
    },
    admin,
    key,
  );

describe('concurrent postings', { timeout: 90_000 }, () => {
  it('numbers 20 journals posted at once without gaps or repeats, and the books balance', async () => {
    const started = Date.now();
    const { ok, reasons } = await settle(Array.from({ length: 20 }, () => journal('10')));
    const ms = Date.now() - started;
    console.info(
      `20 concurrent journals: ${ok.length} posted, ${reasons.length} refused, ${ms} ms`,
    );
    expect(reasons).toEqual([]);
    expectContiguous(
      ok.map((r) => r.number),
      'JV',
    );
    const totals = await ledgerTotals();
    expect(totals.debit).toBe(20 * 1000);
    expect(totals.credit).toBe(totals.debit);
  });

  it('posts once for 10 simultaneous retries of the same request', async () => {
    const key = randomUUID();
    const { ok } = await settle(Array.from({ length: 10 }, () => journal('25', key)));
    expect(ok.length).toBeGreaterThan(0);
    expect(new Set(ok.map((r) => r.journalId)).size).toBe(1);
    expect((await db.collection(`${base()}/journals`).count().get()).data().count).toBe(1);
    expect((await ledgerTotals()).debit).toBe(2500);
  });

  it('never sells more stock than there is when 15 sales race for 10 bags', async () => {
    const { productId } = await call<{ productId: string }>(
      'product.create',
      { companyId, sku: 'RICE', name: 'Rice 50kg', unit: 'bag', salePrice: '1000' },
      admin,
    );
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
        lines: [{ productId, quantity: '10', unitCost: '600' }],
      },
      admin,
    );
    const started = Date.now();
    const { ok, reasons } = await settle(
      Array.from({ length: 15 }, () =>
        call<{ number: string }>(
          'salesInvoice.post',
          {
            companyId,
            locationId: HQ_STORE,
            postingDate: TODAY,
            lines: [{ productId, quantity: '1' }],
            payments: [{ accountId: ids['1110'], amount: '1000' }],
          },
          sales,
        ),
      ),
    );
    const ms = Date.now() - started;
    console.info(
      `15 concurrent sales: ${ok.length} posted, refused ${reasons.join(',')}, ${ms} ms`,
    );
    expect(ok).toHaveLength(10);
    expect(reasons).toEqual(Array(5).fill('insufficient_stock'));
    const balance = await db.doc(`${base()}/stockBalances/${productId}__${HQ_STORE}`).get();
    expect(balance.get('qtyMilli')).toBe(0);
    expect(balance.get('valueMinor')).toBe(0);
    const prefix = ok[0]!.number.split('-')[0]!;
    expectContiguous(
      ok.map((r) => r.number),
      prefix,
    );
    const totals = await ledgerTotals();
    expect(totals.credit).toBe(totals.debit);
  });
});
