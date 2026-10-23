import { beforeEach, describe, expect, it } from 'vitest';
import { addDays, businessDate, openItemsAsAt } from '@bms/domain';
import type { Caller } from '../../functions/src/lib/command.js';
import { addMember, call, createCompany, db, makeUser, resetEmulators } from './helpers.js';

const TODAY = businessDate(new Date(), 'Africa/Lagos');
const FY_START_MONTH = Number(addDays(TODAY, -100).slice(5, 7));
const D1 = addDays(TODAY, -30);
const D2 = addDays(TODAY, -10);

let admin: Caller;
let accountant: Caller;
let companyId: string;
let ids: Record<string, string>;

const base = () => `companies/${companyId}`;

async function settlements(ledger: string) {
  const snap = await db.collection(`${base()}/settlements`).where('ledger', '==', ledger).get();
  return snap.docs
    .map((d) => d.data())
    .sort((a, b) => (a.date as string).localeCompare(b.date as string));
}

beforeEach(async () => {
  await resetEmulators();
  admin = await makeUser('owner@example.test');
  accountant = await makeUser('accounts@example.test');
  ({ companyId } = await createCompany(admin, { fiscalYearStartMonth: FY_START_MONTH }));
  await addMember(companyId, admin, accountant, ['accountant']);
  await call('company.updateSettings', { companyId, backdateWindowDays: 366 }, admin);
  const snap = await db.collection(`${base()}/accounts`).get();
  ids = Object.fromEntries(snap.docs.map((d) => [d.get('code') as string, d.id]));
});

describe('settlements for ageing at a past date', () => {
  it('records each receipt allocation on its date, so past balances can be rebuilt', async () => {
    const { customerId } = await call<{ customerId: string }>(
      'customer.create',
      { companyId, code: 'SHOP', name: 'Shop', paymentTermsDays: 30, creditLimit: '0' },
      accountant,
    );
    const { invoiceId } = await call<{ invoiceId: string }>(
      'customerOpeningBalance.post',
      { companyId, customerId, branchId: 'HQ', asAtDate: D1, reference: 'OLD-1', amount: '1000' },
      accountant,
    );
    const { receiptId } = await call<{ receiptId: string }>(
      'customerReceipt.post',
      {
        companyId,
        customerId,
        branchId: 'HQ',
        postingDate: D2,
        depositAccountId: ids['1110'],
        amount: '700',
        allocations: [{ invoiceId, amount: '400' }],
      },
      accountant,
    );
    // The rest of the receipt is applied today.
    await call(
      'customerReceipt.allocate',
      { companyId, receiptId, allocations: [{ invoiceId, amount: '300' }] },
      accountant,
    );
    const rows = await settlements('receivable');
    expect(rows.map((r) => [r.date, r.amountMinor, r.kind, r.sourceType])).toEqual([
      [D2, 40_000, 'allocation', 'customerReceipt'],
      [TODAY, 30_000, 'allocation', 'customerReceipt'],
    ]);
    const invoice = (await db.doc(`${base()}/salesInvoices/${invoiceId}`).get()).data()!;
    const asAt = (date: string) =>
      openItemsAsAt(
        [
          {
            id: invoiceId,
            partyId: customerId,
            partyName: 'Shop',
            invoiceDate: invoice.invoiceDate,
            dueDate: invoice.dueDate,
            totalMinor: BigInt(invoice.totalMinor),
            paidAtInvoiceMinor: 0n,
          },
        ],
        rows.map((r) => ({
          invoiceId: r.invoiceId,
          date: r.date,
          amountMinor: BigInt(r.amountMinor),
        })),
        date,
      ).map((i) => i.outstanding);
    expect(asAt(addDays(D1, -1))).toEqual([]);
    expect(asAt(D1)).toEqual([100_000n]);
    expect(asAt(D2)).toEqual([60_000n]);
    // Today it agrees with the invoice itself.
    expect(asAt(TODAY)).toEqual([
      BigInt(invoice.totalMinor - invoice.paidMinor - invoice.creditedMinor),
    ]);
  });

  it('records supplier payment allocations against the payable side', async () => {
    const { supplierId } = await call<{ supplierId: string }>(
      'supplier.create',
      { companyId, code: 'MILLS', name: 'Mills', paymentTermsDays: 30 },
      accountant,
    );
    const { invoiceId } = await call<{ invoiceId: string }>(
      'supplierOpeningBalance.post',
      {
        companyId,
        supplierId,
        branchId: 'HQ',
        asAtDate: D1,
        supplierInvoiceNo: 'OLD-77',
        amount: '500',
      },
      accountant,
    );
    await call(
      'supplierPayment.post',
      {
        companyId,
        supplierId,
        branchId: 'HQ',
        postingDate: D2,
        paymentAccountId: ids['1120'],
        amount: '200',
        allocations: [{ invoiceId, amount: '200' }],
      },
      accountant,
    );
    const rows = await settlements('payable');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      invoiceId,
      partyId: supplierId,
      date: D2,
      amountMinor: 20_000,
      sourceType: 'supplierPayment',
    });
    expect(await settlements('receivable')).toEqual([]);
  });
});
