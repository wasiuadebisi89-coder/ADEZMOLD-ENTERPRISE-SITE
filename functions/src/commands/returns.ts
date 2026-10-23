/**
 * Sales returns, credit notes and customer refunds (ACCOUNTING_POLICIES.md §8). A credit note
 * takes goods back at the cost they were sold at and reverses the sale's revenue and tax for
 * them. The credit first reduces what is still owed on the sale; the rest is kept as a customer
 * advance, or for a walk-in sale paid back at once. Staff who cannot post a return or refund
 * raise it for someone else to approve; it posts on the day it is approved.
 */
import type { Timestamp, Transaction } from 'firebase-admin/firestore';
import {
  branchAllowed,
  businessDate,
  formatQuantity,
  fromStorable,
  returnShare,
  toDecimalString,
  toStorable,
} from '@bms/domain';
import { defineCommand, type Caller, type CompanyContext } from '../lib/command.js';
import {
  companyTarget,
  journalFrom,
  money,
  positiveQuantity,
  post,
  readSeries,
  readSystemAccounts,
  settleableOutstanding,
} from '../lib/documents.js';
import { denied, failedPrecondition, invalid, notFound } from '../lib/errors.js';
import {
  companyRefs,
  type AccountDoc,
  type CompanyDoc,
  type CreditNoteDoc,
  type CreditNoteLineDoc,
  type CustomerDoc,
  type CustomerReceiptDoc,
  type CustomerRefundDoc,
  type LocationDoc,
  type SalesInvoiceDoc,
} from '../lib/model.js';
import { StockBook } from '../lib/stock.js';
import {
  applyAdvance,
  assertCashAccount,
  readCustomer,
  salesError,
  settled,
  unusedMinor,
} from './sales.js';

type Ctx = { company: CompanyContext; caller: Caller; now: Timestamp };

async function readInvoice(tx: Transaction, companyId: string, invoiceId: string) {
  const invoice = (await tx.get(companyRefs(companyId).salesInvoice(invoiceId))).data() as
    SalesInvoiceDoc | undefined;
  if (!invoice) throw notFound('invoice_not_found', 'Sale not found');
  if (invoice.kind !== 'invoice' || !invoice.locationId) {
    throw failedPrecondition('not_returnable', 'Only goods sold on a sale can be returned');
  }
  return invoice;
}

function assertBranch(company: CompanyContext, branchId: string) {
  if (!branchAllowed(company.member.branchScope, branchId)) {
    throw denied('branch_not_allowed', 'You cannot handle returns at this branch');
  }
}

/** Walk-in returns pay money back at once, so they also need refund rights. */
const mayPostCreditNote = (company: CompanyContext, walkIn: boolean, approving: boolean) =>
  company.permissions.has('sales.return.post') &&
  (!walkIn ||
    company.permissions.has('sales.refund.post') ||
    (approving && company.permissions.has('sales.refund.approve')));

/**
 * Checks a credit note against the sale as it is now and plans its posting. All reads happen
 * here; the returned function does the writes.
 */
async function prepareCreditNote(
  tx: Transaction,
  ctx: Ctx,
  noteId: string,
  note: CreditNoteDoc,
  invoice: SalesInvoiceDoc,
) {
  const companyId = ctx.company.companyId;
  const refs = companyRefs(companyId);
  const locationIds = [...new Set(note.lines.map((l) => l.locationId))];
  const [companySnap, customerSnap, refundSnap, ...locationSnaps] = await tx.getAll(
    refs.company,
    refs.customer(note.customerId ?? '_'),
    refs.account(note.refundAccountId ?? '_'),
    ...locationIds.map((id) => refs.location(id)),
  );
  const companyDoc = companySnap!.data() as CompanyDoc;
  locationSnaps.forEach((snap) => {
    const location = snap!.data() as LocationDoc | undefined;
    if (!location || location.status !== 'active') {
      throw failedPrecondition(
        'location_inactive',
        'The location the goods go back to is no longer active',
      );
    }
  });
  const customer = note.customerId ? (customerSnap!.data() as CustomerDoc) : null;
  const refundAccount = note.customerId
    ? null
    : assertCashAccount(refundSnap!.data() as AccountDoc | undefined, 'The refund account');

  // --- Each line's share of the sale, from the running totals already returned
  const lines = note.lines.map((l) => {
    const sold = invoice.lines.find((s) => s.lineNo === l.lineNo)!;
    const qty = fromStorable(l.qtyMilli);
    const soldQty = fromStorable(sold.qtyMilli);
    const doneQty = fromStorable(sold.returnedQtyMilli);
    try {
      const share = (total: number, done: number | undefined) =>
        returnShare(fromStorable(total), fromStorable(done ?? 0), soldQty, doneQty, qty);
      return {
        line: l,
        net: share(sold.netMinor, sold.returnedNetMinor),
        tax: share(sold.taxMinor, sold.returnedTaxMinor),
        cost: share(sold.costMinor, sold.returnedCostMinor),
      };
    } catch (e) {
      return salesError(e, l.lineNo);
    }
  });
  const sum = (k: 'net' | 'tax' | 'cost') => lines.reduce((s, l) => s + l[k], 0n);
  const net = sum('net');
  const tax = sum('tax');
  const cost = sum('cost');
  const total = net + tax;
  // The credit first settles what is still owed on the sale.
  const outstanding = settleableOutstanding(invoice);
  const applied = customer ? (total < outstanding ? total : outstanding) : 0n;
  const rest = total - applied;

  const book = await StockBook.read(
    tx,
    companyId,
    companyDoc.costingMethod === 'fifo',
    note.lines.map((l) => ({
      productId: l.productId,
      locationId: l.locationId,
      branchId: invoice.branchId,
    })),
  );
  const postingDate = businessDate(ctx.now.toDate(), companyDoc.timeZone);
  for (const l of lines) {
    book.receive(
      l.line.productId,
      l.line.locationId,
      fromStorable(l.line.qtyMilli),
      l.cost,
      'sales_return',
      { id: noteId, lineNo: l.line.lineNo, date: postingDate },
    );
  }
  const accounts = await readSystemAccounts(
    tx,
    companyId,
    [
      'revenue',
      'inventory',
      'cogs',
      ...(tax > 0n ? (['outputTax'] as const) : []),
      ...(applied > 0n ? (['receivable'] as const) : []),
      ...(customer && rest > 0n ? (['customerAdvance'] as const) : []),
    ],
    ['inventory', 'receivable'],
  );
  const write = await post(tx, ctx, {
    origin: 'system',
    branchId: invoice.branchId,
    postingDate,
    memo: `${note.number}: return on ${invoice.number} from ${note.customerName}`,
    reference: note.number,
    lines: journalFrom([
      { accountId: accounts.revenue, amount: net },
      ...(tax > 0n ? [{ accountId: accounts.outputTax!, amount: tax }] : []),
      ...(applied > 0n ? [{ accountId: accounts.receivable!, amount: -applied }] : []),
      ...(rest > 0n
        ? [
            {
              accountId: customer ? accounts.customerAdvance! : note.refundAccountId!,
              amount: -rest,
            },
          ]
        : []),
      { accountId: accounts.inventory, amount: cost },
      { accountId: accounts.cogs, amount: -cost },
    ]),
    source: { type: 'creditNote', id: noteId, number: note.number },
  });

  return {
    total,
    commit: (): Partial<CreditNoteDoc> => {
      const { journalId } = write();
      book.write(tx, {
        postingDate,
        sourceType: 'creditNote',
        sourceId: noteId,
        sourceNumber: note.number,
        journalId,
        now: ctx.now,
        uid: ctx.caller.uid,
      });
      const byLine = new Map(lines.map((l) => [l.line.lineNo, l]));
      tx.update(refs.salesInvoice(note.invoiceId), {
        lines: invoice.lines.map((s) => {
          const r = byLine.get(s.lineNo);
          if (!r) return s;
          return {
            ...s,
            returnedQtyMilli: toStorable(
              fromStorable(s.returnedQtyMilli) + fromStorable(r.line.qtyMilli),
            ),
            returnedNetMinor: toStorable(fromStorable(s.returnedNetMinor ?? 0) + r.net),
            returnedTaxMinor: toStorable(fromStorable(s.returnedTaxMinor ?? 0) + r.tax),
            returnedCostMinor: toStorable(fromStorable(s.returnedCostMinor ?? 0) + r.cost),
          };
        }),
        creditedMinor: toStorable(fromStorable(invoice.creditedMinor) + applied),
        returnedMinor: toStorable(fromStorable(invoice.returnedMinor ?? 0) + total),
        status: settled(outstanding - applied),
      });
      if (customer) {
        tx.update(refs.customer(note.customerId!), {
          balanceMinor: toStorable(fromStorable(customer.balanceMinor) - applied),
          advanceMinor: toStorable(fromStorable(customer.advanceMinor) + rest),
        });
      }
      return {
        status: 'posted',
        postingDate,
        lines: note.lines.map((l) => {
          const r = byLine.get(l.lineNo)!;
          return {
            ...l,
            netMinor: toStorable(r.net),
            taxMinor: toStorable(r.tax),
            costMinor: toStorable(r.cost),
          };
        }),
        netMinor: toStorable(net),
        taxMinor: toStorable(tax),
        totalMinor: toStorable(total),
        costMinor: toStorable(cost),
        allocatedMinor: toStorable(applied),
        refundedMinor: toStorable(refundAccount ? rest : 0n),
        allocations:
          applied > 0n
            ? [
                {
                  invoiceId: note.invoiceId,
                  invoiceNumber: invoice.number,
                  amountMinor: toStorable(applied),
                  journalId,
                  allocatedAt: ctx.now,
                },
              ]
            : [],
        journalId,
      };
    },
  };
}

export const createCreditNote = defineCommand({
  name: 'creditNote.create',
  access: { kind: 'company', permission: 'sales.return.create' },
  async handler({ tx, caller, input, now, company }) {
    const refs = companyRefs(input.companyId);
    const invoice = await readInvoice(tx, input.companyId, input.invoiceId);
    assertBranch(company!, invoice.branchId);
    const walkIn = invoice.customerId === null;
    if (walkIn && !input.refundAccountId) {
      throw invalid(
        'refund_account_required',
        'A walk-in sale is refunded at once: choose the cash or bank account to pay from',
      );
    }
    if (!walkIn && input.refundAccountId) {
      throw invalid(
        'refund_account_not_allowed',
        "The credit stays on the customer's account; pay it back with a refund",
      );
    }
    const lineNos = input.lines.map((l) => l.lineNo);
    if (new Set(lineNos).size !== lineNos.length) {
      throw invalid('duplicate_line', 'Each sale line can appear only once');
    }
    const needsQuarantine = input.lines.some((l) => l.condition === 'damaged');
    if (needsQuarantine && !input.quarantineLocationId) {
      throw invalid('quarantine_required', 'Choose the quarantine location for damaged goods');
    }
    const [quarantineSnap, refundSnap] = await tx.getAll(
      refs.location(input.quarantineLocationId ?? '_'),
      refs.account(input.refundAccountId ?? '_'),
    );
    if (needsQuarantine) {
      const q = quarantineSnap!.data() as LocationDoc | undefined;
      if (
        !q ||
        q.status !== 'active' ||
        q.type !== 'quarantine' ||
        q.branchId !== invoice.branchId
      ) {
        throw failedPrecondition(
          'location_invalid',
          "Damaged goods go to an active quarantine location at the sale's branch",
        );
      }
    }
    if (walkIn)
      assertCashAccount(refundSnap!.data() as AccountDoc | undefined, 'The refund account');

    const lines: CreditNoteLineDoc[] = input.lines.map((l) => {
      const sold = invoice.lines.find((s) => s.lineNo === l.lineNo);
      if (!sold) {
        throw invalid('line_not_found', `Sale line ${l.lineNo} does not exist`, {
          lineNo: l.lineNo,
        });
      }
      const qty = positiveQuantity(l.quantity, sold.unit, l.lineNo);
      const left = fromStorable(sold.qtyMilli) - fromStorable(sold.returnedQtyMilli);
      if (qty > left) {
        throw failedPrecondition(
          'over_returned',
          `Line ${l.lineNo}: only ${formatQuantity(left, sold.unit)} ${sold.unit} of ${sold.sku} is left to return`,
        );
      }
      return {
        lineNo: l.lineNo,
        productId: sold.productId,
        sku: sold.sku,
        productName: sold.productName,
        unit: sold.unit,
        qtyMilli: toStorable(qty),
        condition: l.condition,
        locationId: l.condition === 'damaged' ? input.quarantineLocationId! : invoice.locationId!,
        netMinor: null,
        taxMinor: null,
        costMinor: null,
      };
    });

    const series = await readSeries(tx, input.companyId, 'creditNote', 'CN');
    const ref = refs.creditNotes.doc();
    const note: CreditNoteDoc = {
      number: series.number,
      invoiceId: input.invoiceId,
      invoiceNumber: invoice.number,
      customerId: invoice.customerId,
      customerName: invoice.customerName,
      branchId: invoice.branchId,
      reason: input.reason,
      lines,
      quarantineLocationId: needsQuarantine ? input.quarantineLocationId! : null,
      refundAccountId: input.refundAccountId ?? null,
      status: 'pending',
      createdAt: now,
      createdBy: caller.uid,
      decidedAt: null,
      decidedBy: null,
      decisionReason: null,
      postingDate: null,
      netMinor: 0,
      taxMinor: 0,
      totalMinor: 0,
      costMinor: 0,
      allocatedMinor: 0,
      refundedMinor: 0,
      allocations: [],
      journalId: null,
    };
    const postNow = mayPostCreditNote(company!, walkIn, false);
    const prepared = postNow
      ? await prepareCreditNote(tx, { company: company!, caller, now }, ref.id, note, invoice)
      : null;
    series.commit();
    const doc: CreditNoteDoc = prepared ? { ...note, ...prepared.commit() } : note;
    tx.set(ref, doc);
    return {
      result: {
        creditNoteId: ref.id,
        number: series.number,
        status: doc.status,
        journalId: doc.journalId,
      },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'creditNote',
        entityId: ref.id,
        after: {
          number: series.number,
          invoiceId: input.invoiceId,
          status: doc.status,
          total: doc.totalMinor,
        },
        reason: input.reason,
      },
    };
  },
});

export const decideCreditNote = defineCommand({
  name: 'creditNote.decide',
  access: { kind: 'company', permission: 'sales.return.post' },
  async handler({ tx, caller, input, now, company }) {
    const refs = companyRefs(input.companyId);
    const ref = refs.creditNote(input.creditNoteId);
    const note = (await tx.get(ref)).data() as CreditNoteDoc | undefined;
    if (!note) throw notFound('credit_note_not_found', 'Return not found');
    if (note.status !== 'pending') {
      throw failedPrecondition('not_pending', 'This return has already been decided');
    }
    if (note.createdBy === caller.uid) {
      throw denied('self_approval', 'You cannot approve or reject your own return');
    }
    assertBranch(company!, note.branchId);
    const decided = { decidedAt: now, decidedBy: caller.uid, decisionReason: input.reason };
    const audit = {
      target: companyTarget(input.companyId),
      entityType: 'creditNote',
      entityId: input.creditNoteId,
      before: { status: 'pending' },
      reason: input.reason,
    };
    if (input.decision === 'rejected') {
      tx.update(ref, { status: 'rejected', ...decided });
      return {
        result: { creditNoteId: input.creditNoteId, status: 'rejected', journalId: null },
        audit: { ...audit, after: { status: 'rejected' } },
      };
    }
    if (!mayPostCreditNote(company!, note.customerId === null, true)) {
      throw denied('missing_permission', 'Approving this return also pays money back');
    }
    const invoice = await readInvoice(tx, input.companyId, note.invoiceId);
    for (const l of note.lines) {
      const sold = invoice.lines.find((s) => s.lineNo === l.lineNo)!;
      if (
        fromStorable(sold.returnedQtyMilli) + fromStorable(l.qtyMilli) >
        fromStorable(sold.qtyMilli)
      ) {
        throw failedPrecondition(
          'over_returned',
          `Line ${l.lineNo}: ${sold.sku} has been returned since this was raised`,
        );
      }
    }
    const prepared = await prepareCreditNote(
      tx,
      { company: company!, caller, now },
      input.creditNoteId,
      note,
      invoice,
    );
    const patch = prepared.commit();
    tx.update(ref, { ...patch, ...decided });
    return {
      result: {
        creditNoteId: input.creditNoteId,
        status: 'posted',
        journalId: patch.journalId ?? null,
      },
      audit: { ...audit, after: { status: 'posted', total: patch.totalMinor } },
    };
  },
});

export const allocateCreditNote = defineCommand({
  name: 'creditNote.allocate',
  access: { kind: 'company', permission: ['sales.receipt.post', 'sales.return.post'] },
  async handler({ tx, caller, input, now, company }) {
    const refs = companyRefs(input.companyId);
    const note = (await tx.get(refs.creditNote(input.creditNoteId))).data() as
      CreditNoteDoc | undefined;
    if (!note) throw notFound('credit_note_not_found', 'Return not found');
    if (note.status !== 'posted' || !note.customerId) {
      throw failedPrecondition('nothing_to_allocate', 'This return has no credit to use');
    }
    const apply = await applyAdvance(
      tx,
      { company: company!, caller, now },
      {
        type: 'creditNote',
        id: input.creditNoteId,
        number: note.number,
        customerId: note.customerId,
        branchId: note.branchId,
        availableMinor: unusedMinor(note.totalMinor, note.allocatedMinor, note.refundedMinor),
      },
      input.allocations,
    );
    const { journalId, allocations } = apply.commit();
    const allocated = fromStorable(note.allocatedMinor) + apply.total;
    tx.update(refs.creditNote(input.creditNoteId), {
      allocatedMinor: toStorable(allocated),
      allocations: [...note.allocations, ...allocations],
    });
    return {
      result: { creditNoteId: input.creditNoteId, journalId, allocated: apply.total.toString() },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'creditNote',
        entityId: input.creditNoteId,
        before: { allocated: note.allocatedMinor },
        after: { allocated: allocated.toString() },
      },
    };
  },
});

// --- Refunds ----------------------------------------------------------------------------------

type RefundSource = CustomerReceiptDoc | CreditNoteDoc;

async function readRefundSource(
  tx: Transaction,
  companyId: string,
  source: { type: 'customerReceipt' | 'creditNote'; id: string },
) {
  const refs = companyRefs(companyId);
  const ref =
    source.type === 'customerReceipt'
      ? refs.customerReceipt(source.id)
      : refs.creditNote(source.id);
  const doc = (await tx.get(ref)).data() as RefundSource | undefined;
  if (!doc) throw notFound('source_not_found', 'Payment or return not found');
  const isNote = source.type === 'creditNote';
  if (isNote && (doc as CreditNoteDoc).status !== 'posted') {
    throw failedPrecondition('nothing_to_refund', 'Only a posted return can be refunded');
  }
  if (!doc.customerId) {
    throw failedPrecondition('nothing_to_refund', 'A walk-in return was refunded when posted');
  }
  const total = isNote
    ? (doc as CreditNoteDoc).totalMinor
    : (doc as CustomerReceiptDoc).amountMinor;
  return {
    ref,
    doc,
    customerId: doc.customerId,
    availableMinor: unusedMinor(total, doc.allocatedMinor, doc.refundedMinor),
  };
}

/** Plans a refund posting (all reads); the returned function writes it. */
async function prepareRefund(
  tx: Transaction,
  ctx: Ctx,
  refundId: string,
  refund: CustomerRefundDoc,
) {
  const companyId = ctx.company.companyId;
  const refs = companyRefs(companyId);
  const source = await readRefundSource(tx, companyId, refund.source);
  const [companySnap, accountSnap] = await tx.getAll(refs.company, refs.account(refund.accountId));
  const companyDoc = companySnap!.data() as CompanyDoc;
  const amount = fromStorable(refund.amountMinor);
  if (amount > source.availableMinor) {
    throw failedPrecondition(
      'over_refunded',
      `Only ${toDecimalString(source.availableMinor, companyDoc.baseCurrency)} is left to pay back on ${refund.source.number}`,
    );
  }
  assertCashAccount(accountSnap!.data() as AccountDoc | undefined, 'The refund account');
  const customer = await readCustomer(tx, companyId, refund.customerId, false);
  const accounts = await readSystemAccounts(tx, companyId, ['customerAdvance']);
  const postingDate = businessDate(ctx.now.toDate(), companyDoc.timeZone);
  const write = await post(tx, ctx, {
    origin: 'system',
    branchId: refund.branchId,
    postingDate,
    memo: `${refund.number}: refund to ${refund.customerName}`,
    reference: refund.reference ?? refund.number,
    lines: [
      { accountId: accounts.customerAdvance, debit: amount, credit: 0n },
      { accountId: refund.accountId, debit: 0n, credit: amount },
    ],
    source: { type: 'customerRefund', id: refundId, number: refund.number },
  });
  return (): Partial<CustomerRefundDoc> => {
    const { journalId } = write();
    tx.update(source.ref, {
      refundedMinor: toStorable(fromStorable(source.doc.refundedMinor ?? 0) + amount),
    });
    tx.update(refs.customer(refund.customerId), {
      advanceMinor: toStorable(fromStorable(customer.advanceMinor) - amount),
    });
    return { status: 'posted', postingDate, journalId };
  };
}

export const createCustomerRefund = defineCommand({
  name: 'customerRefund.create',
  access: { kind: 'company', permission: ['sales.refund.request', 'sales.refund.post'] },
  async handler({ tx, caller, input, now, company }) {
    const refs = companyRefs(input.companyId);
    const source = await readRefundSource(tx, input.companyId, input.source);
    assertBranch(company!, source.doc.branchId);
    const [companySnap, accountSnap] = await tx.getAll(refs.company, refs.account(input.accountId));
    const currency = (companySnap!.data() as CompanyDoc).baseCurrency;
    const account = assertCashAccount(
      accountSnap!.data() as AccountDoc | undefined,
      'The refund account',
    );
    const amount = money(input.amount, currency);
    if (amount <= 0n) throw invalid('amount_zero', 'Enter the amount to pay back');
    if (amount > source.availableMinor) {
      throw failedPrecondition(
        'over_refunded',
        `Only ${toDecimalString(source.availableMinor, currency)} is left to pay back on ${source.doc.number}`,
      );
    }
    const series = await readSeries(tx, input.companyId, 'customerRefund', 'RF');
    const ref = refs.customerRefunds.doc();
    const refund: CustomerRefundDoc = {
      number: series.number,
      customerId: source.customerId,
      customerName: source.doc.customerName,
      branchId: source.doc.branchId,
      source: { ...input.source, number: source.doc.number },
      accountId: input.accountId,
      accountName: `${account.code} ${account.name}`,
      amountMinor: toStorable(amount),
      reason: input.reason,
      reference: input.reference ?? null,
      status: 'pending',
      createdAt: now,
      createdBy: caller.uid,
      decidedAt: null,
      decidedBy: null,
      decisionReason: null,
      postingDate: null,
      journalId: null,
    };
    const write = company!.permissions.has('sales.refund.post')
      ? await prepareRefund(tx, { company: company!, caller, now }, ref.id, refund)
      : null;
    series.commit();
    const doc: CustomerRefundDoc = write ? { ...refund, ...write() } : refund;
    tx.set(ref, doc);
    return {
      result: {
        refundId: ref.id,
        number: series.number,
        status: doc.status,
        journalId: doc.journalId,
      },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'customerRefund',
        entityId: ref.id,
        after: {
          number: series.number,
          source: doc.source,
          amount: amount.toString(),
          status: doc.status,
        },
        reason: input.reason,
      },
    };
  },
});

export const decideCustomerRefund = defineCommand({
  name: 'customerRefund.decide',
  access: { kind: 'company', permission: 'sales.refund.approve' },
  async handler({ tx, caller, input, now, company }) {
    const ref = companyRefs(input.companyId).customerRefund(input.refundId);
    const refund = (await tx.get(ref)).data() as CustomerRefundDoc | undefined;
    if (!refund) throw notFound('refund_not_found', 'Refund not found');
    if (refund.status !== 'pending') {
      throw failedPrecondition('not_pending', 'This refund has already been decided');
    }
    if (refund.createdBy === caller.uid) {
      throw denied('self_approval', 'You cannot approve or reject your own refund');
    }
    assertBranch(company!, refund.branchId);
    const decided = { decidedAt: now, decidedBy: caller.uid, decisionReason: input.reason };
    const audit = {
      target: companyTarget(input.companyId),
      entityType: 'customerRefund',
      entityId: input.refundId,
      before: { status: 'pending' },
      reason: input.reason,
    };
    if (input.decision === 'rejected') {
      tx.update(ref, { status: 'rejected', ...decided });
      return {
        result: { refundId: input.refundId, status: 'rejected', journalId: null },
        audit: { ...audit, after: { status: 'rejected' } },
      };
    }
    const write = await prepareRefund(
      tx,
      { company: company!, caller, now },
      input.refundId,
      refund,
    );
    const patch = write();
    tx.update(ref, { ...patch, ...decided });
    return {
      result: { refundId: input.refundId, status: 'posted', journalId: patch.journalId ?? null },
      audit: { ...audit, after: { status: 'posted', journalId: patch.journalId } },
    };
  },
});
