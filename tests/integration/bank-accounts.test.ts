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

let admin: Caller;
let accountant: Caller;
let sales: Caller;
let companyId: string;

const base = () => `companies/${companyId}`;
const account = async (id: string) => (await db.doc(`${base()}/accounts/${id}`).get()).data()!;
async function byCode(code: string) {
  const snap = await db.collection(`${base()}/accounts`).where('code', '==', code).get();
  return snap.docs[0]!;
}

const gtb = {
  bankName: 'GTBank',
  accountName: 'Adezmold Trading Ltd',
  accountNumber: '0123 456 789',
};

function create(by: Caller, input: Record<string, unknown>) {
  return call<{ accountId: string }>('bankAccount.create', { companyId, ...input }, by);
}

beforeEach(async () => {
  await resetEmulators();
  admin = await makeUser('owner@example.test');
  accountant = await makeUser('accounts@example.test');
  sales = await makeUser('sales@example.test');
  ({ companyId } = await createCompany(admin));
  await addMember(companyId, admin, accountant, ['accountant']);
  await addMember(companyId, admin, sales, ['sales_officer']);
});

describe('company bank accounts', () => {
  it('creates a Bank ledger account with the bank details, under the chosen heading', async () => {
    const heading = await byCode('1100');
    const { accountId } = await create(accountant, {
      ...gtb,
      ledger: { mode: 'new', code: '1121', name: 'GTBank 6789', parentId: heading.id },
    });
    const doc = await account(accountId);
    expect(doc).toMatchObject({
      code: '1121',
      name: 'GTBank 6789',
      type: 'asset',
      subtype: 'bank',
      isPostable: true,
      isControl: false,
      status: 'active',
      parentId: heading.id,
      bank: {
        bankName: 'GTBank',
        accountName: 'Adezmold Trading Ltd',
        accountNumber: '0123456789',
        currency: 'NGN',
      },
    });
    const audit = await db
      .collection(`${base()}/auditLogs`)
      .where('action', '==', 'bankAccount.create')
      .get();
    expect(audit.size).toBe(1);
  });

  it('adds bank details to the template bank account', async () => {
    const existing = await byCode('1120');
    await create(accountant, { ...gtb, ledger: { mode: 'existing', accountId: existing.id } });
    expect((await account(existing.id)).bank.accountNumber).toBe('0123456789');
    // Details can be added once; after that they are edited.
    await expectReason(
      create(accountant, {
        ...gtb,
        accountNumber: '9999999999',
        ledger: { mode: 'existing', accountId: existing.id },
      }),
      'bank_details_exist',
    );
  });

  it('only links accounts with the Bank role', async () => {
    const cash = await byCode('1110');
    await expectReason(
      create(accountant, { ...gtb, ledger: { mode: 'existing', accountId: cash.id } }),
      'account_invalid',
    );
  });

  it('refuses the same bank and number twice, and a taken code', async () => {
    await create(accountant, { ...gtb, ledger: { mode: 'new', code: '1121', name: 'GTBank' } });
    await expectReason(
      create(accountant, {
        ...gtb,
        bankName: 'gtbank',
        ledger: { mode: 'new', code: '1122', name: 'GTBank again' },
      }),
      'bank_account_exists',
    );
    // The same number at another bank is a different account.
    await create(accountant, {
      ...gtb,
      bankName: 'Zenith Bank',
      ledger: { mode: 'new', code: '1122', name: 'Zenith' },
    });
    await expectReason(
      create(accountant, {
        ...gtb,
        accountNumber: '5555555555',
        ledger: { mode: 'new', code: '1120', name: 'Clash' },
      }),
      'code_taken',
    );
  });

  it('keeps bank accounts in the company currency for now', async () => {
    await expectReason(
      create(accountant, {
        ...gtb,
        currency: 'USD',
        ledger: { mode: 'new', code: '1121', name: 'Dollar account' },
      }),
      'currency_unsupported',
    );
  });

  it('rejects a malformed account number', async () => {
    await expectReason(
      create(accountant, {
        ...gtb,
        accountNumber: '12',
        ledger: { mode: 'new', code: '1121', name: 'Short' },
      }),
      'validation_failed',
    );
  });

  it('needs ledger.accounts.manage', async () => {
    await expectReason(
      create(sales, { ...gtb, ledger: { mode: 'new', code: '1121', name: 'GTBank' } }),
      'missing_permission',
    );
  });

  it('edits details and deactivates, after which payments cannot use it', async () => {
    const { accountId } = await create(accountant, {
      ...gtb,
      ledger: { mode: 'new', code: '1121', name: 'GTBank' },
    });
    await call(
      'bankAccount.update',
      {
        companyId,
        accountId,
        accountName: 'Adezmold Trading Limited',
        accountNumber: '0123456780',
      },
      accountant,
    );
    expect((await account(accountId)).bank).toMatchObject({
      bankName: 'GTBank',
      accountName: 'Adezmold Trading Limited',
      accountNumber: '0123456780',
    });

    // A receipt into the new account works while it is active.
    const { customerId } = await call<{ customerId: string }>(
      'customer.create',
      { companyId, code: 'C1', name: 'Customer one', paymentTermsDays: 30, creditLimit: '0' },
      admin,
    );
    const branchId = (await db.collection(`${base()}/branches`).get()).docs[0]!.id;
    const receipt = (key?: string) =>
      call(
        'customerReceipt.post',
        {
          companyId,
          customerId,
          branchId,
          postingDate: TODAY,
          depositAccountId: accountId,
          amount: '100',
          allocations: [],
        },
        admin,
        key,
      );
    await receipt();

    await call('bankAccount.update', { companyId, accountId, status: 'inactive' }, accountant);
    expect((await account(accountId)).status).toBe('inactive');
    await expectReason(receipt(), 'account_invalid');

    await call('bankAccount.update', { companyId, accountId, status: 'active' }, accountant);
    expect((await account(accountId)).status).toBe('active');
  });

  it('refuses to edit an account that is not a registered bank account', async () => {
    const plain = await byCode('1120');
    await expectReason(
      call(
        'bankAccount.update',
        { companyId, accountId: plain.id, bankName: 'X Bank' },
        accountant,
      ),
      'bank_account_not_found',
    );
  });
});
