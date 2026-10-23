import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getAggregateFromServer,
  getDoc,
  getDocs,
  query,
  setDoc,
  sum,
  updateDoc,
  where,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { roleTemplate } from '@bms/domain';

let env: RulesTestEnvironment;

const ADMIN_A = 'admin-a';
const AUDITOR_A = 'auditor-a';
const SALES_A = 'sales-a';
const SUSPENDED_A = 'suspended-a';
const ADMIN_B = 'admin-b';

function member(uid: string, roleId: Parameters<typeof roleTemplate>[0], status = 'active') {
  return {
    uid,
    email: `${uid}@example.test`,
    status,
    roleIds: [roleId],
    permissions: [...roleTemplate(roleId).permissions],
    branchScope: 'all',
  };
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-bms',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [companyId, members] of [
      [
        'A',
        [
          member(ADMIN_A, 'company_admin'),
          member(AUDITOR_A, 'auditor'),
          member(SALES_A, 'sales_officer'),
          member(SUSPENDED_A, 'company_admin', 'suspended'),
        ],
      ],
      ['B', [member(ADMIN_B, 'company_admin')]],
    ] as const) {
      await setDoc(doc(db, `companies/${companyId}`), {
        legalName: `Company ${companyId}`,
        status: 'active',
      });
      await setDoc(doc(db, `companies/${companyId}/settings/general`), { backdateWindowDays: 3 });
      await setDoc(doc(db, `companies/${companyId}/roles/company_admin`), {
        name: 'Company Admin',
      });
      await setDoc(doc(db, `companies/${companyId}/branches/HQ`), { name: 'Head office' });
      await setDoc(doc(db, `companies/${companyId}/periods/2026-10`), { status: 'open' });
      await setDoc(doc(db, `companies/${companyId}/auditLogs/log1`), { action: 'company.create' });
      await setDoc(doc(db, `companies/${companyId}/commands/key1`), { name: 'company.create' });
      await setDoc(doc(db, `companies/${companyId}/accounts/acc1`), { code: '1110', name: 'Cash' });
      await setDoc(doc(db, `companies/${companyId}/journals/j1`), { number: 'JV-000001' });
      await setDoc(doc(db, `companies/${companyId}/ledgerEntries/j1_1`), {
        journalId: 'j1',
        accountId: 'acc1',
        postingDate: '2026-10-01',
        debit: 100,
        credit: 0,
      });
      await setDoc(doc(db, `companies/${companyId}/numberSeries/journal.manual`), { next: 2 });
      await setDoc(doc(db, `companies/${companyId}/products/p1`), { sku: 'CEM', name: 'Cement' });
      await setDoc(doc(db, `companies/${companyId}/locations/HQ-store`), { branchId: 'HQ' });
      await setDoc(doc(db, `companies/${companyId}/stockBalances/p1__HQ-store`), {
        productId: 'p1',
        qtyMilli: 1000,
        valueMinor: 500,
      });
      await setDoc(doc(db, `companies/${companyId}/stockMovements/m1`), { productId: 'p1' });
      await setDoc(doc(db, `companies/${companyId}/stockAdjustments/a1`), { status: 'pending' });
      await setDoc(doc(db, `companies/${companyId}/costLayers/l1`), { productId: 'p1' });
      await setDoc(doc(db, `companies/${companyId}/suppliers/s1`), { code: 'S1', name: 'Mills' });
      await setDoc(doc(db, `companies/${companyId}/goodsReceipts/g1`), { number: 'GRN-000001' });
      await setDoc(doc(db, `companies/${companyId}/purchaseInvoices/i1`), { number: 'PI-000001' });
      await setDoc(doc(db, `companies/${companyId}/supplierPayments/sp1`), { number: 'SP-000001' });
      await setDoc(doc(db, `companies/${companyId}/supplierReturns/sr1`), { number: 'SR-000001' });
      await setDoc(doc(db, `companies/${companyId}/supplierInvoiceKeys/k1`), { invoiceId: 'i1' });
      await setDoc(doc(db, `companies/${companyId}/stockAvailability/p1__HQ-store`), {
        productId: 'p1',
        qtyMilli: 1000,
      });
      await setDoc(doc(db, `companies/${companyId}/taxCodes/t1`), { code: 'VAT', rateBp: 750 });
      await setDoc(doc(db, `companies/${companyId}/customers/c1`), { code: 'C1', name: 'Shop' });
      await setDoc(doc(db, `companies/${companyId}/salesInvoices/si1`), {
        number: 'SI-000001',
        customerId: 'c1',
        postedBy: ADMIN_A,
      });
      await setDoc(doc(db, `companies/${companyId}/salesInvoices/si2`), {
        number: 'SI-000002',
        customerId: 'c1',
        postedBy: SALES_A,
      });
      await setDoc(doc(db, `companies/${companyId}/customerReceipts/cr1`), {
        number: 'CR-000001',
        customerId: 'c1',
        postedBy: ADMIN_A,
      });
      await setDoc(doc(db, `companies/${companyId}/customerReceipts/cr2`), {
        number: 'CR-000002',
        customerId: 'c1',
        postedBy: SALES_A,
      });
      await setDoc(doc(db, `companies/${companyId}/creditNotes/cn1`), {
        number: 'CN-000001',
        customerId: 'c1',
        createdBy: ADMIN_A,
      });
      await setDoc(doc(db, `companies/${companyId}/creditNotes/cn2`), {
        number: 'CN-000002',
        customerId: 'c1',
        createdBy: SALES_A,
      });
      await setDoc(doc(db, `companies/${companyId}/customerRefunds/rf1`), {
        number: 'RF-000001',
        customerId: 'c1',
        createdBy: ADMIN_A,
      });
      await setDoc(doc(db, `companies/${companyId}/customerRefunds/rf2`), {
        number: 'RF-000002',
        customerId: 'c1',
        createdBy: SALES_A,
      });
      await setDoc(doc(db, `companies/${companyId}/bankStates/acc1`), {
        reconciledBalanceMinor: 100,
      });
      await setDoc(doc(db, `companies/${companyId}/bankReconciliations/br1`), {
        accountId: 'acc1',
      });
      await setDoc(doc(db, `companies/${companyId}/bankClearings/j1_1`), {
        accountId: 'acc1',
        reconciliationId: 'br1',
      });
      await setDoc(doc(db, `companies/${companyId}/fixedAssets/fa1`), {
        number: 'FA-000001',
        status: 'active',
      });
      await setDoc(doc(db, `companies/${companyId}/depreciationRuns/dr1`), { month: '2026-09' });
      await setDoc(doc(db, `companies/${companyId}/settlements/st1`), {
        ledger: 'receivable',
        date: '2026-10-01',
      });
      await setDoc(doc(db, `companies/${companyId}/settlements/st2`), {
        ledger: 'payable',
        date: '2026-10-01',
      });
      for (const m of members) await setDoc(doc(db, `companies/${companyId}/members/${m.uid}`), m);
    }
    await setDoc(doc(db, `users/${ADMIN_A}`), {
      email: 'admin-a@example.test',
      defaultCompanyId: 'A',
    });
    await setDoc(doc(db, `users/${ADMIN_A}/memberships/A`), { status: 'active' });
    await setDoc(doc(db, 'invitations/inv1'), {
      companyId: 'A',
      email: 'new@example.test',
      tokenHash: 'x',
    });
    await setDoc(doc(db, 'platformAdmins/root'), { grantedAt: 1 });
  });
});

const db = (uid?: string) =>
  (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();

const COMPANY_PATHS = [
  'companies/A',
  'companies/A/settings/general',
  'companies/A/roles/company_admin',
  'companies/A/branches/HQ',
  'companies/A/periods/2026-10',
  'companies/A/auditLogs/log1',
  'companies/A/members/admin-a',
  'companies/A/accounts/acc1',
  'companies/A/journals/j1',
  'companies/A/ledgerEntries/j1_1',
  'companies/A/products/p1',
  'companies/A/locations/HQ-store',
  'companies/A/stockBalances/p1__HQ-store',
  'companies/A/stockMovements/m1',
  'companies/A/stockAdjustments/a1',
  'companies/A/suppliers/s1',
  'companies/A/goodsReceipts/g1',
  'companies/A/purchaseInvoices/i1',
  'companies/A/supplierPayments/sp1',
  'companies/A/supplierReturns/sr1',
  'companies/A/stockAvailability/p1__HQ-store',
  'companies/A/taxCodes/t1',
  'companies/A/customers/c1',
  'companies/A/salesInvoices/si1',
  'companies/A/customerReceipts/cr1',
  'companies/A/creditNotes/cn1',
  'companies/A/customerRefunds/rf1',
  'companies/A/bankStates/acc1',
  'companies/A/bankReconciliations/br1',
  'companies/A/bankClearings/j1_1',
  'companies/A/fixedAssets/fa1',
  'companies/A/depreciationRuns/dr1',
  'companies/A/settlements/st1',
  'companies/A/settlements/st2',
];

describe('C1 unauthenticated access', () => {
  it.each(COMPANY_PATHS)('cannot read %s', async (path) => {
    await assertFails(getDoc(doc(db(), path)));
  });
});

describe('C2 cross-tenant isolation', () => {
  it.each(COMPANY_PATHS)('admin of B cannot read %s', async (path) => {
    await assertFails(getDoc(doc(db(ADMIN_B), path)));
  });
  it('admin of B cannot list A members or audit logs', async () => {
    await assertFails(getDocs(collection(db(ADMIN_B), 'companies/A/members')));
    await assertFails(getDocs(collection(db(ADMIN_B), 'companies/A/auditLogs')));
  });
  it('admin of A can read A', async () => {
    for (const path of COMPANY_PATHS) await assertSucceeds(getDoc(doc(db(ADMIN_A), path)));
  });
  it('admin of B cannot read A invitations', async () => {
    await assertFails(getDoc(doc(db(ADMIN_B), 'invitations/inv1')));
    await assertSucceeds(getDoc(doc(db(ADMIN_A), 'invitations/inv1')));
  });
});

describe('C3 no client writes to company data', () => {
  const writes: [string, Record<string, unknown>][] = [
    ['companies/A', { legalName: 'Hacked' }],
    ['companies/A/members/admin-a', { status: 'active', permissions: ['company.members.manage'] }],
    ['companies/A/members/new-user', member('new-user', 'company_admin')],
    ['companies/A/roles/company_admin', { permissions: [] }],
    ['companies/A/settings/general', { backdateWindowDays: 999 }],
    ['companies/A/periods/2026-10', { status: 'open' }],
    ['companies/A/branches/X', { name: 'X' }],
    ['companies/A/commands/key2', { name: 'x' }],
    ['companies/A/accounts/acc2', { code: '9999', name: 'Suspense' }],
    ['companies/A/journals/j2', { number: 'JV-000002', totalDebit: 1, totalCredit: 1 }],
    ['companies/A/ledgerEntries/j2_1', { accountId: 'acc1', debit: 1, credit: 0 }],
    ['companies/A/numberSeries/journal.manual', { next: 1 }],
    ['companies/A/settings/ledger', { openingBalanceJournalId: null }],
    ['companies/A/products/p2', { sku: 'X', name: 'X' }],
    ['companies/A/stockBalances/p1__HQ-store', { qtyMilli: 999999, valueMinor: 1 }],
    ['companies/A/stockMovements/m2', { productId: 'p1', qtyMilli: 1 }],
    ['companies/A/stockAdjustments/a1', { status: 'posted' }],
    ['companies/A/costLayers/l2', { productId: 'p1' }],
    ['companies/A/suppliers/s1', { balanceMinor: 0 }],
    ['companies/A/suppliers/s2', { code: 'S2', name: 'New' }],
    ['companies/A/goodsReceipts/g2', { number: 'GRN-000002' }],
    ['companies/A/purchaseInvoices/i1', { paidMinor: 999 }],
    ['companies/A/supplierPayments/sp2', { amountMinor: 1 }],
    ['companies/A/supplierReturns/sr2', { creditMinor: 1 }],
    ['companies/A/supplierInvoiceKeys/k2', { invoiceId: 'x' }],
    ['companies/A/stockAvailability/p1__HQ-store', { qtyMilli: 999999 }],
    ['companies/A/taxCodes/t2', { code: 'X', rateBp: 0 }],
    ['companies/A/customers/c1', { creditLimitMinor: 99999999 }],
    ['companies/A/customers/c2', { code: 'C2', name: 'New' }],
    ['companies/A/salesInvoices/si2', { paidMinor: 999 }],
    ['companies/A/salesInvoices/si3', { number: 'SI-000003', postedBy: SALES_A }],
    ['companies/A/customerReceipts/cr3', { amountMinor: 1, postedBy: SALES_A }],
    ['companies/A/creditNotes/cn2', { status: 'posted' }],
    ['companies/A/creditNotes/cn3', { number: 'CN-000003', createdBy: SALES_A }],
    ['companies/A/customerRefunds/rf2', { status: 'posted' }],
    ['companies/A/customerRefunds/rf3', { amountMinor: 1, createdBy: SALES_A }],
    ['companies/A/bankStates/acc1', { reconciledBalanceMinor: 0 }],
    ['companies/A/bankReconciliations/br2', { accountId: 'acc1' }],
    ['companies/A/bankClearings/j2_1', { accountId: 'acc1' }],
    ['companies/A/fixedAssets/fa1', { status: 'disposed' }],
    ['companies/A/fixedAssets/fa2', { number: 'FA-000002', costMinor: 1 }],
    ['companies/A/depreciationRuns/dr2', { month: '2026-10' }],
    ['companies/A/settlements/st3', { ledger: 'receivable', amountMinor: 1 }],
    ['companies/NEW', { legalName: 'Self-made' }],
    ['invitations/inv2', { companyId: 'A' }],
  ];
  it.each(writes)('admin of A cannot set %s', async (path, data) => {
    await assertFails(setDoc(doc(db(ADMIN_A), path), data));
  });
  it('admin of A cannot update or delete company documents', async () => {
    await assertFails(updateDoc(doc(db(ADMIN_A), 'companies/A'), { status: 'suspended' }));
    await assertFails(deleteDoc(doc(db(ADMIN_A), 'companies/A/branches/HQ')));
  });
  it('idempotency records are not readable', async () => {
    await assertFails(getDoc(doc(db(ADMIN_A), 'companies/A/commands/key1')));
  });
});

describe('ledger records (Phase 2)', () => {
  it('posted journals and ledger entries cannot be edited or deleted from a client', async () => {
    await assertFails(updateDoc(doc(db(ADMIN_A), 'companies/A/journals/j1'), { status: 'x' }));
    await assertFails(deleteDoc(doc(db(ADMIN_A), 'companies/A/journals/j1')));
    await assertFails(updateDoc(doc(db(ADMIN_A), 'companies/A/ledgerEntries/j1_1'), { debit: 1 }));
    await assertFails(deleteDoc(doc(db(ADMIN_A), 'companies/A/ledgerEntries/j1_1')));
    await assertFails(updateDoc(doc(db(ADMIN_A), 'companies/A/accounts/acc1'), { name: 'x' }));
  });
  it('sales officers see the chart, to choose a cash account, but not the ledger', async () => {
    await assertSucceeds(getDoc(doc(db(SALES_A), 'companies/A/accounts/acc1')));
    for (const path of ['companies/A/journals/j1', 'companies/A/ledgerEntries/j1_1']) {
      await assertFails(getDoc(doc(db(SALES_A), path)));
      await assertSucceeds(getDoc(doc(db(AUDITOR_A), path)));
    }
  });
  it('balance aggregation follows the same rules', async () => {
    const entries = (uid: string) =>
      query(collection(db(uid), 'companies/A/ledgerEntries'), where('accountId', '==', 'acc1'));
    await assertSucceeds(getAggregateFromServer(entries(AUDITOR_A), { d: sum('debit') }));
    await assertFails(getAggregateFromServer(entries(SALES_A), { d: sum('debit') }));
    await assertFails(getAggregateFromServer(entries(ADMIN_B), { d: sum('debit') }));
  });
  it('number series are server-only', async () => {
    await assertFails(getDoc(doc(db(ADMIN_A), 'companies/A/numberSeries/journal.manual')));
  });
});

describe('inventory records (Phase 3)', () => {
  it('sales officers see products but not stock values, movements or adjustments', async () => {
    await assertSucceeds(getDoc(doc(db(SALES_A), 'companies/A/products/p1')));
    for (const path of [
      'companies/A/stockBalances/p1__HQ-store',
      'companies/A/stockMovements/m1',
      'companies/A/stockAdjustments/a1',
    ]) {
      await assertFails(getDoc(doc(db(SALES_A), path)));
      await assertSucceeds(getDoc(doc(db(AUDITOR_A), path)));
    }
  });
  it('cost layers are server-only', async () => {
    await assertFails(getDoc(doc(db(ADMIN_A), 'companies/A/costLayers/l1')));
  });
});

describe('purchasing records (Phase 4)', () => {
  const paths = [
    'companies/A/suppliers/s1',
    'companies/A/goodsReceipts/g1',
    'companies/A/purchaseInvoices/i1',
    'companies/A/supplierPayments/sp1',
    'companies/A/supplierReturns/sr1',
  ];
  it('need purchasing read access: auditors yes, sales officers no', async () => {
    for (const path of paths) {
      await assertSucceeds(getDoc(doc(db(AUDITOR_A), path)));
      await assertFails(getDoc(doc(db(SALES_A), path)));
      await assertFails(getDoc(doc(db(ADMIN_B), path)));
    }
  });
  it('supplier invoice-number keys are server-only', async () => {
    await assertFails(getDoc(doc(db(ADMIN_A), 'companies/A/supplierInvoiceKeys/k1')));
  });
});

describe('sales records (Phase 5)', () => {
  it('sales officers see availability, tax codes and customers, not stock values', async () => {
    for (const path of [
      'companies/A/stockAvailability/p1__HQ-store',
      'companies/A/taxCodes/t1',
      'companies/A/customers/c1',
    ]) {
      await assertSucceeds(getDoc(doc(db(SALES_A), path)));
      await assertSucceeds(getDoc(doc(db(AUDITOR_A), path)));
    }
  });
  it('sales officers read only their own sales and receipts', async () => {
    await assertSucceeds(getDoc(doc(db(SALES_A), 'companies/A/salesInvoices/si2')));
    await assertSucceeds(getDoc(doc(db(SALES_A), 'companies/A/customerReceipts/cr2')));
    await assertFails(getDoc(doc(db(SALES_A), 'companies/A/salesInvoices/si1')));
    await assertFails(getDoc(doc(db(SALES_A), 'companies/A/customerReceipts/cr1')));
    await assertSucceeds(getDoc(doc(db(AUDITOR_A), 'companies/A/salesInvoices/si1')));
  });
  it('a sales officer query must be limited to their own documents', async () => {
    const invoices = collection(db(SALES_A), 'companies/A/salesInvoices');
    await assertSucceeds(getDocs(query(invoices, where('postedBy', '==', SALES_A))));
    await assertFails(getDocs(query(invoices, where('customerId', '==', 'c1'))));
    await assertSucceeds(
      getDocs(query(invoices, where('customerId', '==', 'c1'), where('postedBy', '==', SALES_A))),
    );
  });
});

describe('returns, refunds and bank reconciliation (Phase 6)', () => {
  it('sales officers read only the returns and refunds they raised', async () => {
    await assertSucceeds(getDoc(doc(db(SALES_A), 'companies/A/creditNotes/cn2')));
    await assertSucceeds(getDoc(doc(db(SALES_A), 'companies/A/customerRefunds/rf2')));
    await assertFails(getDoc(doc(db(SALES_A), 'companies/A/creditNotes/cn1')));
    await assertFails(getDoc(doc(db(SALES_A), 'companies/A/customerRefunds/rf1')));
    await assertSucceeds(getDoc(doc(db(AUDITOR_A), 'companies/A/creditNotes/cn1')));
    const notes = collection(db(SALES_A), 'companies/A/creditNotes');
    await assertSucceeds(getDocs(query(notes, where('createdBy', '==', SALES_A))));
    await assertFails(getDocs(query(notes, where('customerId', '==', 'c1'))));
  });
  it('bank reconciliations are for ledger readers, not sales officers', async () => {
    for (const path of [
      'companies/A/bankStates/acc1',
      'companies/A/bankReconciliations/br1',
      'companies/A/bankClearings/j1_1',
    ]) {
      await assertSucceeds(getDoc(doc(db(AUDITOR_A), path)));
      await assertFails(getDoc(doc(db(SALES_A), path)));
    }
  });
});

describe('fixed assets (Phase 7)', () => {
  it('the register and depreciation runs are for asset readers, not sales officers', async () => {
    for (const path of ['companies/A/fixedAssets/fa1', 'companies/A/depreciationRuns/dr1']) {
      await assertSucceeds(getDoc(doc(db(AUDITOR_A), path)));
      await assertFails(getDoc(doc(db(SALES_A), path)));
    }
    await assertFails(deleteDoc(doc(db(ADMIN_A), 'companies/A/fixedAssets/fa1')));
  });
});

describe('settlements (ageing at a past date)', () => {
  it('each side is readable only by readers of that side', async () => {
    await assertSucceeds(getDoc(doc(db(AUDITOR_A), 'companies/A/settlements/st1')));
    await assertSucceeds(getDoc(doc(db(AUDITOR_A), 'companies/A/settlements/st2')));
    await assertFails(getDoc(doc(db(SALES_A), 'companies/A/settlements/st1')));
    await assertFails(getDoc(doc(db(SALES_A), 'companies/A/settlements/st2')));
    const all = collection(db(AUDITOR_A), 'companies/A/settlements');
    await assertSucceeds(getDocs(query(all, where('ledger', '==', 'payable'))));
    await assertFails(getDocs(collection(db(SALES_A), 'companies/A/settlements')));
  });
});

describe('C4 suspended members', () => {
  it('lose read access', async () => {
    await assertFails(getDoc(doc(db(SUSPENDED_A), 'companies/A')));
    await assertFails(getDoc(doc(db(SUSPENDED_A), 'companies/A/branches/HQ')));
  });
  it('can still read their own member record', async () => {
    await assertSucceeds(getDoc(doc(db(SUSPENDED_A), 'companies/A/members/suspended-a')));
  });
});

describe('permission-based reads', () => {
  it('sales officer cannot read audit logs, periods or other members', async () => {
    await assertFails(getDoc(doc(db(SALES_A), 'companies/A/auditLogs/log1')));
    await assertFails(getDoc(doc(db(SALES_A), 'companies/A/periods/2026-10')));
    await assertFails(getDoc(doc(db(SALES_A), 'companies/A/members/admin-a')));
    await assertSucceeds(getDoc(doc(db(SALES_A), 'companies/A/members/sales-a')));
    await assertSucceeds(getDoc(doc(db(SALES_A), 'companies/A/settings/general')));
  });
  it('auditor can read audit logs but not invitations (E6)', async () => {
    await assertSucceeds(getDoc(doc(db(AUDITOR_A), 'companies/A/auditLogs/log1')));
    await assertFails(getDoc(doc(db(AUDITOR_A), 'invitations/inv1')));
  });
});

describe('C7 user profile', () => {
  it('user can read own profile and memberships, not others', async () => {
    await assertSucceeds(getDoc(doc(db(ADMIN_A), `users/${ADMIN_A}`)));
    await assertSucceeds(getDoc(doc(db(ADMIN_A), `users/${ADMIN_A}/memberships/A`)));
    await assertFails(getDoc(doc(db(ADMIN_B), `users/${ADMIN_A}`)));
  });
  it('user can change displayName and preferences only', async () => {
    await assertSucceeds(
      updateDoc(doc(db(ADMIN_A), `users/${ADMIN_A}`), {
        displayName: 'Ada',
        preferences: { theme: 'dark' },
      }),
    );
    await assertFails(updateDoc(doc(db(ADMIN_A), `users/${ADMIN_A}`), { defaultCompanyId: 'B' }));
    await assertFails(
      updateDoc(doc(db(ADMIN_A), `users/${ADMIN_A}`), { displayName: 'x'.repeat(121) }),
    );
  });
  it('user cannot write the memberships mirror', async () => {
    await assertFails(
      setDoc(doc(db(ADMIN_B), `users/${ADMIN_B}/memberships/A`), { status: 'active' }),
    );
  });
});

describe('G2 audit log immutability and platform collections', () => {
  it('nobody can write or delete audit entries from a client', async () => {
    await assertFails(setDoc(doc(db(ADMIN_A), 'companies/A/auditLogs/log2'), { action: 'fake' }));
    await assertFails(
      updateDoc(doc(db(ADMIN_A), 'companies/A/auditLogs/log1'), { action: 'edited' }),
    );
    await assertFails(deleteDoc(doc(db(ADMIN_A), 'companies/A/auditLogs/log1')));
  });
  it('platform collections are closed to clients, including platform admins', async () => {
    const root = env.authenticatedContext('root', { platformAdmin: true }).firestore();
    await assertFails(getDoc(doc(root, 'platformAdmins/root')));
    await assertFails(setDoc(doc(db(ADMIN_A), 'platformAdmins/admin-a'), { grantedAt: 1 }));
    await assertFails(getDoc(doc(root, 'companies/A')));
  });
});
