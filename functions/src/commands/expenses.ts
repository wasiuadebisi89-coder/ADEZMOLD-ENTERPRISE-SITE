/**
 * Business expenses (DECISION 24): office supplies, services, repairs and replacements recorded
 * without writing a journal. Each line is charged to an expense account. Paid now, the money comes
 * out of a cash or bank account (and the no-overdraft rule applies); on credit, a purchase invoice
 * owes the supplier so it ages and is paid like any other. No second approval, as for supplier
 * payments; backdating beyond the window needs an approved request.
 */
import type { DocumentReference } from 'firebase-admin/firestore';
import { addDays, fromStorable, isExpenseAccount, toStorable } from '@bms/domain';
import { defineCommand } from '../lib/command.js';
import {
  companyTarget,
  journalFrom,
  money,
  post,
  readSeries,
  readSystemAccounts,
} from '../lib/documents.js';
import { conflict, invalid } from '../lib/errors.js';
import {
  companyRefs,
  type AccountDoc,
  type CompanyDoc,
  type ExpenseDoc,
  type ExpenseLineDoc,
  type PurchaseInvoiceDoc,
  type SupplierDoc,
} from '../lib/model.js';
import { invoiceKeyId, readSupplier } from './purchasing.js';

export const postExpense = defineCommand({
  name: 'expense.post',
  access: {
    kind: 'company',
    // Paying out of cash or bank is a payment; owing a supplier is a purchase invoice.
    permission: (input) =>
      input.payment.mode === 'paid' ? 'purchasing.payment.post' : 'purchasing.invoice.post',
  },
  async handler({ tx, caller, input, now, company }) {
    const refs = companyRefs(input.companyId);
    const pay = input.payment;
    const credit = pay.mode === 'credit';
    const supplierId = pay.supplierId;
    const supplier: SupplierDoc | null = supplierId
      ? await readSupplier(tx, input.companyId, supplierId, credit)
      : null;

    const accountIds = [...new Set(input.lines.map((l) => l.accountId))];
    const [companySnap, ...accountSnaps] = await tx.getAll(
      refs.company,
      ...accountIds.map((id) => refs.account(id)),
      ...(pay.mode === 'paid' ? [refs.account(pay.paymentAccountId)] : []),
    );
    const currency = (companySnap!.data() as CompanyDoc).baseCurrency;
    const accounts = new Map(
      accountIds.map((id, i) => [id, accountSnaps[i]!.data() as AccountDoc | undefined]),
    );
    const payFrom =
      pay.mode === 'paid'
        ? (accountSnaps[accountIds.length]!.data() as AccountDoc | undefined)
        : undefined;
    if (
      pay.mode === 'paid' &&
      (!payFrom ||
        payFrom.status !== 'active' ||
        !payFrom.isPostable ||
        (payFrom.subtype !== 'cash' && payFrom.subtype !== 'bank'))
    ) {
      throw invalid('account_invalid', 'Pay from an active cash or bank account');
    }

    // --- Lines
    const entries: { accountId: string; amount: bigint }[] = [];
    const lines: ExpenseLineDoc[] = input.lines.map((l, i) => {
      const lineNo = i + 1;
      const account = accounts.get(l.accountId);
      if (!isExpenseAccount(account)) {
        throw invalid(
          'account_invalid',
          `Line ${lineNo}: choose an active expense account. Record equipment and other ` +
            'capital items under Fixed assets',
          { lineNo },
        );
      }
      const amount = money(l.amount, currency, lineNo);
      if (amount <= 0n) {
        throw invalid('amount_zero', `Line ${lineNo}: enter an amount`, { lineNo });
      }
      entries.push({ accountId: l.accountId, amount });
      return {
        lineNo,
        accountId: l.accountId,
        accountCode: account!.code,
        accountName: account!.name,
        description: l.description,
        amountMinor: toStorable(amount),
      };
    });
    const subtotal = entries.reduce((s, e) => s + e.amount, 0n);
    const inputTax = input.inputTax ? money(input.inputTax, currency) : 0n;
    const total = subtotal + inputTax;

    const system = await readSystemAccounts(
      tx,
      input.companyId,
      [
        ...(credit ? (['payable'] as const) : []),
        ...(inputTax > 0n ? (['inputTax'] as const) : []),
      ],
      credit ? ['payable'] : [],
    );
    if (inputTax > 0n) entries.push({ accountId: system.inputTax!, amount: inputTax });

    const series = await readSeries(tx, input.companyId, 'expense', 'EXP');
    const ref = refs.expenses.doc();
    const payee = supplier?.name ?? (pay.mode === 'paid' ? pay.payee! : '');

    // --- On credit: the purchase invoice that owes the supplier
    let invoice: {
      ref: DocumentReference;
      keyRef: DocumentReference;
      number: string;
      supplierInvoiceNo: string;
      dueDate: string;
      commit: () => void;
    } | null = null;
    if (pay.mode === 'credit') {
      const supplierInvoiceNo = input.reference ?? series.number;
      const keyRef = refs.supplierInvoiceKey(invoiceKeyId(pay.supplierId, supplierInvoiceNo));
      if ((await tx.get(keyRef)).exists) {
        throw conflict(
          'duplicate_supplier_invoice',
          `Invoice ${supplierInvoiceNo} from ${payee} is already recorded`,
        );
      }
      const dueDate = pay.dueDate ?? addDays(input.expenseDate, supplier!.paymentTermsDays);
      if (dueDate < input.expenseDate) {
        throw invalid('due_before_invoice', 'The due date cannot be before the expense date');
      }
      const piSeries = await readSeries(tx, input.companyId, 'purchaseInvoice', 'PI');
      invoice = {
        ref: refs.purchaseInvoices.doc(),
        keyRef,
        number: piSeries.number,
        supplierInvoiceNo,
        dueDate,
        commit: piSeries.commit,
      };
      entries.push({ accountId: system.payable!, amount: -total });
    } else {
      entries.push({ accountId: pay.paymentAccountId, amount: -total });
    }

    const firstLine = input.lines[0]!.description;
    const write = await post(
      tx,
      { company: company!, caller, now },
      {
        origin: 'system',
        branchId: input.branchId,
        postingDate: input.expenseDate,
        memo: `${series.number}: ${payee} · ${firstLine}${input.lines.length > 1 ? ' and more' : ''}`,
        reference: input.reference ?? series.number,
        lines: journalFrom(entries),
        backdateApprovalId: input.backdateApprovalId,
        source: { type: 'expense', id: ref.id, number: series.number },
        projectId: input.projectId,
      },
    );

    // --- Writes
    series.commit();
    const { journalId } = write();
    if (invoice) {
      invoice.commit();
      const doc: PurchaseInvoiceDoc = {
        number: invoice.number,
        kind: 'invoice',
        supplierId: supplierId!,
        supplierName: payee,
        supplierInvoiceNo: invoice.supplierInvoiceNo,
        branchId: input.branchId,
        invoiceDate: input.expenseDate,
        dueDate: invoice.dueDate,
        memo: input.memo ?? `Expense ${series.number}`,
        lines: lines.map((l) => ({
          lineNo: l.lineNo,
          kind: 'expense',
          description: l.description,
          amountMinor: l.amountMinor,
          goodsReceiptId: null,
          receiptNumber: null,
          receiptLineNo: null,
          productId: null,
          sku: null,
          unit: null,
          qtyMilli: null,
          grniMinor: null,
          returnedQtyMilli: null,
          returnedCreditMinor: null,
          inventoryMinor: null,
          cogsMinor: null,
          basis: null,
          accountId: l.accountId,
          accountCode: l.accountCode,
        })),
        inputTaxMinor: toStorable(inputTax),
        totalMinor: toStorable(total),
        paidMinor: 0,
        creditedMinor: 0,
        status: 'open',
        projectId: input.projectId ?? null,
        journalId,
        postedAt: now,
        postedBy: caller.uid,
      };
      tx.set(invoice.ref, doc);
      tx.set(invoice.keyRef, { invoiceId: invoice.ref.id, supplierId });
      tx.update(refs.supplier(supplierId!), {
        balanceMinor: toStorable(fromStorable(supplier!.balanceMinor) + total),
      });
    }
    const doc: ExpenseDoc = {
      number: series.number,
      mode: pay.mode,
      branchId: input.branchId,
      expenseDate: input.expenseDate,
      payee,
      supplierId: supplierId ?? null,
      paymentAccountId: pay.mode === 'paid' ? pay.paymentAccountId : null,
      paymentAccountName: payFrom ? `${payFrom.code} ${payFrom.name}` : null,
      purchaseInvoiceId: invoice?.ref.id ?? null,
      purchaseInvoiceNumber: invoice?.number ?? null,
      dueDate: invoice?.dueDate ?? null,
      reference: input.reference ?? null,
      memo: input.memo ?? null,
      lines,
      subtotalMinor: toStorable(subtotal),
      inputTaxMinor: toStorable(inputTax),
      totalMinor: toStorable(total),
      projectId: input.projectId ?? null,
      journalId,
      postedAt: now,
      postedBy: caller.uid,
    };
    tx.set(ref, doc);
    return {
      result: {
        expenseId: ref.id,
        number: series.number,
        journalId,
        purchaseInvoiceId: invoice?.ref.id ?? null,
      },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'expense',
        entityId: ref.id,
        after: {
          number: series.number,
          mode: pay.mode,
          payee,
          total: total.toString(),
          ...(invoice ? { purchaseInvoice: invoice.number } : {}),
        },
      },
    };
  },
});
