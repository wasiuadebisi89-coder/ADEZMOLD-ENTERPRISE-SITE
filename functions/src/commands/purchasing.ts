/**
 * Suppliers and purchasing (ACCOUNTING_POLICIES.md §5–6). Goods receipts put stock in at the
 * entered cost against GRNI; purchase invoices clear GRNI and owe the supplier; payments and
 * returns settle what is owed. Every posting goes through the posting engine in the same
 * transaction as the stock and document changes.
 */
import type { Timestamp, Transaction } from 'firebase-admin/firestore';
import {
  MoneyError,
  PurchasingError,
  addDays,
  allocateLandedCost,
  assertAllocations,
  branchAllowed,
  businessDate,
  clearingValue,
  fromStorable,
  mulRatio,
  parseMoney,
  parseQuantity,
  parseUnitCost,
  splitPriceDifference,
  toDecimalString,
  toStorable,
  valueAt,
  type JournalLine,
  type UnitCode,
} from '@bms/domain';
import type { Caller, CompanyContext } from '../lib/command.js';
import { defineCommand } from '../lib/command.js';
import { readSeries, readSystemAccounts } from '../lib/documents.js';
import {
  CommandError,
  conflict,
  denied,
  failedPrecondition,
  invalid,
  notFound,
} from '../lib/errors.js';
import { sha256 } from '../lib/hash.js';
import {
  companyRefs,
  type AccountDoc,
  type CompanyDoc,
  type GoodsReceiptDoc,
  type GoodsReceiptLineDoc,
  type LocationDoc,
  type ProductDoc,
  type PurchaseInvoiceDoc,
  type PurchaseInvoiceLineDoc,
  type SupplierDoc,
  type SupplierPaymentDoc,
  type SupplierReturnDoc,
  type SupplierReturnLineDoc,
} from '../lib/model.js';
import { preparePosting, writePosting, type PostingRequest } from '../lib/posting.js';
import { StockBook, inventoryError } from '../lib/stock.js';

// --- Shared helpers ---------------------------------------------------------------------------

function purchasingError(e: unknown, lineNo?: number): never {
  if (e instanceof PurchasingError) {
    const message = lineNo ? `Line ${lineNo}: ${e.message}` : e.message;
    throw new CommandError(
      e.code === 'over_cleared' || e.code === 'over_allocated'
        ? 'failed-precondition'
        : 'invalid-argument',
      e.code,
      message,
      lineNo ? { lineNo } : undefined,
    );
  }
  return inventoryError(e, lineNo);
}

function money(input: string, currency: string, lineNo?: number): bigint {
  try {
    return parseMoney(input, currency);
  } catch (e) {
    if (e instanceof MoneyError) {
      throw invalid('amount_invalid', lineNo ? `Line ${lineNo}: ${e.message}` : e.message, {
        ...(lineNo ? { lineNo } : {}),
      });
    }
    throw e;
  }
}

function positiveQuantity(input: string, unit: UnitCode, lineNo: number): bigint {
  let qty: bigint;
  try {
    qty = parseQuantity(input, unit);
  } catch (e) {
    return inventoryError(e, lineNo);
  }
  if (qty <= 0n) {
    throw invalid('invalid_quantity', `Line ${lineNo}: enter a quantity above zero`, { lineNo });
  }
  return qty;
}

/** Nets signed amounts (+ debit, − credit) per account into journal lines, debits first. */
function journalFrom(entries: readonly { accountId: string; amount: bigint }[]): JournalLine[] {
  const net = new Map<string, bigint>();
  for (const e of entries) net.set(e.accountId, (net.get(e.accountId) ?? 0n) + e.amount);
  const lines: JournalLine[] = [];
  for (const [accountId, amount] of net) {
    if (amount > 0n) lines.push({ accountId, debit: amount, credit: 0n });
  }
  for (const [accountId, amount] of net) {
    if (amount < 0n) lines.push({ accountId, debit: 0n, credit: -amount });
  }
  return lines;
}

async function readSupplier(
  tx: Transaction,
  companyId: string,
  supplierId: string,
  requireActive: boolean,
): Promise<SupplierDoc> {
  const supplier = (await tx.get(companyRefs(companyId).supplier(supplierId))).data() as
    SupplierDoc | undefined;
  if (!supplier) throw notFound('supplier_not_found', 'Supplier not found');
  if (requireActive && supplier.status !== 'active') {
    throw failedPrecondition('supplier_inactive', 'This supplier is inactive');
  }
  return supplier;
}

/** Supplier invoice numbers are unique per supplier, ignoring case and spaces. */
function invoiceKeyId(supplierId: string, supplierInvoiceNo: string): string {
  return sha256(`${supplierId}\n${supplierInvoiceNo.replace(/\s+/g, '').toUpperCase()}`).slice(
    0,
    40,
  );
}

function invoiceOutstanding(inv: PurchaseInvoiceDoc): bigint {
  return (
    fromStorable(inv.totalMinor) - fromStorable(inv.paidMinor) - fromStorable(inv.creditedMinor)
  );
}

function receiptInvoiceStatus(lines: readonly GoodsReceiptLineDoc[]) {
  const cleared = lines.filter((l) => l.clearedQtyMilli > 0).length;
  if (lines.every((l) => l.clearedQtyMilli >= l.qtyMilli)) return 'invoiced' as const;
  return cleared === 0 ? ('not_invoiced' as const) : ('partly_invoiced' as const);
}

async function post(
  tx: Transaction,
  ctx: { company: CompanyContext; caller: Caller; now: Timestamp },
  request: PostingRequest,
) {
  const prepared = await preparePosting(tx, ctx, request);
  return () =>
    writePosting(
      tx,
      { companyId: ctx.company.companyId, caller: ctx.caller, now: ctx.now },
      prepared,
    );
}

const companyTarget = (companyId: string) => ({ scope: 'company' as const, companyId });

// --- Suppliers --------------------------------------------------------------------------------

export const createSupplier = defineCommand({
  name: 'supplier.create',
  access: { kind: 'company', permission: 'purchasing.suppliers.manage' },
  async handler({ tx, caller, input, now }) {
    const refs = companyRefs(input.companyId);
    const same = await tx.get(refs.suppliers.where('code', '==', input.code).limit(1));
    if (!same.empty) throw conflict('code_taken', `Supplier code ${input.code} is already used`);
    const ref = refs.suppliers.doc();
    const doc: SupplierDoc = {
      code: input.code,
      name: input.name,
      contactName: input.contactName ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      taxId: input.taxId ?? null,
      paymentTermsDays: input.paymentTermsDays,
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
      result: { supplierId: ref.id },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'supplier',
        entityId: ref.id,
        after: { code: doc.code, name: doc.name, paymentTermsDays: doc.paymentTermsDays },
      },
    };
  },
});

export const updateSupplier = defineCommand({
  name: 'supplier.update',
  access: { kind: 'company', permission: 'purchasing.suppliers.manage' },
  async handler({ tx, caller, input, now }) {
    const refs = companyRefs(input.companyId);
    const supplier = await readSupplier(tx, input.companyId, input.supplierId, false);
    const patch: Partial<SupplierDoc> = {};
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
    if (input.status !== undefined) patch.status = input.status;
    tx.update(refs.supplier(input.supplierId), { ...patch, updatedAt: now, updatedBy: caller.uid });
    const before = Object.fromEntries(
      Object.keys(patch).map((k) => [k, supplier[k as keyof SupplierDoc]]),
    );
    return {
      result: { supplierId: input.supplierId },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'supplier',
        entityId: input.supplierId,
        before,
        after: patch,
      },
    };
  },
});

// --- Goods receipts ---------------------------------------------------------------------------

export const postGoodsReceipt = defineCommand({
  name: 'goodsReceipt.post',
  access: { kind: 'company', permission: 'purchasing.receipt.post' },
  async handler({ tx, caller, input, now, company }) {
    const refs = companyRefs(input.companyId);
    const supplier = await readSupplier(tx, input.companyId, input.supplierId, true);
    const productIds = [...new Set(input.lines.map((l) => l.productId))];
    const [companySnap, locationSnap, ...productSnaps] = await tx.getAll(
      refs.company,
      refs.location(input.locationId),
      ...productIds.map((id) => refs.product(id)),
    );
    const companyDoc = companySnap!.data() as CompanyDoc;
    const location = locationSnap!.data() as LocationDoc | undefined;
    if (!location || location.status !== 'active') {
      throw failedPrecondition('location_inactive', 'Choose an active location');
    }
    if (!branchAllowed(company!.member.branchScope, location.branchId)) {
      throw denied('branch_not_allowed', 'You cannot receive stock at this branch');
    }
    const products = new Map(
      productSnaps.map((s, i) => [productIds[i]!, s.data() as ProductDoc | undefined]),
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
    const accounts = await readSystemAccounts(
      tx,
      input.companyId,
      ['inventory', 'grni'],
      ['inventory', 'grni'],
    );
    const series = await readSeries(tx, input.companyId, 'goodsReceipt', 'GRN');
    const ref = refs.goodsReceipts.doc();
    const currency = companyDoc.baseCurrency;

    const lines: GoodsReceiptLineDoc[] = input.lines.map((l, i) => {
      const lineNo = i + 1;
      const product = products.get(l.productId);
      if (!product || product.status !== 'active') {
        throw failedPrecondition('product_inactive', `Line ${lineNo}: choose an active product`);
      }
      const qty = positiveQuantity(l.quantity, product.unit, lineNo);
      let cost: bigint;
      try {
        cost = parseUnitCost(l.unitCost, currency);
      } catch (e) {
        return inventoryError(e, lineNo);
      }
      const value = valueAt(qty, cost);
      try {
        book.receive(l.productId, input.locationId, qty, value, 'receipt', {
          id: ref.id,
          lineNo,
          date: input.postingDate,
        });
      } catch (e) {
        inventoryError(e, lineNo);
      }
      return {
        lineNo,
        productId: l.productId,
        sku: product.sku,
        productName: product.name,
        unit: product.unit,
        qtyMilli: toStorable(qty),
        unitCostScaled: toStorable(cost),
        valueMinor: toStorable(value),
        clearedQtyMilli: 0,
        clearedValueMinor: 0,
      };
    });
    const total = lines.reduce((s, l) => s + BigInt(l.valueMinor), 0n);
    if (total <= 0n) throw invalid('amount_zero', 'The receipt has no value; enter unit costs');

    const write = await post(
      tx,
      { company: company!, caller, now },
      {
        origin: 'system',
        branchId: location.branchId,
        postingDate: input.postingDate,
        memo: `${series.number}: goods received from ${supplier.name}`,
        reference: input.reference ?? series.number,
        lines: [
          { accountId: accounts.inventory, debit: total, credit: 0n },
          { accountId: accounts.grni, debit: 0n, credit: total },
        ],
        backdateApprovalId: input.backdateApprovalId,
        source: { type: 'goodsReceipt', id: ref.id, number: series.number },
      },
    );

    // --- Writes
    series.commit();
    const { journalId } = write();
    book.write(tx, {
      postingDate: input.postingDate,
      sourceType: 'goodsReceipt',
      sourceId: ref.id,
      sourceNumber: series.number,
      journalId,
      now,
      uid: caller.uid,
    });
    for (const [id, p] of products) {
      if (p && !p.hasMovements) tx.update(refs.product(id), { hasMovements: true });
    }
    if (!companyDoc.locks.costingMethod) tx.update(refs.company, { 'locks.costingMethod': true });
    const doc: GoodsReceiptDoc = {
      number: series.number,
      supplierId: input.supplierId,
      supplierName: supplier.name,
      locationId: input.locationId,
      branchId: location.branchId,
      postingDate: input.postingDate,
      reference: input.reference ?? null,
      memo: input.memo ?? null,
      lines,
      totalMinor: toStorable(total),
      invoiceStatus: 'not_invoiced',
      journalId,
      postedAt: now,
      postedBy: caller.uid,
    };
    tx.set(ref, doc);
    return {
      result: { goodsReceiptId: ref.id, number: series.number, journalId },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'goodsReceipt',
        entityId: ref.id,
        after: {
          number: series.number,
          supplierId: input.supplierId,
          locationId: input.locationId,
          total: total.toString(),
          lines: lines.length,
        },
      },
    };
  },
});

// --- Purchase invoices ------------------------------------------------------------------------

export const postPurchaseInvoice = defineCommand({
  name: 'purchaseInvoice.post',
  access: { kind: 'company', permission: 'purchasing.invoice.post' },
  async handler({ tx, caller, input, now, company }) {
    const refs = companyRefs(input.companyId);
    const supplier = await readSupplier(tx, input.companyId, input.supplierId, true);
    const keyRef = refs.supplierInvoiceKey(invoiceKeyId(input.supplierId, input.supplierInvoiceNo));
    const receiptIds = [
      ...new Set(input.lines.flatMap((l) => (l.kind === 'expense' ? [] : [l.goodsReceiptId]))),
    ];
    const accountIds = [
      ...new Set(input.lines.flatMap((l) => (l.kind === 'expense' ? [l.accountId] : []))),
    ];
    const [companySnap, keySnap, ...rest] = await tx.getAll(
      refs.company,
      keyRef,
      ...receiptIds.map((id) => refs.goodsReceipt(id)),
      ...accountIds.map((id) => refs.account(id)),
    );
    if (keySnap!.exists) {
      throw conflict(
        'duplicate_supplier_invoice',
        `Invoice ${input.supplierInvoiceNo} from ${supplier.name} is already recorded`,
      );
    }
    const companyDoc = companySnap!.data() as CompanyDoc;
    const currency = companyDoc.baseCurrency;
    const receipts = new Map(
      receiptIds.map((id, i) => [id, rest[i]!.data() as GoodsReceiptDoc | undefined]),
    );
    const expenseAccounts = new Map(
      accountIds.map((id, i) => [
        id,
        rest[receiptIds.length + i]!.data() as AccountDoc | undefined,
      ]),
    );

    const hasGoods = input.lines.some((l) => l.kind !== 'expense');
    const inputTax = input.inputTax ? money(input.inputTax, currency) : 0n;
    const subtypes = [
      'payable' as const,
      ...(hasGoods ? (['grni', 'inventory', 'cogs'] as const) : []),
      ...(inputTax > 0n ? (['inputTax'] as const) : []),
    ];
    const accounts = await readSystemAccounts(tx, input.companyId, subtypes, [
      'payable',
      'grni',
      'inventory',
    ]);

    // Stock for every receipt line the invoice touches.
    for (const [id, r] of receipts) {
      if (!r) throw notFound('receipt_not_found', `Goods receipt ${id} not found`);
      if (r.branchId !== input.branchId) {
        throw failedPrecondition(
          'branch_mismatch',
          `${r.number} was received at another branch; invoice it there`,
        );
      }
    }
    const book = await StockBook.read(
      tx,
      input.companyId,
      companyDoc.costingMethod === 'fifo',
      [...receipts.values()].flatMap((r) =>
        r!.lines.map((l) => ({
          productId: l.productId,
          locationId: r!.locationId,
          branchId: r!.branchId,
        })),
      ),
    );
    const series = await readSeries(tx, input.companyId, 'purchaseInvoice', 'PI');
    const ref = refs.purchaseInvoices.doc();

    // --- Plan
    const entries: { accountId: string; amount: bigint }[] = [];
    const changedReceipts = new Set<string>();
    const lines: PurchaseInvoiceLineDoc[] = input.lines.map((l, i) => {
      const lineNo = i + 1;
      const amount = money(l.amount, currency, lineNo);
      const base: PurchaseInvoiceLineDoc = {
        lineNo,
        kind: l.kind,
        description: '',
        amountMinor: toStorable(amount),
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
        accountId: null,
        accountCode: null,
      };
      try {
        if (l.kind === 'expense') {
          const account = expenseAccounts.get(l.accountId);
          if (
            !account ||
            account.status !== 'active' ||
            !account.isPostable ||
            account.isControl ||
            account.subtype === 'openingBalanceEquity' ||
            account.subtype === 'retainedEarnings'
          ) {
            throw invalid(
              'account_invalid',
              `Line ${lineNo}: choose an active, non-control posting account`,
              { lineNo },
            );
          }
          if (amount <= 0n) throw new PurchasingError('invalid_amount', 'Enter an amount');
          entries.push({ accountId: l.accountId, amount });
          return {
            ...base,
            description: l.description,
            accountId: l.accountId,
            accountCode: account.code,
          };
        }

        const receipt = receipts.get(l.goodsReceiptId)!;
        if (l.kind === 'receipt') {
          if (receipt.supplierId !== input.supplierId) {
            throw failedPrecondition(
              'supplier_mismatch',
              `Line ${lineNo}: ${receipt.number} is from another supplier`,
            );
          }
          const rl = receipt.lines.find((x) => x.lineNo === l.lineNo);
          if (!rl) throw notFound('receipt_line_not_found', `Line ${lineNo}: no such receipt line`);
          const qty = positiveQuantity(l.quantity, rl.unit, lineNo);
          const grni = clearingValue(
            {
              qtyMilli: fromStorable(rl.qtyMilli),
              valueMinor: fromStorable(rl.valueMinor),
              clearedQtyMilli: fromStorable(rl.clearedQtyMilli),
              clearedValueMinor: fromStorable(rl.clearedValueMinor),
            },
            qty,
          );
          rl.clearedQtyMilli = toStorable(fromStorable(rl.clearedQtyMilli) + qty);
          rl.clearedValueMinor = toStorable(fromStorable(rl.clearedValueMinor) + grni);
          changedReceipts.add(l.goodsReceiptId);

          const source = { id: l.goodsReceiptId, lineNo: rl.lineNo };
          const onHand = book.onHandFrom(rl.productId, receipt.locationId, source);
          const split = splitPriceDifference(
            amount - grni,
            qty,
            onHand.qtyMilli,
            onHand.valueMinor,
          );
          book.revalue(rl.productId, receipt.locationId, split.inventory, source);
          entries.push(
            { accountId: accounts.grni!, amount: grni },
            { accountId: accounts.inventory!, amount: split.inventory },
            { accountId: accounts.cogs!, amount: split.cogs },
          );
          return {
            ...base,
            description: `${rl.sku} ${rl.productName}`,
            goodsReceiptId: l.goodsReceiptId,
            receiptNumber: receipt.number,
            receiptLineNo: rl.lineNo,
            productId: rl.productId,
            sku: rl.sku,
            unit: rl.unit,
            qtyMilli: toStorable(qty),
            grniMinor: toStorable(grni),
            returnedQtyMilli: 0,
            returnedCreditMinor: 0,
            inventoryMinor: toStorable(split.inventory),
            cogsMinor: toStorable(split.cogs),
          };
        }

        // Landed cost: spread over the receipt's lines, then split by what is still on hand.
        const parts = allocateLandedCost(
          amount,
          l.basis,
          receipt.lines.map((rl) => ({
            qtyMilli: fromStorable(rl.qtyMilli),
            valueMinor: fromStorable(rl.valueMinor),
          })),
        );
        let toStock = 0n;
        let toCogs = 0n;
        receipt.lines.forEach((rl, j) => {
          const part = parts[j]!;
          if (part === 0n) return;
          const source = { id: l.goodsReceiptId, lineNo: rl.lineNo };
          const onHand = book.onHandFrom(rl.productId, receipt.locationId, source);
          const split = splitPriceDifference(
            part,
            fromStorable(rl.qtyMilli),
            onHand.qtyMilli,
            onHand.valueMinor,
          );
          book.revalue(rl.productId, receipt.locationId, split.inventory, source);
          toStock += split.inventory;
          toCogs += split.cogs;
        });
        entries.push(
          { accountId: accounts.inventory!, amount: toStock },
          { accountId: accounts.cogs!, amount: toCogs },
        );
        return {
          ...base,
          description: l.description,
          goodsReceiptId: l.goodsReceiptId,
          receiptNumber: receipt.number,
          basis: l.basis,
          inventoryMinor: toStorable(toStock),
          cogsMinor: toStorable(toCogs),
        };
      } catch (e) {
        return purchasingError(e, lineNo);
      }
    });

    const subtotal = lines.reduce((s, l) => s + BigInt(l.amountMinor), 0n);
    const total = subtotal + inputTax;
    if (total <= 0n) throw invalid('amount_zero', 'The invoice total must be above zero');
    if (inputTax > 0n) entries.push({ accountId: accounts.inputTax!, amount: inputTax });
    entries.push({ accountId: accounts.payable, amount: -total });
    const dueDate = input.dueDate ?? addDays(input.invoiceDate, supplier.paymentTermsDays);
    if (dueDate < input.invoiceDate) {
      throw invalid('due_before_invoice', 'The due date cannot be before the invoice date');
    }

    const write = await post(
      tx,
      { company: company!, caller, now },
      {
        origin: 'system',
        branchId: input.branchId,
        postingDate: input.invoiceDate,
        memo: `${series.number}: ${supplier.name} invoice ${input.supplierInvoiceNo}`,
        reference: input.supplierInvoiceNo,
        lines: journalFrom(entries),
        backdateApprovalId: input.backdateApprovalId,
        source: { type: 'purchaseInvoice', id: ref.id, number: series.number },
      },
    );

    // --- Writes
    series.commit();
    const { journalId } = write();
    if (book.hasMovements) {
      book.write(tx, {
        postingDate: input.invoiceDate,
        sourceType: 'purchaseInvoice',
        sourceId: ref.id,
        sourceNumber: series.number,
        journalId,
        now,
        uid: caller.uid,
      });
    }
    for (const id of changedReceipts) {
      const r = receipts.get(id)!;
      tx.update(refs.goodsReceipt(id), {
        lines: r.lines,
        invoiceStatus: receiptInvoiceStatus(r.lines),
      });
    }
    const doc: PurchaseInvoiceDoc = {
      number: series.number,
      kind: 'invoice',
      supplierId: input.supplierId,
      supplierName: supplier.name,
      supplierInvoiceNo: input.supplierInvoiceNo,
      branchId: input.branchId,
      invoiceDate: input.invoiceDate,
      dueDate,
      memo: input.memo ?? null,
      lines,
      inputTaxMinor: toStorable(inputTax),
      totalMinor: toStorable(total),
      paidMinor: 0,
      creditedMinor: 0,
      status: 'open',
      journalId,
      postedAt: now,
      postedBy: caller.uid,
    };
    tx.set(ref, doc);
    tx.set(keyRef, { invoiceId: ref.id, supplierId: input.supplierId });
    tx.update(refs.supplier(input.supplierId), {
      balanceMinor: toStorable(fromStorable(supplier.balanceMinor) + total),
    });
    return {
      result: { invoiceId: ref.id, number: series.number, journalId },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'purchaseInvoice',
        entityId: ref.id,
        after: {
          number: series.number,
          supplierId: input.supplierId,
          supplierInvoiceNo: input.supplierInvoiceNo,
          total: total.toString(),
          dueDate,
        },
      },
    };
  },
});

export const postSupplierOpeningBalance = defineCommand({
  name: 'supplierOpeningBalance.post',
  access: { kind: 'company', permission: 'purchasing.invoice.post' },
  async handler({ tx, caller, input, now, company }) {
    const refs = companyRefs(input.companyId);
    const supplier = await readSupplier(tx, input.companyId, input.supplierId, false);
    const keyRef = refs.supplierInvoiceKey(invoiceKeyId(input.supplierId, input.supplierInvoiceNo));
    const [companySnap, keySnap] = await tx.getAll(refs.company, keyRef);
    if (keySnap!.exists) {
      throw conflict(
        'duplicate_supplier_invoice',
        `Invoice ${input.supplierInvoiceNo} from ${supplier.name} is already recorded`,
      );
    }
    const currency = (companySnap!.data() as CompanyDoc).baseCurrency;
    const amount = money(input.amount, currency);
    if (amount <= 0n) throw invalid('amount_zero', 'Enter the amount owed');
    const accounts = await readSystemAccounts(
      tx,
      input.companyId,
      ['payable', 'openingBalanceEquity'],
      ['payable'],
    );
    const series = await readSeries(tx, input.companyId, 'purchaseInvoice', 'PI');
    const ref = refs.purchaseInvoices.doc();
    const dueDate = input.dueDate ?? input.asAtDate;
    const write = await post(
      tx,
      { company: company!, caller, now },
      {
        origin: 'system',
        branchId: input.branchId,
        postingDate: input.asAtDate,
        memo: `${series.number}: opening balance owed to ${supplier.name}`,
        reference: input.supplierInvoiceNo,
        lines: [
          { accountId: accounts.openingBalanceEquity, debit: amount, credit: 0n },
          { accountId: accounts.payable, debit: 0n, credit: amount },
        ],
        backdateApprovalId: input.backdateApprovalId,
        source: { type: 'purchaseInvoice', id: ref.id, number: series.number },
      },
    );
    series.commit();
    const { journalId } = write();
    const doc: PurchaseInvoiceDoc = {
      number: series.number,
      kind: 'opening',
      supplierId: input.supplierId,
      supplierName: supplier.name,
      supplierInvoiceNo: input.supplierInvoiceNo,
      branchId: input.branchId,
      invoiceDate: input.asAtDate,
      dueDate,
      memo: 'Opening balance',
      lines: [
        {
          lineNo: 1,
          kind: 'opening',
          description: 'Opening balance',
          amountMinor: toStorable(amount),
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
          accountId: null,
          accountCode: null,
        },
      ],
      inputTaxMinor: 0,
      totalMinor: toStorable(amount),
      paidMinor: 0,
      creditedMinor: 0,
      status: 'open',
      journalId,
      postedAt: now,
      postedBy: caller.uid,
    };
    tx.set(ref, doc);
    tx.set(keyRef, { invoiceId: ref.id, supplierId: input.supplierId });
    tx.update(refs.supplier(input.supplierId), {
      balanceMinor: toStorable(fromStorable(supplier.balanceMinor) + amount),
    });
    return {
      result: { invoiceId: ref.id, number: series.number, journalId },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'purchaseInvoice',
        entityId: ref.id,
        after: { number: series.number, kind: 'opening', amount: amount.toString() },
      },
    };
  },
});

// --- Payments ---------------------------------------------------------------------------------

async function readInvoicesFor(
  tx: Transaction,
  companyId: string,
  supplierId: string,
  ids: readonly string[],
): Promise<Map<string, PurchaseInvoiceDoc>> {
  if (new Set(ids).size !== ids.length) {
    throw invalid('duplicate_invoice', 'Each invoice can appear only once');
  }
  const refs = companyRefs(companyId);
  const snaps = ids.length ? await tx.getAll(...ids.map((id) => refs.purchaseInvoice(id))) : [];
  const result = new Map<string, PurchaseInvoiceDoc>();
  snaps.forEach((s, i) => {
    const inv = s.data() as PurchaseInvoiceDoc | undefined;
    if (!inv || inv.supplierId !== supplierId) {
      throw notFound('invoice_not_found', `Invoice ${ids[i]} is not one of this supplier's`);
    }
    result.set(ids[i]!, inv);
  });
  return result;
}

function planAllocations(
  available: bigint,
  requested: readonly { invoiceId: string; amount: string }[],
  invoices: Map<string, PurchaseInvoiceDoc>,
  currency: string,
) {
  const planned = requested.map((a, i) => ({
    invoiceId: a.invoiceId,
    amountMinor: money(a.amount, currency, i + 1),
    outstandingMinor: invoiceOutstanding(invoices.get(a.invoiceId)!),
    label: invoices.get(a.invoiceId)!.number,
  }));
  try {
    return { planned, total: assertAllocations(available, planned) };
  } catch (e) {
    return purchasingError(e);
  }
}

function applyAllocations(
  tx: Transaction,
  companyId: string,
  planned: ReturnType<typeof planAllocations>['planned'],
  invoices: Map<string, PurchaseInvoiceDoc>,
) {
  const refs = companyRefs(companyId);
  for (const a of planned) {
    const inv = invoices.get(a.invoiceId)!;
    const paid = fromStorable(inv.paidMinor) + a.amountMinor;
    const left = fromStorable(inv.totalMinor) - paid - fromStorable(inv.creditedMinor);
    tx.update(refs.purchaseInvoice(a.invoiceId), {
      paidMinor: toStorable(paid),
      status: left === 0n ? 'paid' : 'open',
    });
  }
}

export const postSupplierPayment = defineCommand({
  name: 'supplierPayment.post',
  access: { kind: 'company', permission: 'purchasing.payment.post' },
  async handler({ tx, caller, input, now, company }) {
    const refs = companyRefs(input.companyId);
    const supplier = await readSupplier(tx, input.companyId, input.supplierId, false);
    const [companySnap, accountSnap] = await tx.getAll(
      refs.company,
      refs.account(input.paymentAccountId),
    );
    const currency = (companySnap!.data() as CompanyDoc).baseCurrency;
    const payFrom = accountSnap!.data() as AccountDoc | undefined;
    if (
      !payFrom ||
      payFrom.status !== 'active' ||
      !payFrom.isPostable ||
      (payFrom.subtype !== 'cash' && payFrom.subtype !== 'bank')
    ) {
      throw invalid('account_invalid', 'Pay from an active cash or bank account');
    }
    const amount = money(input.amount, currency);
    if (amount <= 0n) throw invalid('amount_zero', 'Enter the amount paid');
    const invoices = await readInvoicesFor(
      tx,
      input.companyId,
      input.supplierId,
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
      ['payable', ...(advance > 0n ? (['supplierAdvance'] as const) : [])],
      ['payable'],
    );
    const series = await readSeries(tx, input.companyId, 'supplierPayment', 'SP');
    const ref = refs.supplierPayments.doc();
    const write = await post(
      tx,
      { company: company!, caller, now },
      {
        origin: 'system',
        branchId: input.branchId,
        postingDate: input.postingDate,
        memo: `${series.number}: payment to ${supplier.name}`,
        reference: input.reference ?? series.number,
        lines: journalFrom([
          { accountId: accounts.payable, amount: allocated },
          ...(advance > 0n ? [{ accountId: accounts.supplierAdvance!, amount: advance }] : []),
          { accountId: input.paymentAccountId, amount: -amount },
        ]),
        backdateApprovalId: input.backdateApprovalId,
        source: { type: 'supplierPayment', id: ref.id, number: series.number },
      },
    );
    series.commit();
    const { journalId } = write();
    applyAllocations(tx, input.companyId, planned, invoices);
    const doc: SupplierPaymentDoc = {
      number: series.number,
      supplierId: input.supplierId,
      supplierName: supplier.name,
      branchId: input.branchId,
      postingDate: input.postingDate,
      paymentAccountId: input.paymentAccountId,
      paymentAccountName: `${payFrom.code} ${payFrom.name}`,
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
    tx.update(refs.supplier(input.supplierId), {
      balanceMinor: toStorable(fromStorable(supplier.balanceMinor) - allocated),
      advanceMinor: toStorable(fromStorable(supplier.advanceMinor) + advance),
    });
    return {
      result: { paymentId: ref.id, number: series.number, journalId },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'supplierPayment',
        entityId: ref.id,
        after: {
          number: series.number,
          supplierId: input.supplierId,
          amount: amount.toString(),
          allocated: allocated.toString(),
        },
      },
    };
  },
});

export const allocateSupplierPayment = defineCommand({
  name: 'supplierPayment.allocate',
  access: { kind: 'company', permission: 'purchasing.payment.post' },
  async handler({ tx, caller, input, now, company }) {
    const refs = companyRefs(input.companyId);
    const [companySnap, paymentSnap] = await tx.getAll(
      refs.company,
      refs.supplierPayment(input.paymentId),
    );
    const payment = paymentSnap!.data() as SupplierPaymentDoc | undefined;
    if (!payment) throw notFound('payment_not_found', 'Payment not found');
    const companyDoc = companySnap!.data() as CompanyDoc;
    const supplier = await readSupplier(tx, input.companyId, payment.supplierId, false);
    const invoices = await readInvoicesFor(
      tx,
      input.companyId,
      payment.supplierId,
      input.allocations.map((a) => a.invoiceId),
    );
    const unallocated = fromStorable(payment.amountMinor) - fromStorable(payment.allocatedMinor);
    if (unallocated <= 0n) {
      throw failedPrecondition('nothing_to_allocate', 'This payment is fully allocated');
    }
    const { planned, total } = planAllocations(
      unallocated,
      input.allocations,
      invoices,
      companyDoc.baseCurrency,
    );
    const accounts = await readSystemAccounts(
      tx,
      input.companyId,
      ['payable', 'supplierAdvance'],
      ['payable'],
    );
    const postingDate = businessDate(now.toDate(), companyDoc.timeZone);
    const write = await post(
      tx,
      { company: company!, caller, now },
      {
        origin: 'system',
        branchId: payment.branchId,
        postingDate,
        memo: `${payment.number}: advance applied to invoices`,
        reference: payment.number,
        lines: [
          { accountId: accounts.payable, debit: total, credit: 0n },
          { accountId: accounts.supplierAdvance, debit: 0n, credit: total },
        ],
        source: { type: 'supplierPayment', id: input.paymentId, number: payment.number },
      },
    );
    const { journalId } = write();
    applyAllocations(tx, input.companyId, planned, invoices);
    tx.update(refs.supplierPayment(input.paymentId), {
      allocatedMinor: toStorable(fromStorable(payment.allocatedMinor) + total),
      allocations: [
        ...payment.allocations,
        ...planned.map((a) => ({
          invoiceId: a.invoiceId,
          invoiceNumber: a.label,
          amountMinor: toStorable(a.amountMinor),
          journalId,
          allocatedAt: now,
        })),
      ],
    });
    tx.update(refs.supplier(payment.supplierId), {
      balanceMinor: toStorable(fromStorable(supplier.balanceMinor) - total),
      advanceMinor: toStorable(fromStorable(supplier.advanceMinor) - total),
    });
    return {
      result: { paymentId: input.paymentId, journalId, allocated: total.toString() },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'supplierPayment',
        entityId: input.paymentId,
        before: { allocated: payment.allocatedMinor },
        after: { allocated: (fromStorable(payment.allocatedMinor) + total).toString() },
      },
    };
  },
});

// --- Supplier returns -------------------------------------------------------------------------

export const postSupplierReturn = defineCommand({
  name: 'supplierReturn.post',
  access: { kind: 'company', permission: 'purchasing.invoice.post' },
  async handler({ tx, caller, input, now, company }) {
    const refs = companyRefs(input.companyId);
    const supplier = await readSupplier(tx, input.companyId, input.supplierId, false);
    const receiptIds = [...new Set(input.lines.map((l) => l.goodsReceiptId))];
    const invoiceIds = [...new Set(input.lines.flatMap((l) => (l.invoiceId ? [l.invoiceId] : [])))];
    const [companySnap, locationSnap, ...rest] = await tx.getAll(
      refs.company,
      refs.location(input.locationId),
      ...receiptIds.map((id) => refs.goodsReceipt(id)),
      ...invoiceIds.map((id) => refs.purchaseInvoice(id)),
    );
    const companyDoc = companySnap!.data() as CompanyDoc;
    const location = locationSnap!.data() as LocationDoc | undefined;
    if (!location || location.status !== 'active') {
      throw failedPrecondition('location_inactive', 'Choose an active location');
    }
    if (!branchAllowed(company!.member.branchScope, location.branchId)) {
      throw denied('branch_not_allowed', 'You cannot return stock from this branch');
    }
    const receipts = new Map(
      receiptIds.map((id, i) => [id, rest[i]!.data() as GoodsReceiptDoc | undefined]),
    );
    const invoices = new Map(
      invoiceIds.map((id, i) => [
        id,
        rest[receiptIds.length + i]!.data() as PurchaseInvoiceDoc | undefined,
      ]),
    );
    for (const [id, r] of receipts) {
      if (!r || r.supplierId !== input.supplierId) {
        throw notFound('receipt_not_found', `Goods receipt ${id} is not one of this supplier's`);
      }
      if (r.branchId !== location.branchId) {
        throw failedPrecondition(
          'branch_mismatch',
          `${r.number} was received at another branch; return the goods from there`,
        );
      }
    }
    for (const [id, inv] of invoices) {
      if (!inv || inv.supplierId !== input.supplierId) {
        throw notFound('invoice_not_found', `Invoice ${id} is not one of this supplier's`);
      }
    }
    const usesGrni = input.lines.some((l) => !l.invoiceId);
    const usesPayable = invoiceIds.length > 0;
    const accounts = await readSystemAccounts(
      tx,
      input.companyId,
      [
        'inventory',
        'purchasePriceVariance',
        ...(usesGrni ? (['grni'] as const) : []),
        ...(usesPayable ? (['payable'] as const) : []),
      ],
      ['inventory', 'grni', 'payable'],
    );
    const book = await StockBook.read(
      tx,
      input.companyId,
      companyDoc.costingMethod === 'fifo',
      input.lines.map((l) => {
        const r = receipts.get(l.goodsReceiptId)!;
        const rl = r.lines.find((x) => x.lineNo === l.lineNo);
        return {
          productId: rl?.productId ?? '',
          locationId: input.locationId,
          branchId: location.branchId,
        };
      }),
    );
    const series = await readSeries(tx, input.companyId, 'supplierReturn', 'SR');
    const ref = refs.supplierReturns.doc();

    // --- Plan
    const entries: { accountId: string; amount: bigint }[] = [];
    const creditByInvoice = new Map<string, bigint>();
    const changedReceipts = new Set<string>();
    const lines: SupplierReturnLineDoc[] = input.lines.map((l, i) => {
      const lineNo = i + 1;
      const receipt = receipts.get(l.goodsReceiptId)!;
      const rl = receipt.lines.find((x) => x.lineNo === l.lineNo);
      if (!rl) throw notFound('receipt_line_not_found', `Line ${lineNo}: no such receipt line`);
      const qty = positiveQuantity(l.quantity, rl.unit, lineNo);
      try {
        let credit: bigint;
        let invoiceNumber: string | null = null;
        if (!l.invoiceId) {
          // Not yet invoiced: release GRNI at the received cost.
          credit = clearingValue(
            {
              qtyMilli: fromStorable(rl.qtyMilli),
              valueMinor: fromStorable(rl.valueMinor),
              clearedQtyMilli: fromStorable(rl.clearedQtyMilli),
              clearedValueMinor: fromStorable(rl.clearedValueMinor),
            },
            qty,
          );
          rl.clearedQtyMilli = toStorable(fromStorable(rl.clearedQtyMilli) + qty);
          rl.clearedValueMinor = toStorable(fromStorable(rl.clearedValueMinor) + credit);
          changedReceipts.add(l.goodsReceiptId);
          entries.push({ accountId: accounts.grni!, amount: credit });
        } else {
          // Invoiced: credit the invoiced price against that invoice.
          const inv = invoices.get(l.invoiceId)!;
          invoiceNumber = inv.number;
          const il = inv.lines.find(
            (x) =>
              x.kind === 'receipt' &&
              x.goodsReceiptId === l.goodsReceiptId &&
              x.receiptLineNo === l.lineNo &&
              (x.qtyMilli ?? 0) - (x.returnedQtyMilli ?? 0) >= toStorable(qty),
          );
          if (!il) {
            throw failedPrecondition(
              'over_returned',
              `Line ${lineNo}: ${inv.number} does not have that much of ${rl.sku} left to return`,
            );
          }
          const returned = fromStorable(il.returnedQtyMilli ?? 0) + qty;
          const cumulative = mulRatio(
            fromStorable(il.amountMinor),
            returned,
            fromStorable(il.qtyMilli!),
          );
          credit = cumulative - fromStorable(il.returnedCreditMinor ?? 0);
          il.returnedQtyMilli = toStorable(returned);
          il.returnedCreditMinor = toStorable(cumulative);
          creditByInvoice.set(l.invoiceId, (creditByInvoice.get(l.invoiceId) ?? 0n) + credit);
          entries.push({ accountId: accounts.payable!, amount: credit });
        }
        const cost = book.issue(rl.productId, input.locationId, qty, 'purchase_return');
        entries.push(
          { accountId: accounts.inventory, amount: -cost },
          { accountId: accounts.purchasePriceVariance, amount: cost - credit },
        );
        return {
          lineNo,
          goodsReceiptId: l.goodsReceiptId,
          receiptNumber: receipt.number,
          receiptLineNo: rl.lineNo,
          invoiceId: l.invoiceId ?? null,
          invoiceNumber,
          productId: rl.productId,
          sku: rl.sku,
          productName: rl.productName,
          unit: rl.unit,
          qtyMilli: toStorable(qty),
          costMinor: toStorable(cost),
          creditMinor: toStorable(credit),
        };
      } catch (e) {
        return purchasingError(e, lineNo);
      }
    });
    for (const [id, credit] of creditByInvoice) {
      const inv = invoices.get(id)!;
      if (credit > invoiceOutstanding(inv)) {
        throw failedPrecondition(
          'invoice_settled',
          `${inv.number} has only ${toDecimalString(invoiceOutstanding(inv), companyDoc.baseCurrency)} left to pay, less than the credit. Refunds from suppliers are not supported yet`,
        );
      }
    }
    const costTotal = lines.reduce((s, l) => s + BigInt(l.costMinor), 0n);
    const creditTotal = lines.reduce((s, l) => s + BigInt(l.creditMinor), 0n);

    const write = await post(
      tx,
      { company: company!, caller, now },
      {
        origin: 'system',
        branchId: location.branchId,
        postingDate: input.postingDate,
        memo: `${series.number}: goods returned to ${supplier.name}`,
        reference: series.number,
        lines: journalFrom(entries),
        backdateApprovalId: input.backdateApprovalId,
        source: { type: 'supplierReturn', id: ref.id, number: series.number },
      },
    );

    // --- Writes
    series.commit();
    const { journalId } = write();
    book.write(tx, {
      postingDate: input.postingDate,
      sourceType: 'supplierReturn',
      sourceId: ref.id,
      sourceNumber: series.number,
      journalId,
      now,
      uid: caller.uid,
    });
    for (const id of changedReceipts) {
      const r = receipts.get(id)!;
      tx.update(refs.goodsReceipt(id), {
        lines: r.lines,
        invoiceStatus: receiptInvoiceStatus(r.lines),
      });
    }
    let payableCredit = 0n;
    for (const [id, credit] of creditByInvoice) {
      const inv = invoices.get(id)!;
      const credited = fromStorable(inv.creditedMinor) + credit;
      const left = fromStorable(inv.totalMinor) - fromStorable(inv.paidMinor) - credited;
      tx.update(refs.purchaseInvoice(id), {
        lines: inv.lines,
        creditedMinor: toStorable(credited),
        status: left === 0n ? 'paid' : 'open',
      });
      payableCredit += credit;
    }
    if (payableCredit > 0n) {
      tx.update(refs.supplier(input.supplierId), {
        balanceMinor: toStorable(fromStorable(supplier.balanceMinor) - payableCredit),
      });
    }
    const doc: SupplierReturnDoc = {
      number: series.number,
      supplierId: input.supplierId,
      supplierName: supplier.name,
      locationId: input.locationId,
      branchId: location.branchId,
      postingDate: input.postingDate,
      reason: input.reason,
      lines,
      costMinor: toStorable(costTotal),
      creditMinor: toStorable(creditTotal),
      journalId,
      postedAt: now,
      postedBy: caller.uid,
    };
    tx.set(ref, doc);
    return {
      result: { returnId: ref.id, number: series.number, journalId },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'supplierReturn',
        entityId: ref.id,
        after: {
          number: series.number,
          supplierId: input.supplierId,
          cost: costTotal.toString(),
          credit: creditTotal.toString(),
        },
        reason: input.reason,
      },
    };
  },
});
