import {
  branchAllowed,
  businessDate,
  defaultIncreaseCost,
  fromStorable,
  parseMoney,
  parseQuantity,
  parseUnitCost,
  toStorable,
  valueAt,
  type JournalLine,
  type StockBalance,
  type UnitCode,
} from '@bms/domain';
import type { Timestamp, Transaction } from 'firebase-admin/firestore';
import { defineCommand } from '../lib/command.js';
import { conflict, denied, failedPrecondition, invalid, notFound } from '../lib/errors.js';
import {
  companyRefs,
  productType,
  type CategoryDoc,
  type CompanyDoc,
  type LocationDoc,
  type NumberSeriesDoc,
  type ProductDoc,
  type StockAdjustmentDoc,
  type StockAdjustmentLineDoc,
  type StockBalanceDoc,
} from '../lib/model.js';
import { readSystemAccounts } from '../lib/documents.js';
import { preparePosting, writePosting } from '../lib/posting.js';
import { StockBook, inventoryError } from '../lib/stock.js';

// --- Locations -------------------------------------------------------------------------------

/** Every branch gets a store and a quarantine location for damaged or returned goods. */
export function seedLocations(
  tx: Transaction,
  companyId: string,
  branchId: string,
  meta: { now: Timestamp; uid: string },
): void {
  const refs = companyRefs(companyId);
  const base = { branchId, status: 'active' as const, updatedAt: meta.now, updatedBy: meta.uid };
  tx.set(refs.location(`${branchId}-store`), {
    ...base,
    name: 'Store',
    type: 'store',
  } satisfies LocationDoc);
  tx.set(refs.location(`${branchId}-quarantine`), {
    ...base,
    name: 'Quarantine',
    type: 'quarantine',
  } satisfies LocationDoc);
}

export const createLocation = defineCommand({
  name: 'location.create',
  access: { kind: 'company', permission: 'company.branches.manage' },
  async handler({ tx, caller, input, now }) {
    const refs = companyRefs(input.companyId);
    const branch = await tx.get(refs.branch(input.branchId));
    if (!branch.exists) throw notFound('branch_not_found', 'Branch not found');
    const ref = refs.locations.doc();
    const doc: LocationDoc = {
      branchId: input.branchId,
      name: input.name,
      type: input.type,
      status: 'active',
      updatedAt: now,
      updatedBy: caller.uid,
    };
    tx.set(ref, doc);
    return {
      result: { locationId: ref.id },
      audit: {
        target: { scope: 'company', companyId: input.companyId },
        entityType: 'location',
        entityId: ref.id,
        after: { branchId: doc.branchId, name: doc.name, type: doc.type },
      },
    };
  },
});

export const updateLocation = defineCommand({
  name: 'location.update',
  access: { kind: 'company', permission: 'company.branches.manage' },
  async handler({ tx, caller, input, now }) {
    const refs = companyRefs(input.companyId);
    const location = (await tx.get(refs.location(input.locationId))).data() as
      LocationDoc | undefined;
    if (!location) throw notFound('location_not_found', 'Location not found');
    if (input.status === 'inactive') {
      const stocked = await tx.get(
        refs.stockBalances
          .where('locationId', '==', input.locationId)
          .where('qtyMilli', '>', 0)
          .limit(1),
      );
      if (!stocked.empty) {
        throw failedPrecondition('location_has_stock', 'Move or write off the stock here first');
      }
    }
    const patch: Partial<LocationDoc> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.status !== undefined) patch.status = input.status;
    tx.update(refs.location(input.locationId), { ...patch, updatedAt: now, updatedBy: caller.uid });
    return {
      result: { locationId: input.locationId },
      audit: {
        target: { scope: 'company', companyId: input.companyId },
        entityType: 'location',
        entityId: input.locationId,
        before: { name: location.name, status: location.status },
        after: patch,
      },
    };
  },
});

// --- Categories ------------------------------------------------------------------------------

export const createCategory = defineCommand({
  name: 'category.create',
  access: { kind: 'company', permission: 'inventory.products.manage' },
  async handler({ tx, caller, input, now }) {
    const refs = companyRefs(input.companyId);
    const same = await tx.get(refs.categories.where('name', '==', input.name).limit(1));
    if (!same.empty) throw conflict('category_exists', 'A category with this name exists');
    const ref = refs.categories.doc();
    tx.set(ref, {
      name: input.name,
      status: 'active',
      updatedAt: now,
      updatedBy: caller.uid,
    } satisfies CategoryDoc);
    return {
      result: { categoryId: ref.id },
      audit: {
        target: { scope: 'company', companyId: input.companyId },
        entityType: 'category',
        entityId: ref.id,
        after: { name: input.name },
      },
    };
  },
});

export const updateCategory = defineCommand({
  name: 'category.update',
  access: { kind: 'company', permission: 'inventory.products.manage' },
  async handler({ tx, caller, input, now }) {
    const refs = companyRefs(input.companyId);
    const category = (await tx.get(refs.category(input.categoryId))).data() as
      CategoryDoc | undefined;
    if (!category) throw notFound('category_not_found', 'Category not found');
    const patch: Partial<CategoryDoc> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.status !== undefined) patch.status = input.status;
    tx.update(refs.category(input.categoryId), { ...patch, updatedAt: now, updatedBy: caller.uid });
    return {
      result: { categoryId: input.categoryId },
      audit: {
        target: { scope: 'company', companyId: input.companyId },
        entityType: 'category',
        entityId: input.categoryId,
        before: { name: category.name, status: category.status },
        after: patch,
      },
    };
  },
});

// --- Products --------------------------------------------------------------------------------

async function checkCategory(tx: Transaction, companyId: string, categoryId: string | null) {
  if (!categoryId) return;
  const category = (await tx.get(companyRefs(companyId).category(categoryId))).data() as
    CategoryDoc | undefined;
  if (!category || category.status !== 'active') {
    throw invalid('category_invalid', 'Choose an active category');
  }
}

function parseOptionalMoney(value: string | null | undefined, currency: string) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  try {
    const minor = parseMoney(value, currency);
    if (minor < 0n) throw invalid('amount_invalid', 'Price cannot be negative');
    return toStorable(minor);
  } catch (e) {
    return inventoryError(e);
  }
}

function parseOptionalQty(value: string | null | undefined, unit: UnitCode) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  try {
    return toStorable(parseQuantity(value, unit));
  } catch (e) {
    return inventoryError(e);
  }
}

export const createProduct = defineCommand({
  name: 'product.create',
  access: { kind: 'company', permission: 'inventory.products.manage' },
  async handler({ tx, caller, input, now }) {
    const refs = companyRefs(input.companyId);
    const company = (await tx.get(refs.company)).data() as CompanyDoc;
    const same = await tx.get(refs.products.where('sku', '==', input.sku).limit(1));
    if (!same.empty) throw conflict('sku_taken', `SKU ${input.sku} is already used`);
    await checkCategory(tx, input.companyId, input.categoryId);
    if (input.type === 'service' && input.reorderLevel !== undefined) {
      throw invalid(
        'not_stocked',
        'A service item is not held in stock, so it has no reorder level',
      );
    }
    const ref = refs.products.doc();
    const doc: ProductDoc = {
      sku: input.sku,
      name: input.name,
      type: input.type,
      unit: input.unit,
      categoryId: input.categoryId,
      description: input.description ?? '',
      salePrice: parseOptionalMoney(input.salePrice, company.baseCurrency) ?? null,
      reorderLevelMilli: parseOptionalQty(input.reorderLevel, input.unit) ?? null,
      status: 'active',
      hasMovements: false,
      createdAt: now,
      createdBy: caller.uid,
      updatedAt: now,
      updatedBy: caller.uid,
    };
    tx.set(ref, doc);
    return {
      result: { productId: ref.id },
      audit: {
        target: { scope: 'company', companyId: input.companyId },
        entityType: 'product',
        entityId: ref.id,
        after: {
          sku: doc.sku,
          name: doc.name,
          type: doc.type,
          unit: doc.unit,
          salePrice: doc.salePrice,
        },
      },
    };
  },
});

export const updateProduct = defineCommand({
  name: 'product.update',
  access: { kind: 'company', permission: 'inventory.products.manage' },
  async handler({ tx, caller, input, now }) {
    const refs = companyRefs(input.companyId);
    const [companySnap, productSnap] = await tx.getAll(refs.company, refs.product(input.productId));
    const product = productSnap!.data() as ProductDoc | undefined;
    if (!product) throw notFound('product_not_found', 'Product not found');
    const company = companySnap!.data() as CompanyDoc;
    if (input.categoryId !== undefined) await checkCategory(tx, input.companyId, input.categoryId);

    const patch: Partial<ProductDoc> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.categoryId !== undefined) patch.categoryId = input.categoryId;
    if (input.description !== undefined) patch.description = input.description;
    if (input.status !== undefined) patch.status = input.status;
    const price = parseOptionalMoney(input.salePrice, company.baseCurrency);
    if (price !== undefined) patch.salePrice = price;
    const reorder = parseOptionalQty(input.reorderLevel, product.unit);
    if (reorder !== undefined && reorder !== null && productType(product) === 'service') {
      throw invalid(
        'not_stocked',
        'A service item is not held in stock, so it has no reorder level',
      );
    }
    if (reorder !== undefined) patch.reorderLevelMilli = reorder;

    tx.update(refs.product(input.productId), { ...patch, updatedAt: now, updatedBy: caller.uid });
    const before = Object.fromEntries(
      Object.keys(patch).map((k) => [k, product[k as keyof ProductDoc]]),
    );
    return {
      result: { productId: input.productId },
      audit: {
        target: { scope: 'company', companyId: input.companyId },
        entityType: 'product',
        entityId: input.productId,
        before,
        after: patch,
      },
    };
  },
});

// --- Stock adjustments, counts and opening stock ---------------------------------------------

const SERIES = {
  adjustment: { id: 'stock.adjustment', prefix: 'ADJ' },
  count: { id: 'stock.count', prefix: 'CNT' },
  opening: { id: 'stock.opening', prefix: 'OST' },
} as const;

const CREATE_PERMISSION = {
  adjustment: 'inventory.adjustment.create',
  count: 'inventory.count.create',
  opening: 'inventory.adjustment.create',
} as const;

const APPROVE_PERMISSION = {
  adjustment: 'inventory.adjustment.approve',
  count: 'inventory.count.approve',
  opening: 'inventory.adjustment.approve',
} as const;

const balanceOf = (doc: StockBalanceDoc | undefined): StockBalance => ({
  qtyMilli: doc ? fromStorable(doc.qtyMilli) : 0n,
  valueMinor: doc ? fromStorable(doc.valueMinor) : 0n,
});

export const createStockAdjustment = defineCommand({
  name: 'stockAdjustment.create',
  access: { kind: 'company', permission: (input) => CREATE_PERMISSION[input.kind] },
  async handler({ tx, caller, input, now, company }) {
    const refs = companyRefs(input.companyId);
    const productIds = [...new Set(input.lines.map((l) => l.productId))];
    if (productIds.length !== input.lines.length) {
      throw invalid('duplicate_product', 'Each product can appear only once');
    }
    const series = SERIES[input.kind];
    const [companySnap, locationSnap, seriesSnap, ...rest] = await tx.getAll(
      refs.company,
      refs.location(input.locationId),
      refs.numberSeries(series.id),
      ...productIds.map((id) => refs.product(id)),
      ...productIds.map((id) => refs.stockBalance(id, input.locationId)),
    );
    const currency = (companySnap!.data() as CompanyDoc).baseCurrency;
    const location = locationSnap!.data() as LocationDoc | undefined;
    if (!location || location.status !== 'active') {
      throw failedPrecondition('location_inactive', 'Choose an active location');
    }
    if (!branchAllowed(company!.member.branchScope, location.branchId)) {
      throw denied('branch_not_allowed', 'You cannot change stock at this branch');
    }
    const products = rest.slice(0, productIds.length);
    const balances = rest.slice(productIds.length);

    const lines: StockAdjustmentLineDoc[] = input.lines.map((l, i) => {
      const lineNo = i + 1;
      const product = products[i]!.data() as ProductDoc | undefined;
      if (!product || product.status !== 'active') {
        throw failedPrecondition('product_inactive', `Line ${lineNo}: choose an active product`);
      }
      if (productType(product) === 'service') {
        throw failedPrecondition(
          'not_stocked',
          `Line ${lineNo}: ${product.sku} is a service item and is not held in stock`,
        );
      }
      const balance = balanceOf(balances[i]!.data() as StockBalanceDoc | undefined);
      let entered: bigint;
      let cost: bigint | null = null;
      try {
        entered = parseQuantity(l.quantity, product.unit, input.kind === 'adjustment');
        if (l.unitCost !== undefined) cost = parseUnitCost(l.unitCost, currency);
      } catch (e) {
        return inventoryError(e, lineNo);
      }
      let expected: bigint | null = null;
      let delta: bigint;
      if (input.kind === 'count') {
        expected = balance.qtyMilli;
        delta = entered - expected;
      } else if (input.kind === 'opening') {
        if (entered <= 0n)
          throw invalid('invalid_quantity', `Line ${lineNo}: enter a quantity above zero`, {
            lineNo,
          });
        if (cost === null)
          throw invalid('cost_required', `Line ${lineNo}: opening stock needs a unit cost`, {
            lineNo,
          });
        delta = entered;
      } else {
        if (entered === 0n)
          throw invalid('invalid_quantity', `Line ${lineNo}: the change cannot be zero`, {
            lineNo,
          });
        delta = entered;
      }
      return {
        lineNo,
        productId: l.productId,
        sku: product.sku,
        productName: product.name,
        unit: product.unit,
        enteredMilli: toStorable(entered),
        expectedMilli: expected === null ? null : toStorable(expected),
        deltaMilli: toStorable(delta),
        unitCostScaled: cost === null ? null : toStorable(cost),
        valueMinor: null,
      };
    });

    const seriesDoc = seriesSnap!.data() as NumberSeriesDoc | undefined;
    const next = seriesDoc?.next ?? 1;
    const number = `${series.prefix}-${String(next).padStart(6, '0')}`;
    if (seriesDoc) tx.update(refs.numberSeries(series.id), { next: next + 1 });
    else tx.set(refs.numberSeries(series.id), { prefix: series.prefix, next: next + 1 });

    const ref = refs.stockAdjustments.doc();
    const doc: StockAdjustmentDoc = {
      number,
      kind: input.kind,
      locationId: input.locationId,
      branchId: location.branchId,
      reason: input.reason,
      lines,
      status: 'pending',
      createdAt: now,
      createdBy: caller.uid,
      decidedAt: null,
      decidedBy: null,
      decisionReason: null,
      postingDate: null,
      journalId: null,
      valueMinor: null,
    };
    tx.set(ref, doc);
    return {
      result: { adjustmentId: ref.id, number },
      audit: {
        target: { scope: 'company', companyId: input.companyId },
        entityType: 'stockAdjustment',
        entityId: ref.id,
        after: { number, kind: doc.kind, locationId: doc.locationId, lines: lines.length },
        reason: input.reason,
      },
    };
  },
});

export const decideStockAdjustment = defineCommand({
  name: 'stockAdjustment.decide',
  access: { kind: 'company', permission: 'inventory.products.read' },
  async handler({ tx, caller, input, now, company }) {
    const refs = companyRefs(input.companyId);
    const adjRef = refs.stockAdjustment(input.adjustmentId);
    const adj = (await tx.get(adjRef)).data() as StockAdjustmentDoc | undefined;
    if (!adj) throw notFound('adjustment_not_found', 'Stock adjustment not found');
    if (!company!.permissions.has(APPROVE_PERMISSION[adj.kind])) throw denied('missing_permission');
    if (adj.status !== 'pending') {
      throw failedPrecondition(
        'adjustment_not_pending',
        'This adjustment has already been decided',
      );
    }
    if (adj.createdBy === caller.uid) {
      throw denied('self_approval', 'You cannot approve or reject your own adjustment');
    }
    if (!branchAllowed(company!.member.branchScope, adj.branchId)) {
      throw denied('branch_not_allowed', 'You cannot change stock at this branch');
    }

    const audit = {
      target: { scope: 'company' as const, companyId: input.companyId },
      entityType: 'stockAdjustment',
      entityId: input.adjustmentId,
      before: { status: 'pending' },
      reason: input.reason,
    };

    if (input.decision === 'rejected') {
      tx.update(adjRef, {
        status: 'rejected',
        decidedAt: now,
        decidedBy: caller.uid,
        decisionReason: input.reason,
      });
      return {
        result: {
          adjustmentId: input.adjustmentId,
          status: 'rejected',
          journalId: null as string | null,
          value: '0',
        },
        audit: { ...audit, after: { status: 'rejected' } },
      };
    }

    // --- Reads ----------------------------------------------------------------------------
    const productIds = adj.lines.map((l) => l.productId);
    const [companySnap, locationSnap, ...productSnaps] = await tx.getAll(
      refs.company,
      refs.location(adj.locationId),
      ...productIds.map((id) => refs.product(id)),
    );
    const companyDoc = companySnap!.data() as CompanyDoc;
    const location = locationSnap!.data() as LocationDoc | undefined;
    if (!location || location.status !== 'active') {
      throw failedPrecondition('location_inactive', 'The location is no longer active');
    }
    const products = productSnaps.map((s) => s.data() as ProductDoc | undefined);
    const book = await StockBook.read(
      tx,
      input.companyId,
      companyDoc.costingMethod === 'fifo',
      productIds.map((productId) => ({
        productId,
        locationId: adj.locationId,
        branchId: adj.branchId,
      })),
    );
    const counterSubtype = adj.kind === 'opening' ? 'openingBalanceEquity' : 'inventoryAdjustment';
    const accounts = await readSystemAccounts(
      tx,
      input.companyId,
      ['inventory', counterSubtype],
      ['inventory'],
    );
    const inventoryAccountId = accounts.inventory;
    const counterAccountId = accounts[counterSubtype];

    // --- Plan -----------------------------------------------------------------------------
    const postingDate = businessDate(now.toDate(), companyDoc.timeZone);
    const valueByLine = new Map<number, bigint>();
    adj.lines.forEach((line, i) => {
      const lineNo = line.lineNo;
      const product = products[i];
      if (!product || product.status !== 'active') {
        throw failedPrecondition(
          'product_inactive',
          `Line ${lineNo}: the product is no longer active`,
        );
      }
      if (adj.kind === 'opening' && book.hasRecord(line.productId, adj.locationId)) {
        throw failedPrecondition(
          'opening_after_movements',
          `Line ${lineNo}: ${product.sku} already has stock movements at this location`,
        );
      }
      const delta = fromStorable(line.deltaMilli);
      if (delta === 0n) return;
      try {
        if (delta > 0n) {
          const before = book.balance(line.productId, adj.locationId);
          const cost =
            line.unitCostScaled !== null
              ? fromStorable(line.unitCostScaled)
              : defaultIncreaseCost(before);
          const value = valueAt(delta, cost);
          book.receive(line.productId, adj.locationId, delta, value, adj.kind, {
            id: input.adjustmentId,
            lineNo: null,
            date: postingDate,
          });
          valueByLine.set(lineNo, value);
        } else {
          const value = book.issue(line.productId, adj.locationId, -delta, adj.kind);
          valueByLine.set(lineNo, -value);
        }
      } catch (e) {
        inventoryError(e, lineNo);
      }
    });

    const values = [...valueByLine.values()];
    const increase = values.filter((v) => v > 0n).reduce((s, v) => s + v, 0n);
    const decrease = values.filter((v) => v < 0n).reduce((s, v) => s - v, 0n);
    const journalLines: JournalLine[] = [];
    if (increase > 0n) {
      journalLines.push(
        { accountId: inventoryAccountId, debit: increase, credit: 0n, memo: 'Stock added' },
        { accountId: counterAccountId, debit: 0n, credit: increase, memo: 'Stock added' },
      );
    }
    if (decrease > 0n) {
      journalLines.push(
        { accountId: counterAccountId, debit: decrease, credit: 0n, memo: 'Stock removed' },
        { accountId: inventoryAccountId, debit: 0n, credit: decrease, memo: 'Stock removed' },
      );
    }

    const prepared = journalLines.length
      ? await preparePosting(
          tx,
          { company: company!, caller, now },
          {
            origin: 'system',
            branchId: adj.branchId,
            postingDate,
            memo: `${adj.number}: ${adj.reason}`,
            reference: adj.number,
            lines: journalLines,
            source: { type: 'stockAdjustment', id: input.adjustmentId, number: adj.number },
          },
        )
      : null;

    // --- Writes ---------------------------------------------------------------------------
    const journalId = prepared
      ? writePosting(tx, { companyId: input.companyId, caller, now }, prepared).journalId
      : null;
    const moved = book.write(tx, {
      postingDate,
      sourceType: 'stockAdjustment',
      sourceId: input.adjustmentId,
      sourceNumber: adj.number,
      journalId,
      now,
      uid: caller.uid,
    });
    adj.lines.forEach((line, i) => {
      if (moved.has(line.productId) && !products[i]!.hasMovements) {
        products[i]!.hasMovements = true;
        tx.update(refs.product(line.productId), { hasMovements: true });
      }
    });
    if (book.hasMovements && !companyDoc.locks.costingMethod) {
      tx.update(refs.company, { 'locks.costingMethod': true });
    }

    const net = increase - decrease;
    tx.update(adjRef, {
      status: 'posted',
      decidedAt: now,
      decidedBy: caller.uid,
      decisionReason: input.reason,
      postingDate,
      journalId,
      valueMinor: toStorable(net),
      lines: adj.lines.map((l) => ({
        ...l,
        valueMinor: toStorable(valueByLine.get(l.lineNo) ?? 0n),
      })),
    });

    return {
      result: {
        adjustmentId: input.adjustmentId,
        status: 'posted',
        journalId,
        value: net.toString(),
      },
      audit: {
        ...audit,
        after: { status: 'posted', journalId, value: net.toString(), postingDate },
      },
    };
  },
});
