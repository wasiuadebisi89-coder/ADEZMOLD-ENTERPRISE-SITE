/**
 * Customers and sales (ACCOUNTING_POLICIES.md §7, §9, §10). A sales invoice is both the POS
 * sale and the credit sale: money taken at the sale is recorded on it, and whatever is left is
 * owed by the customer, within their credit limit unless the limit is overridden. Customer
 * receipts settle invoices or are kept as advances. Every posting goes through the posting
 * engine in the same transaction as the stock and document changes.
 */
import type { Timestamp, Transaction } from 'firebase-admin/firestore';
import {
  SalesError,
  addDays,
  branchAllowed,
  businessDate,
  creditCheck,
  fromStorable,
  parseRatePercent,
  salesLine,
  toDecimalString,
  toStorable,
} from '@bms/domain';
import { defineCommand, type Caller, type CompanyContext } from '../lib/command.js';
import {
  companyTarget,
  journalFrom,
  money,
  planAllocations,
  positiveQuantity,
  post,
  readSeries,
  readSystemAccounts,
  type PlannedAllocation,
} from '../lib/documents.js';
import {
  CommandError,
  conflict,
  denied,
  failedPrecondition,
  invalid,
  notFound,
} from '../lib/errors.js';
import {
  companyRefs,
  type AccountDoc,
  type ApprovalRequestDoc,
  type CompanyDoc,
  type CustomerDoc,
  type CustomerReceiptDoc,
  type LocationDoc,
  type PaymentAllocationDoc,
  type ProductDoc,
  type SalePaymentDoc,
  type SalesInvoiceDoc,
  type SalesInvoiceLineDoc,
  type SettingsDoc,
  type TaxCodeDoc,
} from '../lib/model.js';
import { StockBook, inventoryError } from '../lib/stock.js';

export const WALK_IN = 'Walk-in customer';

export function salesError(e: unknown, lineNo?: number): never {
  if (e instanceof SalesError) {
    const message = lineNo ? `Line ${lineNo}: ${e.message}` : e.message;
    throw new CommandError(
      e.code === 'credit_limit_exceeded' || e.code === 'over_paid'
        ? 'failed-precondition'
        : 'invalid-argument',
      e.code,
      message,
      lineNo ? { lineNo } : undefined,
    );
  }
  return inventoryError(e, lineNo);
}

function rate(input: string): number {
  try {
    return parseRatePercent(input);
  } catch (e) {
    return salesError(e);
  }
}

export async function readCustomer(
  tx: Transaction,
  companyId: string,
  customerId: string,
  requireActive: boolean,
): Promise<CustomerDoc> {
  const customer = (await tx.get(companyRefs(companyId).customer(customerId))).data() as
    CustomerDoc | undefined;
  if (!customer) throw notFound('customer_not_found', 'Customer not found');
  if (requireActive && customer.status !== 'active') {
    throw failedPrecondition('customer_inactive', 'This customer is inactive');
  }
  return customer;
}

/** Cash and bank accounts money can be received into. */
export function assertCashAccount(account: AccountDoc | undefined, what: string): AccountDoc {
  if (
    !account ||
    account.status !== 'active' ||
    !account.isPostable ||
    (account.subtype !== 'cash' && account.subtype !== 'bank')
  ) {
    throw invalid('account_invalid', `${what} must be an active cash or bank account`);
  }
  return account;
}

export const settled = (left: bigint) => (left === 0n ? ('paid' as const) : ('open' as const));

// --- Tax codes --------------------------------------------------------------------------------

export const createTaxCode = defineCommand({
  name: 'taxCode.create',
  access: { kind: 'company', permission: 'ledger.accounts.manage' },
  async handler({ tx, caller, input, now }) {
    const refs = companyRefs(input.companyId);
    const same = await tx.get(refs.taxCodes.where('code', '==', input.code).limit(1));
    if (!same.empty) throw conflict('code_taken', `Tax code ${input.code} is already used`);
    const ref = refs.taxCodes.doc();
    const doc: TaxCodeDoc = {
      code: input.code,
      name: input.name,
      rateBp: rate(input.rate),
      status: 'active',
      createdAt: now,
      createdBy: caller.uid,
      updatedAt: now,
      updatedBy: caller.uid,
    };
    tx.set(ref, doc);
    return {
      result: { taxCodeId: ref.id },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'taxCode',
        entityId: ref.id,
        after: { code: doc.code, name: doc.name, rateBp: doc.rateBp },
      },
    };
  },
});

export const updateTaxCode = defineCommand({
  name: 'taxCode.update',
  access: { kind: 'company', permission: 'ledger.accounts.manage' },
  async handler({ tx, caller, input, now }) {
    const ref = companyRefs(input.companyId).taxCode(input.taxCodeId);
    const current = (await tx.get(ref)).data() as TaxCodeDoc | undefined;
    if (!current) throw notFound('tax_code_not_found', 'Tax code not found');
    const patch: Partial<TaxCodeDoc> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.rate !== undefined) patch.rateBp = rate(input.rate);
    if (input.status !== undefined) patch.status = input.status;
    tx.update(ref, { ...patch, updatedAt: now, updatedBy: caller.uid });
    return {
      result: { taxCodeId: input.taxCodeId },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'taxCode',
        entityId: input.taxCodeId,
        before: Object.fromEntries(
          Object.keys(patch).map((k) => [k, current[k as keyof TaxCodeDoc]]),
        ),
        after: patch,
      },
    };
  },
});

// --- Customers --------------------------------------------------------------------------------

export const createCustomer = defineCommand({
  name: 'customer.create',
  access: { kind: 'company', permission: 'sales.customers.manage' },
  async handler({ tx, caller, input, now }) {
    const refs = companyRefs(input.companyId);
    const [same, companySnap] = await Promise.all([
      tx.get(refs.customers.where('code', '==', input.code).limit(1)),
      tx.get(refs.company),
    ]);
    if (!same.empty) throw conflict('code_taken', `Customer code ${input.code} is already used`);
    const limit = money(input.creditLimit, (companySnap.data() as CompanyDoc).baseCurrency);
    if (limit < 0n) throw invalid('amount_invalid', 'The credit limit cannot be negative');
    const ref = refs.customers.doc();
    const doc: CustomerDoc = {
      code: input.code,
      name: input.name,
      contactName: input.contactName ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      taxId: input.taxId ?? null,
      paymentTermsDays: input.paymentTermsDays,
      creditLimitMinor: toStorable(limit),
      status: 'active',
      balanceMinor: 0,
      advanceMinor: 0,
      createdAt: now,
      createdBy: caller.uid,
      updatedAt: now,
      updatedBy: caller.uid,
    };
    tx.set(ref, doc);
    return {
      result: { customerId: ref.id },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'customer',
        entityId: ref.id,
        after: {
          code: doc.code,
          name: doc.name,
          paymentTermsDays: doc.paymentTermsDays,
          creditLimitMinor: doc.creditLimitMinor,
        },
      },
    };
  },
});

export const updateCustomer = defineCommand({
  name: 'customer.update',
  access: { kind: 'company', permission: 'sales.customers.manage' },
  async handler({ tx, caller, input, now }) {
    const refs = companyRefs(input.companyId);
    const customer = await readCustomer(tx, input.companyId, input.customerId, false);
    const patch: Partial<CustomerDoc> = {};
    for (const k of ['name', 'contactName', 'phone', 'email', 'address', 'taxId'] as const) {
      if (k in input) {
        const v = input[k];
        if (k === 'name') {
          if (v) patch.name = v;
        } else {
          patch[k] = v ?? null;
        }
      }
    }
    if (input.paymentTermsDays !== undefined) patch.paymentTermsDays = input.paymentTermsDays;
    if (input.creditLimit !== undefined) {
      const currency = ((await tx.get(refs.company)).data() as CompanyDoc).baseCurrency;
      patch.creditLimitMinor = toStorable(money(input.creditLimit, currency));
    }
    if (input.status !== undefined) patch.status = input.status;
    tx.update(refs.customer(input.customerId), { ...patch, updatedAt: now, updatedBy: caller.uid });
    return {
      result: { customerId: input.customerId },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'customer',
        entityId: input.customerId,
        before: Object.fromEntries(
          Object.keys(patch).map((k) => [k, customer[k as keyof CustomerDoc]]),
        ),
        after: patch,
      },
    };
  },
});

// --- Sales invoices ---------------------------------------------------------------------------

export const postSalesInvoice = defineCommand({
  name: 'salesInvoice.post',
  access: { kind: 'company', permission: 'sales.invoice.post' },
  async handler({ tx, caller, input, now, company }) {
    const refs = companyRefs(input.companyId);
    const productIds = [...new Set(input.lines.map((l) => l.productId))];
    const taxCodeIds = [...new Set(input.lines.flatMap((l) => (l.taxCodeId ? [l.taxCodeId] : [])))];
    const paymentAccountIds = [...new Set(input.payments.map((p) => p.accountId))];
    if (paymentAccountIds.length !== input.payments.length) {
      throw invalid('duplicate_payment', 'Enter each payment account once');
    }
    const [companySnap, settingsSnap, locationSnap, customerSnap, approvalSnap, ...rest] =
      await tx.getAll(
        refs.company,
        refs.settings,
        refs.location(input.locationId),
        // Unused placeholders keep the positions fixed when there is no customer or approval.
        refs.customer(input.customerId ?? '_'),
        refs.approval(input.creditApprovalId ?? '_'),
        ...productIds.map((id) => refs.product(id)),
        ...taxCodeIds.map((id) => refs.taxCode(id)),
        ...paymentAccountIds.map((id) => refs.account(id)),
      );
    const companyDoc = companySnap!.data() as CompanyDoc;
    const settings = settingsSnap!.data() as SettingsDoc;
    const currency = companyDoc.baseCurrency;
    const location = locationSnap!.data() as LocationDoc | undefined;
    if (!location || location.status !== 'active' || location.type !== 'store') {
      throw failedPrecondition('location_inactive', 'Sell from an active store location');
    }
    if (!branchAllowed(company!.member.branchScope, location.branchId)) {
      throw denied('branch_not_allowed', 'You cannot sell from this branch');
    }
    let customer: CustomerDoc | null = null;
    if (input.customerId) {
      customer = (customerSnap!.data() as CustomerDoc | undefined) ?? null;
      if (!customer) throw notFound('customer_not_found', 'Customer not found');
      if (customer.status !== 'active') {
        throw failedPrecondition('customer_inactive', 'This customer is inactive');
      }
    }
    const products = new Map(
      productIds.map((id, i) => [id, rest[i]!.data() as ProductDoc | undefined]),
    );
    const taxCodes = new Map(
      taxCodeIds.map((id, i) => [
        id,
        rest[productIds.length + i]!.data() as TaxCodeDoc | undefined,
      ]),
    );
    const paymentAccounts = new Map(
      paymentAccountIds.map((id, i) => [
        id,
        rest[productIds.length + taxCodeIds.length + i]!.data() as AccountDoc | undefined,
      ]),
    );
    const book = await StockBook.read(
      tx,
      input.companyId,
      companyDoc.costingMethod === 'fifo',
      productIds.map((productId) => ({
        productId,
        locationId: input.locationId,
        branchId: location.branchId,
      })),
    );
    const series = await readSeries(tx, input.companyId, 'salesInvoice', 'SI');
    const ref = refs.salesInvoices.doc();
    const mayOverridePrice = company!.permissions.has('sales.priceOverride');

    // --- Lines: price, discount, tax and cost
    const lines: SalesInvoiceLineDoc[] = input.lines.map((l, i) => {
      const lineNo = i + 1;
      const product = products.get(l.productId);
      if (!product || product.status !== 'active') {
        throw failedPrecondition('product_inactive', `Line ${lineNo}: choose an active product`);
      }
      const qty = positiveQuantity(l.quantity, product.unit, lineNo);
      const listPrice = product.salePrice === null ? null : fromStorable(product.salePrice);
      const price = l.unitPrice !== undefined ? money(l.unitPrice, currency, lineNo) : listPrice;
      if (price === null) {
        throw failedPrecondition(
          'price_required',
          `Line ${lineNo}: ${product.sku} has no sale price; enter one`,
        );
      }
      const discount = l.discount !== undefined ? money(l.discount, currency, lineNo) : 0n;
      if ((price !== listPrice || discount !== 0n) && !mayOverridePrice) {
        throw denied(
          'price_override_not_allowed',
          `Line ${lineNo}: you cannot change the price of ${product.sku} or give a discount`,
        );
      }
      let tax: TaxCodeDoc | null = null;
      if (l.taxCodeId) {
        tax = taxCodes.get(l.taxCodeId) ?? null;
        if (!tax || tax.status !== 'active') {
          throw failedPrecondition(
            'tax_code_inactive',
            `Line ${lineNo}: choose an active tax code`,
          );
        }
      }
      try {
        const amounts = salesLine({
          qtyMilli: qty,
          unitPriceMinor: price,
          discountMinor: discount,
          rateBp: tax?.rateBp ?? 0,
          pricesIncludeTax: settings.pricesIncludeTax,
        });
        const cost = book.issue(l.productId, input.locationId, qty, 'sale');
        return {
          lineNo,
          productId: l.productId,
          sku: product.sku,
          productName: product.name,
          unit: product.unit,
          qtyMilli: toStorable(qty),
          listPriceMinor: listPrice === null ? null : toStorable(listPrice),
          unitPriceMinor: toStorable(price),
          discountMinor: toStorable(discount),
          netMinor: toStorable(amounts.netMinor),
          taxCodeId: l.taxCodeId ?? null,
          taxCode: tax?.code ?? null,
          taxRateBp: tax?.rateBp ?? 0,
          taxMinor: toStorable(amounts.taxMinor),
          grossMinor: toStorable(amounts.grossMinor),
          costMinor: toStorable(cost),
          returnedQtyMilli: 0,
        };
      } catch (e) {
        return salesError(e, lineNo);
      }
    });
    const sumOf = (k: 'netMinor' | 'taxMinor' | 'grossMinor' | 'costMinor') =>
      lines.reduce((s, l) => s + BigInt(l[k]), 0n);
    const net = sumOf('netMinor');
    const tax = sumOf('taxMinor');
    const total = sumOf('grossMinor');
    const cost = sumOf('costMinor');
    if (total <= 0n) throw invalid('amount_zero', 'The sale total must be above zero');

    // --- Money taken now; the rest is owed
    const payments: SalePaymentDoc[] = input.payments.map((p) => {
      const account = assertCashAccount(paymentAccounts.get(p.accountId), 'Payment');
      const amount = money(p.amount, currency);
      if (amount <= 0n) throw invalid('amount_zero', 'Each payment must be above zero');
      return {
        accountId: p.accountId,
        accountName: `${account.code} ${account.name}`,
        amountMinor: toStorable(amount),
      };
    });
    const paid = payments.reduce((s, p) => s + BigInt(p.amountMinor), 0n);
    if (paid > total) {
      throw failedPrecondition(
        'over_paid',
        `Payments are more than the total of ${toDecimalString(total, currency)}; record only what the sale costs and give the change`,
      );
    }
    const onCredit = total - paid;
    if (!customer && onCredit > 0n) {
      throw failedPrecondition(
        'walk_in_unpaid',
        `A walk-in sale must be paid in full; ${toDecimalString(onCredit, currency)} is unpaid. Choose a customer to sell on credit`,
      );
    }

    // --- Credit limit (DECISION 7): blocked unless overridden
    let creditOverride: SalesInvoiceDoc['creditOverride'] = null;
    let approvalToUse: string | null = null;
    if (customer && onCredit > 0n) {
      const check = creditCheck(
        fromStorable(customer.balanceMinor),
        fromStorable(customer.advanceMinor),
        fromStorable(customer.creditLimitMinor),
        onCredit,
      );
      if (check.over) {
        if (company!.permissions.has('sales.creditLimit.override')) {
          creditOverride = { by: 'permission', approvalId: null };
        } else {
          const approval = approvalSnap!.data() as ApprovalRequestDoc | undefined;
          if (
            input.creditApprovalId &&
            approval &&
            approval.action === 'sales.creditOverride' &&
            approval.target.customerId === input.customerId &&
            approval.status === 'approved' &&
            approval.requestedBy === caller.uid &&
            fromStorable(approval.target.amountMinor) >= onCredit
          ) {
            creditOverride = { by: 'approval', approvalId: input.creditApprovalId };
            approvalToUse = input.creditApprovalId;
          } else {
            throw failedPrecondition(
              'credit_limit_exceeded',
              `${customer.name} would owe ${toDecimalString(check.exposureMinor, currency)}, over their credit limit of ${toDecimalString(check.limitMinor, currency)}. Take payment or ask a manager to approve the credit`,
            );
          }
        }
      }
    }

    const accounts = await readSystemAccounts(
      tx,
      input.companyId,
      [
        'revenue',
        'inventory',
        'cogs',
        ...(tax > 0n ? (['outputTax'] as const) : []),
        ...(onCredit > 0n ? (['receivable'] as const) : []),
      ],
      ['inventory', 'receivable'],
    );
    const entries = [
      ...payments.map((p) => ({ accountId: p.accountId, amount: BigInt(p.amountMinor) })),
      ...(onCredit > 0n ? [{ accountId: accounts.receivable!, amount: onCredit }] : []),
      { accountId: accounts.revenue, amount: -net },
      ...(tax > 0n ? [{ accountId: accounts.outputTax!, amount: -tax }] : []),
      { accountId: accounts.cogs, amount: cost },
      { accountId: accounts.inventory, amount: -cost },
    ];
    const customerName = customer?.name ?? WALK_IN;
    const write = await post(
      tx,
      { company: company!, caller, now },
      {
        origin: 'system',
        branchId: location.branchId,
        postingDate: input.postingDate,
        memo: `${series.number}: sale to ${customerName}`,
        reference: input.reference ?? series.number,
        lines: journalFrom(entries),
        backdateApprovalId: input.backdateApprovalId,
        source: { type: 'salesInvoice', id: ref.id, number: series.number },
      },
    );
    const dueDate =
      input.dueDate ?? addDays(input.postingDate, customer ? customer.paymentTermsDays : 0);
    if (dueDate < input.postingDate) {
      throw invalid('due_before_invoice', 'The due date cannot be before the invoice date');
    }

    // --- Writes
    series.commit();
    const { journalId } = write();
    book.write(tx, {
      postingDate: input.postingDate,
      sourceType: 'salesInvoice',
      sourceId: ref.id,
      sourceNumber: series.number,
      journalId,
      now,
      uid: caller.uid,
    });
    if (approvalToUse) {
      tx.update(refs.approval(approvalToUse), { status: 'used', usedAt: now, usedFor: ref.id });
    }
    if (customer && onCredit > 0n) {
      tx.update(refs.customer(input.customerId!), {
        balanceMinor: toStorable(fromStorable(customer.balanceMinor) + onCredit),
      });
    }
    const doc: SalesInvoiceDoc = {
      number: series.number,
      kind: 'invoice',
      customerId: input.customerId ?? null,
      customerName,
      branchId: location.branchId,
      locationId: input.locationId,
      invoiceDate: input.postingDate,
      dueDate,
      reference: input.reference ?? null,
      memo: input.memo ?? null,
      pricesIncludeTax: settings.pricesIncludeTax,
      lines,
      netMinor: toStorable(net),
      taxMinor: toStorable(tax),
      totalMinor: toStorable(total),
      costMinor: toStorable(cost),
      payments,
      paidMinor: toStorable(paid),
      creditedMinor: 0,
      status: settled(onCredit),
      creditOverride,
      journalId,
      postedAt: now,
      postedBy: caller.uid,
    };
    tx.set(ref, doc);
    return {
      result: { invoiceId: ref.id, number: series.number, journalId },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'salesInvoice',
        entityId: ref.id,
        after: {
          number: series.number,
          customerId: doc.customerId,
          total: total.toString(),
          paid: paid.toString(),
          onCredit: onCredit.toString(),
          creditOverride,
        },
      },
    };
  },
});

export const postCustomerOpeningBalance = defineCommand({
  name: 'customerOpeningBalance.post',
  access: { kind: 'company', permission: 'ledger.journal.post' },
  async handler({ tx, caller, input, now, company }) {
    const refs = companyRefs(input.companyId);
    const customer = await readCustomer(tx, input.companyId, input.customerId, false);
    const [companySnap, settingsSnap] = await tx.getAll(refs.company, refs.settings);
    const currency = (companySnap!.data() as CompanyDoc).baseCurrency;
    const amount = money(input.amount, currency);
    if (amount <= 0n) throw invalid('amount_zero', 'Enter the amount owed');
    const accounts = await readSystemAccounts(
      tx,
      input.companyId,
      ['receivable', 'openingBalanceEquity'],
      ['receivable'],
    );
    const series = await readSeries(tx, input.companyId, 'salesInvoice', 'SI');
    const ref = refs.salesInvoices.doc();
    const write = await post(
      tx,
      { company: company!, caller, now },
      {
        origin: 'system',
        branchId: input.branchId,
        postingDate: input.asAtDate,
        memo: `${series.number}: opening balance owed by ${customer.name}`,
        reference: input.reference,
        lines: [
          { accountId: accounts.receivable, debit: amount, credit: 0n },
          { accountId: accounts.openingBalanceEquity, debit: 0n, credit: amount },
        ],
        backdateApprovalId: input.backdateApprovalId,
        source: { type: 'salesInvoice', id: ref.id, number: series.number },
      },
    );
    series.commit();
    const { journalId } = write();
    const doc: SalesInvoiceDoc = {
      number: series.number,
      kind: 'opening',
      customerId: input.customerId,
      customerName: customer.name,
      branchId: input.branchId,
      locationId: null,
      invoiceDate: input.asAtDate,
      dueDate: input.dueDate ?? input.asAtDate,
      reference: input.reference,
      memo: 'Opening balance',
      pricesIncludeTax: (settingsSnap!.data() as SettingsDoc).pricesIncludeTax,
      lines: [],
      netMinor: toStorable(amount),
      taxMinor: 0,
      totalMinor: toStorable(amount),
      costMinor: 0,
      payments: [],
      paidMinor: 0,
      creditedMinor: 0,
      status: 'open',
      creditOverride: null,
      journalId,
      postedAt: now,
      postedBy: caller.uid,
    };
    tx.set(ref, doc);
    tx.update(refs.customer(input.customerId), {
      balanceMinor: toStorable(fromStorable(customer.balanceMinor) + amount),
    });
    return {
      result: { invoiceId: ref.id, number: series.number, journalId },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'salesInvoice',
        entityId: ref.id,
        after: { number: series.number, kind: 'opening', amount: amount.toString() },
      },
    };
  },
});

// --- Customer receipts ------------------------------------------------------------------------

export async function readInvoicesFor(
  tx: Transaction,
  companyId: string,
  customerId: string,
  ids: readonly string[],
): Promise<Map<string, SalesInvoiceDoc>> {
  if (new Set(ids).size !== ids.length) {
    throw invalid('duplicate_invoice', 'Each invoice can appear only once');
  }
  const refs = companyRefs(companyId);
  const snaps = ids.length ? await tx.getAll(...ids.map((id) => refs.salesInvoice(id))) : [];
  const result = new Map<string, SalesInvoiceDoc>();
  snaps.forEach((s, i) => {
    const inv = s.data() as SalesInvoiceDoc | undefined;
    if (!inv || inv.customerId !== customerId) {
      throw notFound('invoice_not_found', `Invoice ${ids[i]} is not one of this customer's`);
    }
    result.set(ids[i]!, inv);
  });
  return result;
}

function applyAllocations(
  tx: Transaction,
  companyId: string,
  planned: readonly PlannedAllocation[],
  invoices: Map<string, SalesInvoiceDoc>,
) {
  const refs = companyRefs(companyId);
  for (const a of planned) {
    const inv = invoices.get(a.invoiceId)!;
    const paid = fromStorable(inv.paidMinor) + a.amountMinor;
    tx.update(refs.salesInvoice(a.invoiceId), {
      paidMinor: toStorable(paid),
      status: settled(fromStorable(inv.totalMinor) - paid - fromStorable(inv.creditedMinor)),
    });
  }
}

export const postCustomerReceipt = defineCommand({
  name: 'customerReceipt.post',
  access: { kind: 'company', permission: 'sales.receipt.post' },
  async handler({ tx, caller, input, now, company }) {
    const refs = companyRefs(input.companyId);
    const customer = await readCustomer(tx, input.companyId, input.customerId, false);
    const [companySnap, accountSnap] = await tx.getAll(
      refs.company,
      refs.account(input.depositAccountId),
    );
    const currency = (companySnap!.data() as CompanyDoc).baseCurrency;
    const depositTo = assertCashAccount(
      accountSnap!.data() as AccountDoc | undefined,
      'The account received into',
    );
    const amount = money(input.amount, currency);
    if (amount <= 0n) throw invalid('amount_zero', 'Enter the amount received');
    const invoices = await readInvoicesFor(
      tx,
      input.companyId,
      input.customerId,
      input.allocations.map((a) => a.invoiceId),
    );
    const { planned, total: allocated } = planAllocations(
      amount,
      input.allocations,
      invoices,
      currency,
    );
    const advance = amount - allocated;
    const accounts = await readSystemAccounts(
      tx,
      input.companyId,
      [
        ...(allocated > 0n ? (['receivable'] as const) : []),
        ...(advance > 0n ? (['customerAdvance'] as const) : []),
      ],
      ['receivable'],
    );
    const series = await readSeries(tx, input.companyId, 'customerReceipt', 'CR');
    const ref = refs.customerReceipts.doc();
    const write = await post(
      tx,
      { company: company!, caller, now },
      {
        origin: 'system',
        branchId: input.branchId,
        postingDate: input.postingDate,
        memo: `${series.number}: received from ${customer.name}`,
        reference: input.reference ?? series.number,
        lines: journalFrom([
          { accountId: input.depositAccountId, amount },
          ...(allocated > 0n ? [{ accountId: accounts.receivable!, amount: -allocated }] : []),
          ...(advance > 0n ? [{ accountId: accounts.customerAdvance!, amount: -advance }] : []),
        ]),
        backdateApprovalId: input.backdateApprovalId,
        source: { type: 'customerReceipt', id: ref.id, number: series.number },
      },
    );
    series.commit();
    const { journalId } = write();
    applyAllocations(tx, input.companyId, planned, invoices);
    const doc: CustomerReceiptDoc = {
      number: series.number,
      customerId: input.customerId,
      customerName: customer.name,
      branchId: input.branchId,
      postingDate: input.postingDate,
      depositAccountId: input.depositAccountId,
      depositAccountName: `${depositTo.code} ${depositTo.name}`,
      amountMinor: toStorable(amount),
      allocatedMinor: toStorable(allocated),
      reference: input.reference ?? null,
      memo: input.memo ?? null,
      allocations: planned.map((a) => ({
        invoiceId: a.invoiceId,
        invoiceNumber: a.label,
        amountMinor: toStorable(a.amountMinor),
        journalId,
        allocatedAt: now,
      })),
      journalId,
      postedAt: now,
      postedBy: caller.uid,
    };
    tx.set(ref, doc);
    tx.update(refs.customer(input.customerId), {
      balanceMinor: toStorable(fromStorable(customer.balanceMinor) - allocated),
      advanceMinor: toStorable(fromStorable(customer.advanceMinor) + advance),
    });
    return {
      result: { receiptId: ref.id, number: series.number, journalId },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'customerReceipt',
        entityId: ref.id,
        after: {
          number: series.number,
          customerId: input.customerId,
          amount: amount.toString(),
          allocated: allocated.toString(),
        },
      },
    };
  },
});

/**
 * Applies money a customer holds with us (an unallocated receipt or credit note) to their
 * invoices: Dr Customer advances / Cr Trade receivables, dated today. Returns the writes.
 */
export async function applyAdvance(
  tx: Transaction,
  ctx: { company: CompanyContext; caller: Caller; now: Timestamp },
  source: {
    type: 'customerReceipt' | 'creditNote';
    id: string;
    number: string;
    customerId: string;
    branchId: string;
    availableMinor: bigint;
  },
  requested: readonly { invoiceId: string; amount: string }[],
) {
  const companyId = ctx.company.companyId;
  const refs = companyRefs(companyId);
  const companyDoc = (await tx.get(refs.company)).data() as CompanyDoc;
  const customer = await readCustomer(tx, companyId, source.customerId, false);
  const invoices = await readInvoicesFor(
    tx,
    companyId,
    source.customerId,
    requested.map((a) => a.invoiceId),
  );
  if (source.availableMinor <= 0n) {
    throw failedPrecondition('nothing_to_allocate', `Nothing is left to use on ${source.number}`);
  }
  const { planned, total } = planAllocations(
    source.availableMinor,
    requested,
    invoices,
    companyDoc.baseCurrency,
  );
  const accounts = await readSystemAccounts(
    tx,
    companyId,
    ['receivable', 'customerAdvance'],
    ['receivable'],
  );
  const write = await post(tx, ctx, {
    origin: 'system',
    branchId: source.branchId,
    postingDate: businessDate(ctx.now.toDate(), companyDoc.timeZone),
    memo: `${source.number}: applied to invoices`,
    reference: source.number,
    lines: [
      { accountId: accounts.customerAdvance, debit: total, credit: 0n },
      { accountId: accounts.receivable, debit: 0n, credit: total },
    ],
    source: { type: source.type, id: source.id, number: source.number },
  });
  return {
    total,
    commit: () => {
      const { journalId } = write();
      applyAllocations(tx, companyId, planned, invoices);
      tx.update(refs.customer(source.customerId), {
        balanceMinor: toStorable(fromStorable(customer.balanceMinor) - total),
        advanceMinor: toStorable(fromStorable(customer.advanceMinor) - total),
      });
      const allocations: PaymentAllocationDoc[] = planned.map((a) => ({
        invoiceId: a.invoiceId,
        invoiceNumber: a.label,
        amountMinor: toStorable(a.amountMinor),
        journalId,
        allocatedAt: ctx.now,
      }));
      return { journalId, allocations };
    },
  };
}

/** What is left of a receipt or credit note after allocations and refunds. */
export const unusedMinor = (totalMinor: number, allocatedMinor: number, refundedMinor = 0) =>
  fromStorable(totalMinor) - fromStorable(allocatedMinor) - fromStorable(refundedMinor);

export const allocateCustomerReceipt = defineCommand({
  name: 'customerReceipt.allocate',
  access: { kind: 'company', permission: 'sales.receipt.post' },
  async handler({ tx, caller, input, now, company }) {
    const refs = companyRefs(input.companyId);
    const receipt = (await tx.get(refs.customerReceipt(input.receiptId))).data() as
      CustomerReceiptDoc | undefined;
    if (!receipt) throw notFound('receipt_not_found', 'Receipt not found');
    const apply = await applyAdvance(
      tx,
      { company: company!, caller, now },
      {
        type: 'customerReceipt',
        id: input.receiptId,
        number: receipt.number,
        customerId: receipt.customerId,
        branchId: receipt.branchId,
        availableMinor: unusedMinor(
          receipt.amountMinor,
          receipt.allocatedMinor,
          receipt.refundedMinor,
        ),
      },
      input.allocations,
    );
    const { journalId, allocations } = apply.commit();
    const allocated = fromStorable(receipt.allocatedMinor) + apply.total;
    tx.update(refs.customerReceipt(input.receiptId), {
      allocatedMinor: toStorable(allocated),
      allocations: [...receipt.allocations, ...allocations],
    });
    return {
      result: { receiptId: input.receiptId, journalId, allocated: apply.total.toString() },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'customerReceipt',
        entityId: input.receiptId,
        before: { allocated: receipt.allocatedMinor },
        after: { allocated: allocated.toString() },
      },
    };
  },
});
