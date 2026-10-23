import { randomUUID } from 'node:crypto';
import { AggregateField } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { TRADING_TEMPLATE, addDays, businessDate, trialBalance } from '@bms/domain';
import type { Caller } from '../../functions/src/lib/command.js';
import {
  addMember,
  auditCount,
  call,
  createCompany,
  db,
  expectReason,
  makeUser,
  resetEmulators,
} from './helpers.js';

const TODAY = businessDate(new Date(), 'Africa/Lagos');
/** A financial year that starts at least a month before today, so backdated dates have a period. */
const FY_START_MONTH = Number(addDays(TODAY, -40).slice(5, 7));
const BACKDATED = addDays(TODAY, -10);

let admin: Caller;
let companyId: string;
let ids: Record<string, string>;

const line = (code: string, debit: string, credit = '') => ({
  accountId: ids[code]!,
  debit,
  credit,
});

function journal(overrides: Record<string, unknown> = {}) {
  return {
    companyId,
    branchId: 'HQ',
    postingDate: TODAY,
    memo: 'Owner paid rent from cash',
    lines: [line('6200', '1,250.50'), line('1110', '', '1250.50')],
    ...overrides,
  };
}

async function accountIds(company: string): Promise<Record<string, string>> {
  const snap = await db.collection(`companies/${company}/accounts`).get();
  return Object.fromEntries(snap.docs.map((d) => [d.get('code') as string, d.id]));
}

async function count(path: string): Promise<number> {
  return (await db.collection(path).count().get()).data().count;
}

async function balances(company: string) {
  const accounts = await db.collection(`companies/${company}/accounts`).get();
  const inputs = await Promise.all(
    accounts.docs.map(async (a) => {
      const agg = await db
        .collection(`companies/${company}/ledgerEntries`)
        .where('accountId', '==', a.id)
        .aggregate({
          debit: AggregateField.sum('debit'),
          credit: AggregateField.sum('credit'),
        })
        .get();
      return {
        account: { id: a.id, code: a.get('code'), name: a.get('name'), type: a.get('type') },
        debit: BigInt(agg.data().debit ?? 0),
        credit: BigInt(agg.data().credit ?? 0),
      };
    }),
  );
  return trialBalance(inputs);
}

beforeEach(async () => {
  await resetEmulators();
  admin = await makeUser('owner@example.test');
  ({ companyId } = await createCompany(admin, { fiscalYearStartMonth: FY_START_MONTH }));
  ids = await accountIds(companyId);
});

describe('L1 chart of accounts', () => {
  it('seeds the trading template when a company is created', async () => {
    const snap = await db.collection(`companies/${companyId}/accounts`).get();
    expect(snap.size).toBe(TRADING_TEMPLATE.accounts.length);
    const byCode = new Map(snap.docs.map((d) => [d.get('code') as string, d.data()]));
    expect(byCode.get('1200')).toMatchObject({ isControl: true, subtype: 'receivable' });
    expect(byCode.get('1110')).toMatchObject({ isControl: false, parentId: ids['1100'] });
    expect(byCode.get('1000')).toMatchObject({ isPostable: false, parentId: null });
  });

  it('applies a template only to an empty chart', async () => {
    await expectReason(
      call('chart.applyTemplate', { companyId, templateId: 'trading' }, admin),
      'chart_exists',
    );
    const batch = db.batch();
    (await db.collection(`companies/${companyId}/accounts`).get()).docs.forEach((d) =>
      batch.delete(d.ref),
    );
    await batch.commit();
    const res = await call<{ accounts: number }>(
      'chart.applyTemplate',
      { companyId, templateId: 'trading' },
      admin,
    );
    expect(res.accounts).toBe(TRADING_TEMPLATE.accounts.length);
  });

  it('validates new accounts', async () => {
    const base = { companyId, name: 'Petty cash', type: 'asset', parentId: ids['1100'] };
    await expectReason(call('account.create', { ...base, code: '1110' }, admin), 'code_taken');
    await expectReason(
      call('account.create', { ...base, code: '1111', subtype: 'payable' }, admin),
      'subtype_invalid',
    );
    await expectReason(
      call('account.create', { ...base, code: '1111', parentId: ids['1110'] }, admin),
      'parent_invalid',
    );
    await expectReason(
      call('account.create', { ...base, code: '1111', parentId: ids['2000'] }, admin),
      'parent_invalid',
    );
    await expectReason(
      call(
        'account.create',
        {
          ...base,
          code: '3400',
          type: 'equity',
          subtype: 'retainedEarnings',
          parentId: ids['3000'],
        },
        admin,
      ),
      'system_account_exists',
    );
    const { accountId } = await call<{ accountId: string }>(
      'account.create',
      { ...base, code: '1111', subtype: 'cash' },
      admin,
    );
    const created = (await db.doc(`companies/${companyId}/accounts/${accountId}`).get()).data();
    expect(created).toMatchObject({ code: '1111', status: 'active', isControl: false });
  });

  it('only users who manage accounts can change the chart', async () => {
    const auditor = await makeUser('auditor@example.test');
    await addMember(companyId, admin, auditor, ['auditor']);
    await expectReason(
      call('account.update', { companyId, accountId: ids['6200'], name: 'Office rent' }, auditor),
      'missing_permission',
    );
  });
});

describe('L2 manual journals', () => {
  it('posts a balanced journal with ledger entries, numbering, locks and one audit entry', async () => {
    const before = await auditCount(companyId);
    const res = await call<{ journalId: string; number: string }>('journal.post', journal(), admin);
    expect(res.number).toBe('JV-000001');

    const j = (await db.doc(`companies/${companyId}/journals/${res.journalId}`).get()).data()!;
    expect(j).toMatchObject({
      status: 'posted',
      origin: 'manual',
      currency: 'NGN',
      totalDebit: 125050,
      totalCredit: 125050,
      periodId: TODAY.slice(0, 7),
    });
    expect(j.lines).toHaveLength(2);
    expect(j.lines[0]).toMatchObject({ accountCode: '6200', debit: 125050, credit: 0 });

    const entries = await db
      .collection(`companies/${companyId}/ledgerEntries`)
      .where('journalId', '==', res.journalId)
      .get();
    expect(entries.docs.map((d) => d.id).sort()).toEqual([
      `${res.journalId}_1`,
      `${res.journalId}_2`,
    ]);

    const company = (await db.doc(`companies/${companyId}`).get()).data()!;
    expect(company.locks).toMatchObject({ baseCurrency: true, fiscalYearStartMonth: true });
    expect(
      (await db.doc(`companies/${companyId}/accounts/${ids['6200']}`).get()).get('hasPostings'),
    ).toBe(true);
    expect(await auditCount(companyId)).toBe(before + 1);

    const second = await call<{ number: string }>('journal.post', journal(), admin);
    expect(second.number).toBe('JV-000002');
  });

  it('rejects an unbalanced journal and writes nothing', async () => {
    await expectReason(
      call(
        'journal.post',
        journal({ lines: [line('6200', '100'), line('1110', '', '99.99')] }),
        admin,
      ),
      'unbalanced',
    );
    expect(await count(`companies/${companyId}/journals`)).toBe(0);
    expect(await count(`companies/${companyId}/ledgerEntries`)).toBe(0);
    expect((await db.doc(`companies/${companyId}/numberSeries/journal.manual`).get()).exists).toBe(
      false,
    );
  });

  it('rejects control accounts, headings, inactive accounts and bad amounts', async () => {
    await expectReason(
      call('journal.post', journal({ lines: [line('1200', '10'), line('4100', '', '10')] }), admin),
      'control_account',
    );
    await expectReason(
      call('journal.post', journal({ lines: [line('1100', '10'), line('4100', '', '10')] }), admin),
      'account_not_postable',
    );
    await call('account.update', { companyId, accountId: ids['6900'], status: 'inactive' }, admin);
    await expectReason(
      call('journal.post', journal({ lines: [line('6900', '10'), line('1110', '', '10')] }), admin),
      'account_inactive',
    );
    await expectReason(
      call(
        'journal.post',
        journal({ lines: [line('6200', '10.555'), line('1110', '', '10.555')] }),
        admin,
      ),
      'amount_invalid',
    );
    await expectReason(
      call(
        'journal.post',
        journal({ lines: [line('6200', '10', '10'), line('1110', '', '0')] }),
        admin,
      ),
      'line_amount_invalid',
    );
  });

  it('replays a retried request instead of posting twice', async () => {
    const key = randomUUID();
    const a = await call('journal.post', journal(), admin, key);
    const b = await call('journal.post', journal(), admin, key);
    expect(b).toEqual(a);
    expect(await count(`companies/${companyId}/journals`)).toBe(1);
    await expectReason(
      call('journal.post', journal({ memo: 'Something else' }), admin, key),
      'idempotency_key_reused',
    );
  });

  it('enforces permissions and branch scope', async () => {
    const auditor = await makeUser('auditor@example.test');
    await addMember(companyId, admin, auditor, ['auditor']);
    await expectReason(call('journal.post', journal(), auditor), 'missing_permission');

    await call('branch.create', { companyId, code: 'IKJ', name: 'Ikeja' }, admin);
    const accountant = await makeUser('acct@example.test');
    await addMember(companyId, admin, accountant, ['accountant'], ['IKJ']);
    await expectReason(call('journal.post', journal(), accountant), 'branch_not_allowed');
    await expect(
      call('journal.post', journal({ branchId: 'IKJ' }), accountant),
    ).resolves.toMatchObject({ number: 'JV-000001' });
  });
});

describe('L3 posting dates', () => {
  it('rejects future dates and dates without a period', async () => {
    await expectReason(
      call('journal.post', journal({ postingDate: addDays(TODAY, 1) }), admin),
      'future_date',
    );
    await expectReason(
      call('journal.post', journal({ postingDate: '2001-01-15' }), admin),
      'no_period',
    );
  });

  it('blocks closed periods, and soft-closed periods for users without that permission', async () => {
    const periods = await db
      .collection(`companies/${companyId}/periods`)
      .orderBy('startDate')
      .limit(1)
      .get();
    const first = periods.docs[0]!;
    const date = first.get('startDate') as string;

    await call('period.setStatus', { companyId, periodId: first.id, status: 'soft_closed' }, admin);
    const poster = await makeUser('poster@example.test');
    const { roleId } = await call<{ roleId: string }>(
      'role.create',
      { companyId, name: 'Poster', permissions: ['ledger.journal.post'] },
      admin,
    );
    await addMember(companyId, admin, poster, [roleId]);
    await expectReason(
      call('journal.post', journal({ postingDate: date }), poster),
      'period_soft_closed',
    );

    await call('period.setStatus', { companyId, periodId: first.id, status: 'closed' }, admin);
    await expectReason(
      call('journal.post', journal({ postingDate: date }), admin),
      'period_closed',
    );
  });

  it('requires a one-time approval, from someone else, to post beyond the backdating window', async () => {
    const accountant = await makeUser('acct@example.test');
    const manager = await makeUser('manager@example.test');
    await addMember(companyId, admin, accountant, ['accountant']);
    await addMember(companyId, admin, manager, ['manager']);

    // Inside the 3-day window: no approval needed.
    await call('journal.post', journal({ postingDate: addDays(TODAY, -3) }), accountant);

    await expectReason(
      call('journal.post', journal({ postingDate: BACKDATED }), accountant),
      'backdate_requires_approval',
    );
    const { approvalRequestId } = await call<{ approvalRequestId: string }>(
      'approval.request',
      {
        companyId,
        action: 'ledger.backdate',
        target: { postingDate: BACKDATED },
        reason: 'Supplier invoice found late',
      },
      accountant,
    );
    await expectReason(
      call(
        'journal.post',
        journal({ postingDate: BACKDATED, backdateApprovalId: approvalRequestId }),
        accountant,
      ),
      'approval_invalid',
    );
    await expectReason(
      call(
        'approval.decide',
        { companyId, approvalRequestId, decision: 'approved', reason: 'Self' },
        accountant,
      ),
      'missing_permission',
    );
    await call(
      'approval.decide',
      { companyId, approvalRequestId, decision: 'approved', reason: 'Checked the invoice' },
      manager,
    );
    // The approval belongs to the requester; another user cannot use it.
    await expectReason(
      call(
        'journal.post',
        journal({ postingDate: BACKDATED, backdateApprovalId: approvalRequestId }),
        admin,
      ),
      'approval_invalid',
    );
    const posted = await call<{ journalId: string }>(
      'journal.post',
      journal({ postingDate: BACKDATED, backdateApprovalId: approvalRequestId }),
      accountant,
    );
    const approval = (
      await db.doc(`companies/${companyId}/approvalRequests/${approvalRequestId}`).get()
    ).data()!;
    expect(approval).toMatchObject({ status: 'used', usedFor: posted.journalId });
    await expectReason(
      call(
        'journal.post',
        journal({ postingDate: BACKDATED, backdateApprovalId: approvalRequestId }),
        accountant,
      ),
      'approval_invalid',
    );
  });

  it('does not accept backdating requests for today or later', async () => {
    await expectReason(
      call(
        'approval.request',
        {
          companyId,
          action: 'ledger.backdate',
          target: { postingDate: TODAY },
          reason: 'Not needed',
        },
        admin,
      ),
      'not_backdated',
    );
  });
});

describe('L4 reversals', () => {
  it('posts a mirror journal, links both ways and nets the ledger to zero', async () => {
    const original = await call<{ journalId: string }>('journal.post', journal(), admin);
    const rev = await call<{ journalId: string; number: string }>(
      'journal.reverse',
      {
        companyId,
        journalId: original.journalId,
        postingDate: TODAY,
        reason: 'Posted to the wrong account',
      },
      admin,
    );
    expect(rev.number).toBe('RV-000001');
    const o = (await db.doc(`companies/${companyId}/journals/${original.journalId}`).get()).data()!;
    const r = (await db.doc(`companies/${companyId}/journals/${rev.journalId}`).get()).data()!;
    expect(o).toMatchObject({
      status: 'reversed',
      reversedByJournalId: rev.journalId,
      totalDebit: 125050,
    });
    expect(o.lines[0]).toMatchObject({ debit: 125050, credit: 0 });
    expect(r).toMatchObject({ origin: 'reversal', reversesJournalId: original.journalId });
    expect(r.lines[0]).toMatchObject({ accountCode: '6200', debit: 0, credit: 125050 });

    const tb = await balances(companyId);
    expect(tb.rows).toEqual([]);
    expect(tb.balanced).toBe(true);
  });

  it('refuses to reverse twice, to reverse a reversal, or to date a reversal before the original', async () => {
    const original = await call<{ journalId: string }>(
      'journal.post',
      journal({ postingDate: addDays(TODAY, -1) }),
      admin,
    );
    await expectReason(
      call(
        'journal.reverse',
        {
          companyId,
          journalId: original.journalId,
          postingDate: addDays(TODAY, -2),
          reason: 'Too early',
        },
        admin,
      ),
      'reversal_before_original',
    );
    const rev = await call<{ journalId: string }>(
      'journal.reverse',
      { companyId, journalId: original.journalId, postingDate: TODAY, reason: 'Wrong amount' },
      admin,
    );
    await expectReason(
      call(
        'journal.reverse',
        { companyId, journalId: original.journalId, postingDate: TODAY, reason: 'Again' },
        admin,
      ),
      'already_reversed',
    );
    await expectReason(
      call(
        'journal.reverse',
        { companyId, journalId: rev.journalId, postingDate: TODAY, reason: 'Undo' },
        admin,
      ),
      'not_reversible',
    );
  });

  it('needs the reverse permission', async () => {
    const original = await call<{ journalId: string }>('journal.post', journal(), admin);
    const manager = await makeUser('manager@example.test');
    await addMember(companyId, admin, manager, ['manager']);
    await expectReason(
      call(
        'journal.reverse',
        { companyId, journalId: original.journalId, postingDate: TODAY, reason: 'Nope' },
        manager,
      ),
      'missing_permission',
    );
  });
});

describe('L5 opening balances', () => {
  const opening = (overrides: Record<string, unknown> = {}) => ({
    companyId,
    branchId: 'HQ',
    asAtDate: TODAY,
    lines: [line('1120', '1000'), line('1510', '250'), line('2400', '', '400')],
    ...overrides,
  });

  it('posts the difference to opening balance equity, once', async () => {
    const res = await call<{ journalId: string; number: string; difference: string }>(
      'openingBalance.post',
      opening(),
      admin,
    );
    expect(res).toMatchObject({ number: 'OB-000001', difference: '-85000' });
    const j = (await db.doc(`companies/${companyId}/journals/${res.journalId}`).get()).data()!;
    expect(j.lines.at(-1)).toMatchObject({ accountCode: '3300', debit: 0, credit: 85000 });
    expect(j).toMatchObject({ totalDebit: 125000, totalCredit: 125000, origin: 'opening_balance' });

    await expectReason(call('openingBalance.post', opening(), admin), 'opening_balance_exists');

    await call(
      'journal.reverse',
      { companyId, journalId: res.journalId, postingDate: TODAY, reason: 'Wrong bank balance' },
      admin,
    );
    await expect(call('openingBalance.post', opening(), admin)).resolves.toMatchObject({
      number: 'OB-000002',
    });
  });

  it('keeps control accounts and the equity account out of the general opening journal', async () => {
    await expectReason(
      call('openingBalance.post', opening({ lines: [line('1200', '500')] }), admin),
      'control_account',
    );
    await expectReason(
      call(
        'openingBalance.post',
        opening({ lines: [line('3300', '', '500'), line('1120', '500')] }),
        admin,
      ),
      'opening_equity_entered',
    );
  });
});

describe('L6 ledger invariants', () => {
  it('every journal balances and the trial balance agrees with the journals', async () => {
    await call('journal.post', journal(), admin);
    await call(
      'journal.post',
      journal({ lines: [line('1110', '5000'), line('4100', '', '5000')] }),
      admin,
    );
    await call(
      'openingBalance.post',
      { companyId, branchId: 'HQ', asAtDate: TODAY, lines: [line('1120', '700')] },
      admin,
    );
    const journals = await db.collection(`companies/${companyId}/journals`).get();
    for (const j of journals.docs) {
      const lines = j.get('lines') as { debit: number; credit: number }[];
      const debit = lines.reduce((s, l) => s + l.debit, 0);
      const credit = lines.reduce((s, l) => s + l.credit, 0);
      expect(debit).toBe(credit);
      expect(debit).toBe(j.get('totalDebit'));
      expect(debit).toBeGreaterThan(0);
    }
    const tb = await balances(companyId);
    expect(tb.balanced).toBe(true);
    expect(tb.rows.find((r) => r.code === '1110')).toMatchObject({ debit: 500000n - 125050n });
    expect(tb.rows.find((r) => r.code === '4100')).toMatchObject({ credit: 500000n });
  });
});
