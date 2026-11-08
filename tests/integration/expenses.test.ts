import { AggregateField } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { addDays, businessDate } from '@bms/domain';
import type { Caller } from '../../functions/src/lib/command.js';
import {
  addMember,
  call,
  createCompany,
  db,
  expectReason,
  fundMoneyAccounts,
  makeUser,
  resetEmulators,
  TEST_FUNDING,
} from './helpers.js';

const TODAY = businessDate(new Date(), 'Africa/Lagos');
/** A financial year that starts well before today, so a backdated date has a period. */
const FY_START_MONTH = Number(addDays(TODAY, -40).slice(5, 7));

let admin: Caller;
let manager: Caller;
let accountant: Caller;
let store: Caller;
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

function expense(payment: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    companyId,
    branchId: 'HQ',
    expenseDate: TODAY,
    lines: [
      { accountId: ids['6500'], description: 'Generator repair', amount: '45,000' },
      { accountId: ids['6900'], description: 'Printer toner', amount: '12,500.50' },
    ],
    payment,
    ...extra,
  };
}

const paidFromCash = { mode: 'paid', paymentAccountId: '', payee: 'Ade Repairs' };

async function supplier(code: string, name: string, paymentTermsDays = 30) {
  const { supplierId } = await call<{ supplierId: string }>(
    'supplier.create',
    { companyId, code, name, paymentTermsDays },
    accountant,
  );
  return supplierId;
}

type Posted = {
  expenseId: string;
  number: string;
  journalId: string;
  purchaseInvoiceId: string | null;
};

beforeEach(async () => {
  await resetEmulators();
  admin = await makeUser('owner@example.test');
  manager = await makeUser('manager@example.test');
  accountant = await makeUser('accounts@example.test');
  store = await makeUser('store@example.test');
  ({ companyId } = await createCompany(admin, { fiscalYearStartMonth: FY_START_MONTH }));
  await addMember(companyId, admin, manager, ['manager']);
  await addMember(companyId, admin, accountant, ['accountant']);
  await addMember(companyId, admin, store, ['store_officer']);
  const accounts = await db.collection(`${base()}/accounts`).get();
  ids = Object.fromEntries(accounts.docs.map((d) => [d.get('code') as string, d.id]));
  paidFromCash.paymentAccountId = ids['1110']!;
});

describe('business expenses', () => {
  it('a manager records an expense paid from cash; the journal is posted for them', async () => {
    await fundMoneyAccounts(companyId);
    const res = await call<Posted>('expense.post', expense(paidFromCash), manager);
    expect(res.number).toBe('EXP-000001');
    expect(res.purchaseInvoiceId).toBeNull();

    const x = await doc(`expenses/${res.expenseId}`);
    expect(x).toMatchObject({
      mode: 'paid',
      payee: 'Ade Repairs',
      supplierId: null,
      paymentAccountId: ids['1110'],
      subtotalMinor: 5_750_050,
      inputTaxMinor: 0,
      totalMinor: 5_750_050,
      journalId: res.journalId,
    });
    expect(x.lines).toHaveLength(2);
    expect(x.lines[0]).toMatchObject({ accountCode: '6500', amountMinor: 4_500_000 });

    const j = await doc(`journals/${res.journalId}`);
    expect(j).toMatchObject({
      origin: 'system',
      source: { type: 'expense', id: res.expenseId, number: 'EXP-000001' },
      totalDebit: 5_750_050,
    });
    expect(await balance('6500')).toBe(4_500_000);
    expect(await balance('6900')).toBe(1_250_050);
    expect(await balance('1110')).toBe(TEST_FUNDING - 5_750_050);

    const audit = await db
      .collection(`${base()}/auditLogs`)
      .where('action', '==', 'expense.post')
      .get();
    expect(audit.size).toBe(1);
  });

  it('records input tax and names a supplier on file as the payee', async () => {
    await fundMoneyAccounts(companyId);
    const mills = await supplier('S1', 'Lagos Office Supplies');
    const res = await call<Posted>(
      'expense.post',
      expense(
        { mode: 'paid', paymentAccountId: ids['1120'], supplierId: mills },
        { inputTax: '4,312.54', reference: 'RCPT-77' },
      ),
      accountant,
    );
    const x = await doc(`expenses/${res.expenseId}`);
    expect(x).toMatchObject({ payee: 'Lagos Office Supplies', supplierId: mills });
    expect(x.totalMinor).toBe(5_750_050 + 431_254);
    expect(await balance('1400')).toBe(431_254);
    expect(await balance('1120')).toBe(TEST_FUNDING - 5_750_050 - 431_254);
    // Paying now does not change what is owed to the supplier.
    expect((await doc(`suppliers/${mills}`)).balanceMinor).toBe(0);
  });

  it('on credit, owes the supplier through a purchase invoice that can then be paid', async () => {
    await fundMoneyAccounts(companyId);
    const fixit = await supplier('S2', 'Fixit Services', 14);
    const res = await call<Posted>(
      'expense.post',
      expense({ mode: 'credit', supplierId: fixit }, { reference: 'FX-1001' }),
      manager,
    );
    expect(res.purchaseInvoiceId).toBeTruthy();
    const inv = await doc(`purchaseInvoices/${res.purchaseInvoiceId}`);
    expect(inv).toMatchObject({
      kind: 'invoice',
      supplierId: fixit,
      supplierInvoiceNo: 'FX-1001',
      dueDate: addDays(TODAY, 14),
      totalMinor: 5_750_050,
      status: 'open',
      journalId: res.journalId,
    });
    expect(inv.lines.map((l: { kind: string }) => l.kind)).toEqual(['expense', 'expense']);
    const x = await doc(`expenses/${res.expenseId}`);
    expect(x).toMatchObject({
      mode: 'credit',
      purchaseInvoiceId: res.purchaseInvoiceId,
      paymentAccountId: null,
    });
    expect((await doc(`suppliers/${fixit}`)).balanceMinor).toBe(5_750_050);
    expect(await balance('2100')).toBe(-5_750_050);
    expect(await balance('1110')).toBe(TEST_FUNDING);

    // The same supplier invoice number cannot be recorded twice.
    await expectReason(
      call(
        'expense.post',
        expense({ mode: 'credit', supplierId: fixit }, { reference: 'fx-1001' }),
        manager,
      ),
      'duplicate_supplier_invoice',
    );

    await call(
      'supplierPayment.post',
      {
        companyId,
        supplierId: fixit,
        branchId: 'HQ',
        postingDate: TODAY,
        paymentAccountId: ids['1120'],
        amount: '57,500.50',
        allocations: [{ invoiceId: res.purchaseInvoiceId, amount: '57,500.50' }],
      },
      manager,
    );
    expect((await doc(`purchaseInvoices/${res.purchaseInvoiceId}`)).status).toBe('paid');
    expect((await doc(`suppliers/${fixit}`)).balanceMinor).toBe(0);
  });

  it('refuses a payment that would overdraw the cash account (DECISION 23)', async () => {
    await fundMoneyAccounts(companyId, ['bank']);
    await expectReason(call('expense.post', expense(paidFromCash), manager), 'insufficient_funds');
    expect((await db.collection(`${base()}/expenses`).count().get()).data().count).toBe(0);
  });

  it('only charges expense accounts, so capital items go to Fixed assets', async () => {
    await fundMoneyAccounts(companyId);
    for (const code of ['1530', '5100', '6600', '1110']) {
      if (!ids[code]) continue;
      await expectReason(
        call(
          'expense.post',
          {
            ...expense(paidFromCash),
            lines: [{ accountId: ids[code], description: 'Laptop', amount: '400,000' }],
          },
          manager,
        ),
        'account_invalid',
      );
    }
    await expectReason(
      call('expense.post', expense({ ...paidFromCash, paymentAccountId: ids['2100'] }), manager),
      'account_invalid',
    );
  });

  it('needs approval to backdate beyond the window', async () => {
    await fundMoneyAccounts(companyId);
    await call('expense.post', expense(paidFromCash, { expenseDate: addDays(TODAY, -3) }), manager);
    await expectReason(
      call('expense.post', expense(paidFromCash, { expenseDate: addDays(TODAY, -10) }), manager),
      'backdate_requires_approval',
    );
  });

  it('follows the payment and invoice permissions: store officers cannot post', async () => {
    await fundMoneyAccounts(companyId);
    const fixit = await supplier('S2', 'Fixit Services');
    await expectReason(call('expense.post', expense(paidFromCash), store), 'missing_permission');
    await expectReason(
      call('expense.post', expense({ mode: 'credit', supplierId: fixit }), store),
      'missing_permission',
    );
  });
});
