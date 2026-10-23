/**
 * Production (Phase 9, ACCOUNTING_POLICIES.md §16). A bill of materials says what makes a
 * finished product. A production order collects actual cost in the Work in progress account:
 * materials at the costing method when issued and direct costs as they are charged
 * (DECISION 21). Completing it moves that cost into finished goods; normal loss is spread over
 * the good output and abnormal loss is written off (DECISION 22).
 */
import {
  branchAllowed,
  businessDate,
  fromStorable,
  parseQuantity,
  toStorable,
  type JournalLine,
  type UnitCode,
} from '@bms/domain';
import type { Timestamp, Transaction } from 'firebase-admin/firestore';
import { defineCommand, type Caller, type CompanyContext } from '../lib/command.js';
import {
  companyTarget,
  money,
  positiveQuantity,
  readSeries,
  readSystemAccounts,
} from '../lib/documents.js';
import { denied, failedPrecondition, invalid, notFound } from '../lib/errors.js';
import {
  companyRefs,
  productType,
  type AccountDoc,
  type BomDoc,
  type CompanyDoc,
  type LocationDoc,
  type ProductDoc,
  type ProductionComponentDoc,
  type ProductionOrderDoc,
} from '../lib/model.js';
import { preparePosting, writePosting } from '../lib/posting.js';
import { StockBook, inventoryError } from '../lib/stock.js';

const MAX_COSTS = 100;

/** A header quantity (not on a line), above zero. */
function quantityOf(input: string, unit: UnitCode, label: string): bigint {
  let qty: bigint;
  try {
    qty = parseQuantity(input, unit);
  } catch (e) {
    return inventoryError(e);
  }
  if (qty <= 0n) throw invalid('invalid_quantity', `${label}: enter a quantity above zero`);
  return qty;
}

/** a × b ÷ c, rounded half up; all non-negative. */
const mulDiv = (a: bigint, b: bigint, c: bigint) => (a * b * 2n + c) / (2n * c);

function stocked(product: ProductDoc | undefined, label: string): ProductDoc {
  if (!product || product.status !== 'active') {
    throw failedPrecondition('product_inactive', `${label}: choose an active product`);
  }
  if (productType(product) === 'service') {
    throw failedPrecondition(
      'not_stocked',
      `${label}: ${product.sku} is a service item and is not held in stock`,
    );
  }
  return product;
}

function openOrder(order: ProductionOrderDoc | undefined, company: CompanyContext) {
  if (!order) throw notFound('order_not_found', 'Production order not found');
  if (order.status !== 'open') {
    throw failedPrecondition(
      'order_not_open',
      `Production order ${order.number} is ${order.status}`,
    );
  }
  if (!branchAllowed(company.member.branchScope, order.branchId)) {
    throw denied('branch_not_allowed', 'You cannot work on production for this branch');
  }
  return order;
}

/**
 * An account a direct cost may be credited to: postable, active, not a control account and not
 * income or equity.
 */
function costAccount(doc: AccountDoc | undefined) {
  if (!doc || doc.status !== 'active' || !doc.isPostable) {
    throw failedPrecondition('account_inactive', 'Choose an active account that takes postings');
  }
  if (
    doc.isControl ||
    (doc.type !== 'asset' && doc.type !== 'liability' && doc.type !== 'expense')
  ) {
    throw failedPrecondition(
      'account_not_allowed',
      `${doc.code} ${doc.name} cannot be credited with a production cost`,
    );
  }
  return doc;
}

/** Abnormal loss and cancelled orders are written off to an expense account. */
function writeOffAccount(doc: AccountDoc | undefined) {
  if (!doc || doc.status !== 'active' || !doc.isPostable) {
    throw failedPrecondition('account_inactive', 'Choose an active account that takes postings');
  }
  if (doc.type !== 'expense' || doc.isControl) {
    throw failedPrecondition(
      'account_not_allowed',
      `${doc.code} ${doc.name} is not an expense account for writing off production cost`,
    );
  }
  return doc;
}

interface Ctx {
  tx: Transaction;
  caller: Caller;
  now: Timestamp;
  company: CompanyContext;
}

/** Validates the journal (reads only) and returns the function that writes it. */
async function prepareJournal(
  { tx, caller, now, company }: Ctx,
  order: ProductionOrderDoc,
  orderId: string,
  postingDate: string,
  memo: string,
  lines: JournalLine[],
) {
  const prepared = await preparePosting(
    tx,
    { company, caller, now },
    {
      origin: 'system',
      branchId: order.branchId,
      postingDate,
      memo: `${order.number}: ${memo}`,
      reference: order.number,
      lines,
      source: { type: 'productionOrder', id: orderId, number: order.number },
    },
  );
  return () => writePosting(tx, { companyId: company.companyId, caller, now }, prepared).journalId;
}

/** Flags products that moved for the first time, and locks the costing method. */
function markMoved(
  tx: Transaction,
  companyId: string,
  companyDoc: CompanyDoc,
  moved: Set<string>,
  products: Map<string, ProductDoc>,
) {
  const refs = companyRefs(companyId);
  for (const id of moved) {
    const p = products.get(id);
    if (p && !p.hasMovements) {
      p.hasMovements = true;
      tx.update(refs.product(id), { hasMovements: true });
    }
  }
  if (moved.size > 0 && !companyDoc.locks.costingMethod) {
    tx.update(refs.company, { 'locks.costingMethod': true });
  }
}

// --- Bills of materials -----------------------------------------------------------------------

export const createBom = defineCommand({
  name: 'bom.create',
  access: { kind: 'company', permission: 'production.manage' },
  async handler({ tx, caller, input, now }) {
    const refs = companyRefs(input.companyId);
    const ids = input.components.map((c) => c.productId);
    if (new Set(ids).size !== ids.length) {
      throw invalid('duplicate_product', 'Each component can appear only once');
    }
    if (ids.includes(input.productId)) {
      throw invalid('component_is_output', 'A product cannot be a component of itself');
    }
    const [outputSnap, ...componentSnaps] = await tx.getAll(
      refs.product(input.productId),
      ...ids.map((id) => refs.product(id)),
    );
    const output = stocked(outputSnap!.data() as ProductDoc | undefined, 'Finished product');
    const outputQty = quantityOf(input.outputQuantity, output.unit, 'Output');
    const components = input.components.map((c, i) => {
      const lineNo = i + 1;
      const p = stocked(componentSnaps[i]!.data() as ProductDoc | undefined, `Line ${lineNo}`);
      return {
        productId: c.productId,
        sku: p.sku,
        productName: p.name,
        unit: p.unit,
        qtyMilli: toStorable(positiveQuantity(c.quantity, p.unit, lineNo)),
      };
    });
    const ref = refs.boms.doc();
    const doc: BomDoc = {
      productId: input.productId,
      sku: output.sku,
      productName: output.name,
      unit: output.unit,
      name: input.name,
      outputQtyMilli: toStorable(outputQty),
      components,
      status: 'active',
      createdAt: now,
      createdBy: caller.uid,
      updatedAt: now,
      updatedBy: caller.uid,
    };
    tx.set(ref, doc);
    return {
      result: { bomId: ref.id },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'bom',
        entityId: ref.id,
        after: { productId: doc.productId, name: doc.name, components: components.length },
      },
    };
  },
});

export const setBomStatus = defineCommand({
  name: 'bom.setStatus',
  access: { kind: 'company', permission: 'production.manage' },
  async handler({ tx, caller, input, now }) {
    const refs = companyRefs(input.companyId);
    const bom = (await tx.get(refs.bom(input.bomId))).data() as BomDoc | undefined;
    if (!bom) throw notFound('bom_not_found', 'Bill of materials not found');
    tx.update(refs.bom(input.bomId), {
      status: input.status,
      updatedAt: now,
      updatedBy: caller.uid,
    });
    return {
      result: { bomId: input.bomId, status: input.status },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'bom',
        entityId: input.bomId,
        before: { status: bom.status },
        after: { status: input.status },
      },
    };
  },
});

// --- Production orders ------------------------------------------------------------------------

export const createProductionOrder = defineCommand({
  name: 'productionOrder.create',
  access: { kind: 'company', permission: 'production.manage' },
  async handler({ tx, caller, input, now, company }) {
    const refs = companyRefs(input.companyId);
    const [bomSnap, locationSnap] = await tx.getAll(
      refs.bom(input.bomId),
      refs.location(input.locationId),
    );
    const bom = bomSnap!.data() as BomDoc | undefined;
    if (!bom) throw notFound('bom_not_found', 'Bill of materials not found');
    if (bom.status !== 'active') {
      throw failedPrecondition('bom_inactive', 'This bill of materials is no longer used');
    }
    const location = locationSnap!.data() as LocationDoc | undefined;
    if (!location || location.status !== 'active' || location.type !== 'store') {
      throw failedPrecondition('location_inactive', 'Choose an active store location');
    }
    if (!branchAllowed(company!.member.branchScope, location.branchId)) {
      throw denied('branch_not_allowed', 'You cannot work on production for this branch');
    }
    const planned = quantityOf(input.quantity, bom.unit, 'Quantity');
    const output = fromStorable(bom.outputQtyMilli);
    const components: ProductionComponentDoc[] = bom.components.map((c) => ({
      productId: c.productId,
      sku: c.sku,
      productName: c.productName,
      unit: c.unit,
      requiredQtyMilli: toStorable(mulDiv(fromStorable(c.qtyMilli), planned, output)),
      issuedQtyMilli: 0,
      issuedValueMinor: 0,
    }));
    const series = await readSeries(tx, input.companyId, 'productionOrder', 'MO');
    const ref = refs.productionOrders.doc();
    const doc: ProductionOrderDoc = {
      number: series.number,
      bomId: input.bomId,
      productId: bom.productId,
      sku: bom.sku,
      productName: bom.productName,
      unit: bom.unit,
      locationId: input.locationId,
      branchId: location.branchId,
      plannedQtyMilli: toStorable(planned),
      memo: input.memo ?? null,
      components,
      costs: [],
      materialsMinor: 0,
      directCostMinor: 0,
      wipMinor: 0,
      status: 'open',
      goodQtyMilli: null,
      normalLossQtyMilli: null,
      abnormalLossQtyMilli: null,
      finishedCostMinor: null,
      writtenOffMinor: null,
      writeOffAccountId: null,
      closingJournalId: null,
      closedDate: null,
      closeReason: null,
      journalIds: [],
      createdAt: now,
      createdBy: caller.uid,
      closedAt: null,
      closedBy: null,
    };
    series.commit();
    tx.set(ref, doc);
    return {
      result: { orderId: ref.id, number: series.number },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'productionOrder',
        entityId: ref.id,
        after: { number: series.number, bomId: input.bomId, planned: input.quantity },
      },
    };
  },
});

export const moveProductionMaterials = defineCommand({
  name: 'productionOrder.moveMaterials',
  access: { kind: 'company', permission: 'production.manage' },
  async handler({ tx, caller, input, now, company }) {
    const refs = companyRefs(input.companyId);
    const ids = input.lines.map((l) => l.productId);
    if (new Set(ids).size !== ids.length) {
      throw invalid('duplicate_product', 'Each product can appear only once');
    }
    const [orderSnap, companySnap, ...productSnaps] = await tx.getAll(
      refs.productionOrder(input.orderId),
      refs.company,
      ...ids.map((id) => refs.product(id)),
    );
    const order = openOrder(orderSnap!.data() as ProductionOrderDoc | undefined, company!);
    const companyDoc = companySnap!.data() as CompanyDoc;
    const products = new Map(ids.map((id, i) => [id, productSnaps[i]!.data() as ProductDoc]));
    const book = await StockBook.read(
      tx,
      input.companyId,
      companyDoc.costingMethod === 'fifo',
      ids.map((productId) => ({
        productId,
        locationId: order.locationId,
        branchId: order.branchId,
      })),
    );
    const accounts = await readSystemAccounts(
      tx,
      input.companyId,
      ['inventory', 'wip'],
      ['inventory', 'wip'],
    );

    const postingDate = businessDate(now.toDate(), companyDoc.timeZone);
    const issuing = input.direction === 'issue';
    const components = order.components.map((c) => ({ ...c }));
    let total = 0n;
    input.lines.forEach((l, i) => {
      const lineNo = i + 1;
      const component = components.find((c) => c.productId === l.productId);
      if (!component) {
        throw failedPrecondition(
          'not_a_component',
          `Line ${lineNo}: this product is not on the bill of materials for ${order.number}`,
        );
      }
      const product = products.get(l.productId);
      if (!product) throw notFound('product_not_found', `Line ${lineNo}: product not found`);
      const qty = positiveQuantity(l.quantity, product.unit, lineNo);
      const issuedQty = fromStorable(component.issuedQtyMilli);
      const issuedValue = fromStorable(component.issuedValueMinor);
      let value: bigint;
      try {
        if (issuing) {
          if (product.status !== 'active') {
            throw failedPrecondition(
              'product_inactive',
              `Line ${lineNo}: choose an active product`,
            );
          }
          value = book.issue(l.productId, order.locationId, qty, 'production_issue');
          component.issuedQtyMilli = toStorable(issuedQty + qty);
          component.issuedValueMinor = toStorable(issuedValue + value);
        } else {
          if (qty > issuedQty) {
            throw failedPrecondition(
              'return_exceeds_issued',
              `Line ${lineNo}: only what was issued to the order can be returned`,
            );
          }
          // Back at what it cost the order, so the order keeps the cost of what it used.
          value = qty === issuedQty ? issuedValue : mulDiv(issuedValue, qty, issuedQty);
          book.receive(l.productId, order.locationId, qty, value, 'production_return', {
            id: input.orderId,
            lineNo: null,
            date: postingDate,
          });
          component.issuedQtyMilli = toStorable(issuedQty - qty);
          component.issuedValueMinor = toStorable(issuedValue - value);
        }
      } catch (e) {
        return inventoryError(e, lineNo);
      }
      total += value;
    });

    const lines: JournalLine[] =
      total === 0n
        ? []
        : issuing
          ? [
              { accountId: accounts.wip, debit: total, credit: 0n },
              { accountId: accounts.inventory, debit: 0n, credit: total },
            ]
          : [
              { accountId: accounts.inventory, debit: total, credit: 0n },
              { accountId: accounts.wip, debit: 0n, credit: total },
            ];
    const writeJournal = lines.length
      ? await prepareJournal(
          { tx, caller, now, company: company! },
          order,
          input.orderId,
          postingDate,
          issuing ? 'materials issued' : 'unused materials returned',
          lines,
        )
      : null;

    // --- Writes ---------------------------------------------------------------------------
    const journalId = writeJournal ? writeJournal() : null;
    const moved = book.write(tx, {
      postingDate,
      sourceType: 'productionOrder',
      sourceId: input.orderId,
      sourceNumber: order.number,
      journalId,
      now,
      uid: caller.uid,
    });
    markMoved(tx, input.companyId, companyDoc, moved, products);
    const signed = issuing ? total : -total;
    tx.update(refs.productionOrder(input.orderId), {
      components,
      materialsMinor: toStorable(fromStorable(order.materialsMinor) + signed),
      wipMinor: toStorable(fromStorable(order.wipMinor) + signed),
      journalIds: journalId ? [...order.journalIds, journalId] : order.journalIds,
    });
    return {
      result: { orderId: input.orderId, journalId, value: total.toString() },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'productionOrder',
        entityId: input.orderId,
        after: { direction: input.direction, lines: input.lines.length, value: total.toString() },
      },
    };
  },
});

export const addProductionCost = defineCommand({
  name: 'productionOrder.addCost',
  access: { kind: 'company', permission: 'production.cost.post' },
  async handler({ tx, caller, input, now, company }) {
    const refs = companyRefs(input.companyId);
    const [orderSnap, companySnap, accountSnap] = await tx.getAll(
      refs.productionOrder(input.orderId),
      refs.company,
      refs.account(input.accountId),
    );
    const order = openOrder(orderSnap!.data() as ProductionOrderDoc | undefined, company!);
    if (order.costs.length >= MAX_COSTS) {
      throw failedPrecondition('too_many_costs', `An order can carry at most ${MAX_COSTS} costs`);
    }
    const companyDoc = companySnap!.data() as CompanyDoc;
    const account = costAccount(accountSnap!.data() as AccountDoc | undefined);
    const amount = money(input.amount, companyDoc.baseCurrency);
    if (amount <= 0n) throw invalid('amount_zero', 'Enter an amount above zero');
    const accounts = await readSystemAccounts(tx, input.companyId, ['wip'], ['wip']);
    const postingDate = businessDate(now.toDate(), companyDoc.timeZone);
    const writeJournal = await prepareJournal(
      { tx, caller, now, company: company! },
      order,
      input.orderId,
      postingDate,
      input.description,
      [
        { accountId: accounts.wip, debit: amount, credit: 0n, memo: input.description },
        { accountId: input.accountId, debit: 0n, credit: amount, memo: input.description },
      ],
    );

    const journalId = writeJournal();
    tx.update(refs.productionOrder(input.orderId), {
      costs: [
        ...order.costs,
        {
          description: input.description,
          accountId: input.accountId,
          accountCode: account.code,
          accountName: account.name,
          amountMinor: toStorable(amount),
          journalId,
          postingDate,
          postedAt: now,
          postedBy: caller.uid,
        },
      ],
      directCostMinor: toStorable(fromStorable(order.directCostMinor) + amount),
      wipMinor: toStorable(fromStorable(order.wipMinor) + amount),
      journalIds: [...order.journalIds, journalId],
    });
    return {
      result: { orderId: input.orderId, journalId },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'productionOrder',
        entityId: input.orderId,
        after: { cost: amount.toString(), accountId: input.accountId },
      },
    };
  },
});

export const completeProductionOrder = defineCommand({
  name: 'productionOrder.complete',
  access: { kind: 'company', permission: 'production.manage' },
  async handler({ tx, caller, input, now, company }) {
    const refs = companyRefs(input.companyId);
    const [orderSnap, companySnap, writeOffSnap] = await tx.getAll(
      refs.productionOrder(input.orderId),
      refs.company,
      refs.account(input.writeOffAccountId ?? '_'),
    );
    const order = openOrder(orderSnap!.data() as ProductionOrderDoc | undefined, company!);
    const companyDoc = companySnap!.data() as CompanyDoc;
    const productSnap = await tx.get(refs.product(order.productId));
    const product = stocked(productSnap.data() as ProductDoc | undefined, 'Finished product');
    const good = quantityOf(input.goodQuantity, order.unit, 'Good output');
    const lossOf = (v: string | undefined, label: string) => {
      if (v === undefined || Number(v.replaceAll(',', '')) === 0) return 0n;
      return quantityOf(v, order.unit, label);
    };
    const normalLoss = lossOf(input.normalLossQuantity, 'Normal loss');
    const abnormalLoss = lossOf(input.abnormalLossQuantity, 'Abnormal loss');
    const cost = fromStorable(order.wipMinor);
    if (cost <= 0n) {
      throw failedPrecondition('no_cost', 'Issue materials or add costs before completing');
    }
    // Abnormal loss takes its share of the cost per unit; normal loss takes none (DECISION 22).
    const writtenOff = abnormalLoss > 0n ? mulDiv(cost, abnormalLoss, good + abnormalLoss) : 0n;
    if (abnormalLoss > 0n) {
      if (!input.writeOffAccountId) {
        throw invalid('write_off_account_required', 'Choose the account abnormal loss goes to', {
          fields: { writeOffAccountId: 'Required for abnormal loss' },
        });
      }
      writeOffAccount(writeOffSnap!.data() as AccountDoc | undefined);
    }
    const finishedCost = cost - writtenOff;
    const book = await StockBook.read(tx, input.companyId, companyDoc.costingMethod === 'fifo', [
      { productId: order.productId, locationId: order.locationId, branchId: order.branchId },
    ]);
    const accounts = await readSystemAccounts(
      tx,
      input.companyId,
      ['inventory', 'wip'],
      ['inventory', 'wip'],
    );
    const postingDate = businessDate(now.toDate(), companyDoc.timeZone);
    try {
      book.receive(order.productId, order.locationId, good, finishedCost, 'production_output', {
        id: input.orderId,
        lineNo: null,
        date: postingDate,
      });
    } catch (e) {
      inventoryError(e);
    }
    const lines: JournalLine[] = [
      { accountId: accounts.inventory, debit: finishedCost, credit: 0n, memo: 'Finished goods' },
    ];
    if (writtenOff > 0n) {
      lines.push({
        accountId: input.writeOffAccountId!,
        debit: writtenOff,
        credit: 0n,
        memo: 'Abnormal production loss',
      });
    }
    lines.push({ accountId: accounts.wip, debit: 0n, credit: cost });
    const writeJournal = await prepareJournal(
      { tx, caller, now, company: company! },
      order,
      input.orderId,
      postingDate,
      'completed',
      lines,
    );

    // --- Writes ---------------------------------------------------------------------------
    const journalId = writeJournal();
    const moved = book.write(tx, {
      postingDate,
      sourceType: 'productionOrder',
      sourceId: input.orderId,
      sourceNumber: order.number,
      journalId,
      now,
      uid: caller.uid,
    });
    markMoved(tx, input.companyId, companyDoc, moved, new Map([[order.productId, product]]));
    tx.update(refs.productionOrder(input.orderId), {
      status: 'completed',
      goodQtyMilli: toStorable(good),
      normalLossQtyMilli: toStorable(normalLoss),
      abnormalLossQtyMilli: toStorable(abnormalLoss),
      finishedCostMinor: toStorable(finishedCost),
      writtenOffMinor: toStorable(writtenOff),
      writeOffAccountId: writtenOff > 0n ? input.writeOffAccountId! : null,
      wipMinor: 0,
      closingJournalId: journalId,
      closedDate: postingDate,
      closedAt: now,
      closedBy: caller.uid,
      journalIds: [...order.journalIds, journalId],
    });
    return {
      result: {
        orderId: input.orderId,
        journalId,
        finishedCost: finishedCost.toString(),
        writtenOff: writtenOff.toString(),
      },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'productionOrder',
        entityId: input.orderId,
        before: { status: 'open' },
        after: {
          status: 'completed',
          good: input.goodQuantity,
          finishedCost: finishedCost.toString(),
          writtenOff: writtenOff.toString(),
        },
      },
    };
  },
});

export const cancelProductionOrder = defineCommand({
  name: 'productionOrder.cancel',
  access: { kind: 'company', permission: 'production.manage' },
  async handler({ tx, caller, input, now, company }) {
    const refs = companyRefs(input.companyId);
    const [orderSnap, companySnap, writeOffSnap] = await tx.getAll(
      refs.productionOrder(input.orderId),
      refs.company,
      refs.account(input.writeOffAccountId ?? '_'),
    );
    const order = openOrder(orderSnap!.data() as ProductionOrderDoc | undefined, company!);
    const companyDoc = companySnap!.data() as CompanyDoc;
    const cost = fromStorable(order.wipMinor);
    let writeJournal: (() => string) | null = null;
    const postingDate = businessDate(now.toDate(), companyDoc.timeZone);
    if (cost > 0n) {
      if (!input.writeOffAccountId) {
        throw invalid(
          'write_off_account_required',
          'This order still holds cost. Return unused materials, or choose an account to write the cost off to',
          { fields: { writeOffAccountId: 'Required while the order holds cost' } },
        );
      }
      writeOffAccount(writeOffSnap!.data() as AccountDoc | undefined);
      const accounts = await readSystemAccounts(tx, input.companyId, ['wip'], ['wip']);
      writeJournal = await prepareJournal(
        { tx, caller, now, company: company! },
        order,
        input.orderId,
        postingDate,
        `cancelled: ${input.reason}`,
        [
          { accountId: input.writeOffAccountId, debit: cost, credit: 0n },
          { accountId: accounts.wip, debit: 0n, credit: cost },
        ],
      );
    }

    const journalId = writeJournal ? writeJournal() : null;
    tx.update(refs.productionOrder(input.orderId), {
      status: 'cancelled',
      writtenOffMinor: toStorable(cost),
      writeOffAccountId: cost > 0n ? input.writeOffAccountId! : null,
      wipMinor: 0,
      closingJournalId: journalId,
      closedDate: postingDate,
      closeReason: input.reason,
      closedAt: now,
      closedBy: caller.uid,
      journalIds: journalId ? [...order.journalIds, journalId] : order.journalIds,
    });
    return {
      result: { orderId: input.orderId, journalId, writtenOff: cost.toString() },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'productionOrder',
        entityId: input.orderId,
        before: { status: 'open' },
        after: { status: 'cancelled', writtenOff: cost.toString() },
        reason: input.reason,
      },
    };
  },
});
