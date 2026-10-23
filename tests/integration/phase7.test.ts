import { randomUUID } from 'node:crypto';
import { AggregateField } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { addDays, addMonths, businessDate, lastDayOfMonth } from '@bms/domain';
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
const THIS_MONTH = TODAY.slice(0, 7);
const month = (n: number) => addMonths(THIS_MONTH, n);
/** A financial year that starts at least three months before today. */
const FY_START_MONTH = Number(addDays(TODAY, -100).slice(5, 7));

let admin: Caller;
let accountant: Caller;
let sales: Caller;
let companyId: string;
let ids: Record<string, string>;

const base = () => `companies/${companyId}`;
const doc = async (path: string) => (await db.doc(`${base()}/${path}`).get()).data()!;

async function balance(code: string): Promise<number> {
  const agg = await db
    .collection(`${base()}/ledgerEntries`)
    .where('accountId', '==', ids[code]!)
    .aggregate({ d: AggregateField.sum('debit'), c: AggregateField.sum('credit') })
    .get();
  return (agg.data().d ?? 0) - (agg.data().c ?? 0);
}

beforeEach(async () => {
  await resetEmulators();
  admin = await makeUser('owner@example.test');
  accountant = await makeUser('accounts@example.test');
  sales = await makeUser('sales@example.test');
  ({ companyId } = await createCompany(admin, { fiscalYearStartMonth: FY_START_MONTH }));
  await addMember(companyId, admin, accountant, ['accountant']);
  await addMember(companyId, admin, sales, ['sales_officer']);
  // Depreciation is posted on past month ends; widen the window so no approval is needed.
  await call('company.updateSettings', { companyId, backdateWindowDays: 366 }, admin);
  const snap = await db.collection(`${base()}/accounts`).get();
  ids = Object.fromEntries(snap.docs.map((d) => [d.get('code') as string, d.id]));
});

type Created = { assetId: string; number: string; journalId: string };

function buy(input: Record<string, unknown> = {}, by: Caller = accountant, key?: string) {
  return call<Created>(
    'fixedAsset.create',
    {
      companyId,
      acquisition: 'purchase',
      name: 'Delivery van',
      branchId: 'HQ',
      assetAccountId: ids['1520'],
      accumulatedAccountId: ids['1590'],
      expenseAccountId: ids['6600'],
      cost: '120000',
      residual: '12000',
      usefulLifeMonths: 36,
      acquiredDate: `${month(-3)}-10`,
      availableForUseDate: `${month(-3)}-10`,
      creditAccountId: ids['1120'],
      ...input,
    },
    by,
    key,
  );
}

const run = (m: string, by: Caller = accountant, key?: string) =>
  call<{ runId: string; number: string; journalId: string; assets: number }>(
    'depreciation.run',
    { companyId, branchId: 'HQ', month: m },
    by,
    key,
  );

describe('fixed asset register and depreciation', () => {
  it('posts the purchase and charges each month once, catching up missed months', async () => {
    const van = await buy();
    expect(van.number).toBe('FA-000001');
    const journal = await doc(`journals/${van.journalId}`);
    expect(journal.postingDate).toBe(`${month(-3)}-10`);
    expect(journal.lines.map((l: { accountCode: string }) => l.accountCode)).toEqual([
      '1520',
      '1120',
    ]);
    expect(await balance('1520')).toBe(12_000_000);
    const asset = await doc(`fixedAssets/${van.assetId}`);
    expect(asset).toMatchObject({ firstMonth: month(-3), chargedMonths: 0, status: 'active' });

    // Two months at once: (120,000 − 12,000) ÷ 36 = 3,000 a month.
    const first = await run(month(-2));
    expect(first.assets).toBe(1);
    const runJournal = await doc(`journals/${first.journalId}`);
    expect(runJournal.postingDate).toBe(lastDayOfMonth(month(-2)));
    expect(await balance('6600')).toBe(600_000);
    expect(await balance('1590')).toBe(-600_000);
    expect(await doc(`fixedAssets/${van.assetId}`)).toMatchObject({
      chargedMonths: 2,
      accumulatedMinor: 600_000,
      depreciatedThrough: month(-2),
    });
    const runDoc = await doc(`depreciationRuns/${first.runId}`);
    expect(runDoc.assets).toEqual([
      { assetId: van.assetId, number: 'FA-000001', months: 2, amountMinor: 600_000 },
    ]);

    await expectReason(run(month(-2)), 'nothing_due');
    await expectReason(run(month(-3)), 'nothing_due');
    await expectReason(run(month(1)), 'month_not_ended');
    await run(month(-1));
    expect(await balance('6600')).toBe(900_000);
    expect((await doc(`fixedAssets/${van.assetId}`)).depreciatedThrough).toBe(month(-1));
  });

  it('starts the next month when the asset comes into use after the 15th', async () => {
    const van = await buy({
      acquiredDate: `${month(-3)}-16`,
      availableForUseDate: `${month(-3)}-16`,
    });
    expect((await doc(`fixedAssets/${van.assetId}`)).firstMonth).toBe(month(-2));
    await expectReason(run(month(-3)), 'nothing_due');
    await run(month(-2));
    expect(await balance('6600')).toBe(300_000);
  });

  it('never charges more than cost less residual, the last month taking the rounding', async () => {
    const chair = await buy({
      name: 'Office chair',
      assetAccountId: ids['1510'],
      cost: '100',
      residual: '0',
      usefulLifeMonths: 3,
    });
    await run(month(-1));
    expect(await balance('6600')).toBe(10_000);
    const asset = await doc(`fixedAssets/${chair.assetId}`);
    expect(asset).toMatchObject({ chargedMonths: 3, accumulatedMinor: 10_000 });
    const runs = await db.collection(`${base()}/depreciationRuns`).get();
    expect(runs.docs[0]!.get('assets')[0].months).toBe(3);
    await expectReason(run(month(-1)), 'nothing_due');
  });

  it('does not charge the same month twice when a run is retried', async () => {
    await buy();
    const key = randomUUID();
    const a = await run(month(-1), accountant, key);
    const b = await run(month(-1), accountant, key);
    expect(b).toEqual(a);
    expect(await balance('6600')).toBe(900_000);
    expect((await db.collection(`${base()}/depreciationRuns`).count().get()).data().count).toBe(1);
  });

  it('brings in assets at cut-over with their depreciation to date', async () => {
    const asAt = `${month(-2)}-05`;
    const shop = await call<Created>(
      'fixedAsset.create',
      {
        companyId,
        acquisition: 'opening',
        name: 'Shop fittings',
        branchId: 'HQ',
        assetAccountId: ids['1510'],
        accumulatedAccountId: ids['1590'],
        expenseAccountId: ids['6600'],
        cost: '200000',
        residual: '0',
        usefulLifeMonths: 40,
        availableForUseDate: '2020-01-05',
        asAtDate: asAt,
        accumulatedToDate: '50000',
        monthsDepreciated: 10,
      },
      accountant,
    );
    expect(await balance('1510')).toBe(20_000_000);
    expect(await balance('1590')).toBe(-5_000_000);
    expect(await balance('3300')).toBe(-15_000_000);
    const asset = await doc(`fixedAssets/${shop.assetId}`);
    expect(asset).toMatchObject({ firstMonth: month(-1), chargedMonths: 10, baseMonths: 10 });
    // The rest, 150,000 over 30 months, is 5,000 a month from the month after the as-at date.
    await expectReason(run(month(-2)), 'nothing_due');
    await run(month(-1));
    expect(await balance('6600')).toBe(500_000);
  });

  it('rejects assets that do not add up or use the wrong accounts', async () => {
    await expectReason(buy({ residual: '130000' }), 'invalid_asset');
    await expectReason(
      buy({ availableForUseDate: `${month(-3)}-01`, acquiredDate: `${month(-3)}-02` }),
      'invalid_asset',
    );
    await expectReason(buy({ assetAccountId: ids['6600'] }), 'account_invalid');
    await expectReason(buy({ accumulatedAccountId: ids['1520'] }), 'account_invalid');
    await expectReason(buy({ creditAccountId: ids['1200'] }), 'account_invalid');
    await expectReason(buy({}, sales), 'missing_permission');
    await expectReason(run(month(-1), sales), 'missing_permission');
    expect((await db.collection(`${base()}/fixedAssets`).count().get()).data().count).toBe(0);
  });
});

describe('disposal', () => {
  const dispose = (assetId: string, input: Record<string, unknown> = {}) =>
    call<{ journalId: string; gain: string; depreciationMonths: number }>(
      'fixedAsset.dispose',
      {
        companyId,
        assetId,
        disposalDate: `${month(-1)}-20`,
        proceeds: '42000',
        proceedsAccountId: ids['1110'],
        gainLossAccountId: ids['4900'],
        reason: 'Sold to a staff member',
        ...input,
      },
      accountant,
    );

  it('catches up depreciation, removes cost and depreciation and posts the gain', async () => {
    const pc = await buy({
      name: 'Laptop',
      assetAccountId: ids['1530'],
      cost: '50000',
      residual: '0',
      usefulLifeMonths: 10,
      acquiredDate: `${month(-3)}-20`,
      availableForUseDate: `${month(-3)}-20`,
    });
    // From month −2 through month −1 (disposed after the 15th): 2 × 5,000; book value 40,000.
    const result = await dispose(pc.assetId);
    expect(result).toMatchObject({ gain: '2000.00', depreciationMonths: 2 });
    expect(await balance('1530')).toBe(0);
    expect(await balance('1590')).toBe(0);
    expect(await balance('6600')).toBe(1_000_000);
    expect(await balance('4900')).toBe(-200_000);
    expect(await balance('1110')).toBe(4_200_000);
    const asset = await doc(`fixedAssets/${pc.assetId}`);
    expect(asset.status).toBe('disposed');
    expect(asset.disposal).toMatchObject({ gainMinor: 200_000, proceedsMinor: 4_200_000 });
    await expectReason(dispose(pc.assetId), 'asset_disposed');
    // A disposed asset is not charged again.
    await expectReason(run(month(-1)), 'nothing_due');
  });

  it('posts a loss when scrapped for nothing, and stops before a month disposed by the 15th', async () => {
    const pc = await buy({
      name: 'Printer',
      assetAccountId: ids['1530'],
      cost: '50000',
      residual: '0',
      usefulLifeMonths: 10,
      acquiredDate: `${month(-3)}-20`,
      availableForUseDate: `${month(-3)}-20`,
    });
    const result = await dispose(pc.assetId, {
      disposalDate: `${month(-1)}-10`,
      proceeds: '',
      proceedsAccountId: undefined,
      gainLossAccountId: ids['6900'],
    });
    // Only month −2 is charged: book value 45,000 written off.
    expect(result).toMatchObject({ gain: '-45000.00', depreciationMonths: 1 });
    expect(await balance('6900')).toBe(4_500_000);
    expect(await balance('1530')).toBe(0);
  });

  it('refuses a disposal dated before months already charged', async () => {
    const van = await buy();
    await run(month(-1));
    await expectReason(
      dispose(van.assetId, { disposalDate: `${month(-1)}-10` }),
      'depreciated_past_disposal',
    );
    await expectReason(dispose(van.assetId, { proceedsAccountId: undefined }), 'account_invalid');
    await expectReason(dispose(van.assetId, { gainLossAccountId: ids['4100'] }), 'account_invalid');
  });
});
