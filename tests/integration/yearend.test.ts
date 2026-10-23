import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { addDays, businessDate, planFiscalYear } from '@bms/domain';
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
/** The current year starts on the 1st of this month, so last year ended yesterday-ish. */
const START_MONTH = Number(TODAY.slice(5, 7));
const LAST_YEAR = planFiscalYear(Number(TODAY.slice(0, 4)) - 1, START_MONTH);
const IN_LAST_YEAR = addDays(LAST_YEAR.endDate, -10);

let admin: Caller;
let sales: Caller;
let companyId: string;
let ids: Record<string, string>;

const base = () => `companies/${companyId}`;

/** History from before the system: last year's periods, written as the old books left them. */
async function seedLastYear(status: 'open' | 'soft_closed') {
  const at = Timestamp.now();
  await db.doc(`${base()}/fiscalYears/${LAST_YEAR.id}`).set({
    startDate: LAST_YEAR.startDate,
    endDate: LAST_YEAR.endDate,
    status: 'open',
    createdAt: at,
    createdBy: admin.uid,
  });
  for (const p of LAST_YEAR.periods) {
    await db.doc(`${base()}/periods/${p.id}`).set({
      fiscalYearId: LAST_YEAR.id,
      startDate: p.startDate,
      endDate: p.endDate,
      status,
      statusChangedAt: at,
      statusChangedBy: admin.uid,
      lastReason: null,
    });
  }
}

const journal = (debit: string, credit: string, amount: string, memo = 'Last year') =>
  call(
    'journal.post',
    {
      companyId,
      branchId: 'HQ',
      postingDate: IN_LAST_YEAR,
      memo,
      lines: [
        { accountId: ids[debit], debit: amount, credit: '' },
        { accountId: ids[credit], debit: '', credit: amount },
      ],
    },
    admin,
  );

const close = (by: Caller = admin, fiscalYearId = LAST_YEAR.id) =>
  call<{ journalId: string; number: string; profit: string }>(
    'fiscalYear.close',
    { companyId, fiscalYearId, branchId: 'HQ' },
    by,
  );

async function lines(journalId: string) {
  const j = (await db.doc(`${base()}/journals/${journalId}`).get()).data()!;
  return {
    journal: j,
    lines: (j.lines as { accountCode: string; debit: number; credit: number }[]).map((l) => [
      l.accountCode,
      l.debit,
      l.credit,
    ]),
  };
}

beforeEach(async () => {
  await resetEmulators();
  admin = await makeUser('owner@example.test');
  sales = await makeUser('sales@example.test');
  ({ companyId } = await createCompany(admin, { fiscalYearStartMonth: START_MONTH }));
  await addMember(companyId, admin, sales, ['sales_officer']);
  await call('company.updateSettings', { companyId, backdateWindowDays: 366 }, admin);
  const snap = await db.collection(`${base()}/accounts`).get();
  ids = Object.fromEntries(snap.docs.map((d) => [d.get('code') as string, d.id]));
});

describe('year-end close', () => {
  it('moves the year profit into retained earnings once every month is closed', async () => {
    await seedLastYear('open');
    await journal('1110', '4900', '1000');
    await journal('6200', '1110', '300');
    await expectReason(close(), 'periods_open');

    for (const p of LAST_YEAR.periods) {
      await db.doc(`${base()}/periods/${p.id}`).update({ status: 'soft_closed' });
    }
    const first = await close();
    expect(first.number).toBe('YE-000001');
    expect(first.profit).toBe('70000');
    const { journal: j, lines: l } = await lines(first.journalId);
    expect(j).toMatchObject({ origin: 'closing', postingDate: LAST_YEAR.endDate });
    expect(l).toEqual([
      ['4900', 100_000, 0],
      ['6200', 0, 30_000],
      ['3200', 0, 70_000],
    ]);

    // Nothing left; a later posting to the year is closed by a second run.
    await expectReason(close(), 'nothing_to_close');
    await journal('1110', '4900', '100', 'Late income');
    const second = await close();
    expect((await lines(second.journalId)).lines).toEqual([
      ['4900', 10_000, 0],
      ['3200', 0, 10_000],
    ]);
    const year = (await db.doc(`${base()}/fiscalYears/${LAST_YEAR.id}`).get()).data()!;
    expect(year.closingJournalIds).toEqual([first.journalId, second.journalId]);
  });

  it('closes only years that have ended, for those allowed to close periods', async () => {
    await seedLastYear('soft_closed');
    await journal('1110', '4900', '50');
    const current = (await db.collection(`${base()}/fiscalYears`).get()).docs
      .map((d) => d.id)
      .find((id) => id !== LAST_YEAR.id)!;
    await expectReason(close(admin, current), 'year_not_ended');
    await expectReason(close(sales), 'missing_permission');
    await expectReason(close(admin, 'FY1999-01'), 'fiscal_year_not_found');
  });

  it('cannot be reversed like a manual journal', async () => {
    await seedLastYear('soft_closed');
    await journal('1110', '4900', '50');
    const { journalId } = await close();
    await expectReason(
      call(
        'journal.reverse',
        { companyId, journalId, postingDate: TODAY, reason: 'Undo the close' },
        admin,
      ),
      'not_reversible',
    );
  });
});
