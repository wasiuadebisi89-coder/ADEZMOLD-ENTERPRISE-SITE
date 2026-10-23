/**
 * The stock engine shared by every command that moves stock (ACCOUNTING_POLICIES.md §4).
 * `StockBook.read` loads balances and, for FIFO, open cost layers; the plan methods change them
 * in memory and record movements; `write` stores everything. Reads all happen before writes, as
 * Firestore transactions require.
 */
import type { Timestamp, Transaction } from 'firebase-admin/firestore';
import {
  InventoryError,
  MoneyError,
  fromStorable,
  issueFifo,
  issueWeightedAverage,
  receive,
  toStorable,
  type CostLayer,
  type StockBalance,
} from '@bms/domain';
import { CommandError } from './errors.js';
import {
  companyRefs,
  type CostLayerDoc,
  type StockAvailabilityDoc,
  type StockBalanceDoc,
  type StockMovementType,
  type StockSourceType,
} from './model.js';

export function inventoryError(e: unknown, lineNo?: number): never {
  if (e instanceof InventoryError || e instanceof MoneyError) {
    const code = e instanceof InventoryError ? e.code : 'invalid_amount';
    const message = lineNo ? `Line ${lineNo}: ${e.message}` : e.message;
    throw new CommandError(
      code === 'insufficient_stock' || code === 'cost_required' || code === 'corrupt_balance'
        ? 'failed-precondition'
        : 'invalid-argument',
      code,
      message,
      lineNo ? { lineNo } : undefined,
    );
  }
  throw e;
}

interface Layer extends CostLayer {
  /** null for a layer created in this transaction */
  docId: string | null;
  seq: number;
  sourceId: string;
  sourceLineNo: number | null;
  qtyReceived: bigint;
  receivedDate: string;
  changed: boolean;
}

interface Slot {
  productId: string;
  locationId: string;
  branchId: string;
  existing: StockBalanceDoc | undefined;
  balance: StockBalance;
  layers: Layer[];
  nextSeq: number;
  touched: boolean;
}

interface PlannedMovement {
  productId: string;
  locationId: string;
  branchId: string;
  qtyMilli: bigint;
  valueMinor: bigint;
  movementType: StockMovementType;
  balanceAfter: StockBalance;
}

const key = (productId: string, locationId: string) => `${productId}__${locationId}`;

export class StockBook {
  private readonly movements: PlannedMovement[] = [];

  private constructor(
    private readonly companyId: string,
    readonly fifo: boolean,
    private readonly slots: Map<string, Slot>,
  ) {}

  /** Loads every product/location pair the command will touch. */
  static async read(
    tx: Transaction,
    companyId: string,
    fifo: boolean,
    pairs: readonly { productId: string; locationId: string; branchId: string }[],
  ): Promise<StockBook> {
    const refs = companyRefs(companyId);
    const unique = [...new Map(pairs.map((p) => [key(p.productId, p.locationId), p])).values()];
    const snaps = unique.length
      ? await tx.getAll(...unique.map((p) => refs.stockBalance(p.productId, p.locationId)))
      : [];
    const layerSnaps = fifo
      ? await Promise.all(
          unique.map((p) =>
            tx.get(
              refs.costLayers
                .where('productId', '==', p.productId)
                .where('locationId', '==', p.locationId)
                .where('open', '==', true)
                .orderBy('seq'),
            ),
          ),
        )
      : [];
    const slots = new Map<string, Slot>();
    unique.forEach((p, i) => {
      const existing = snaps[i]!.data() as StockBalanceDoc | undefined;
      slots.set(key(p.productId, p.locationId), {
        ...p,
        existing,
        balance: existing
          ? {
              qtyMilli: fromStorable(existing.qtyMilli),
              valueMinor: fromStorable(existing.valueMinor),
            }
          : { qtyMilli: 0n, valueMinor: 0n },
        layers: fifo
          ? layerSnaps[i]!.docs.map((d) => {
              const l = d.data() as CostLayerDoc;
              return {
                id: d.id,
                docId: d.id,
                seq: l.seq,
                sourceId: l.sourceId,
                sourceLineNo: l.sourceLineNo ?? null,
                qtyReceived: fromStorable(l.qtyReceived),
                qtyRemaining: fromStorable(l.qtyRemaining),
                valueRemaining: fromStorable(l.valueRemaining),
                receivedDate: l.receivedDate,
                changed: false,
              };
            })
          : [],
        nextSeq: existing?.nextLayerSeq ?? 1,
        touched: false,
      });
    });
    return new StockBook(companyId, fifo, slots);
  }

  private slot(productId: string, locationId: string): Slot {
    const s = this.slots.get(key(productId, locationId));
    if (!s) throw new Error(`Stock for ${productId} at ${locationId} was not read`);
    return s;
  }

  /** True when the pair has ever had stock recorded. */
  hasRecord(productId: string, locationId: string): boolean {
    return this.slot(productId, locationId).existing !== undefined;
  }

  balance(productId: string, locationId: string): StockBalance {
    return this.slot(productId, locationId).balance;
  }

  get hasMovements(): boolean {
    return this.movements.length > 0;
  }

  /** Adds stock. For FIFO it opens a layer tagged with its source line. */
  receive(
    productId: string,
    locationId: string,
    qtyMilli: bigint,
    valueMinor: bigint,
    movementType: StockMovementType,
    source: { id: string; lineNo: number | null; date: string },
  ): void {
    const s = this.slot(productId, locationId);
    s.balance = receive(s.balance, { qtyMilli, valueMinor });
    if (this.fifo) {
      s.layers.push({
        id: '',
        docId: null,
        seq: s.nextSeq++,
        sourceId: source.id,
        sourceLineNo: source.lineNo,
        qtyReceived: qtyMilli,
        qtyRemaining: qtyMilli,
        valueRemaining: valueMinor,
        receivedDate: source.date,
        changed: true,
      });
    }
    this.record(s, qtyMilli, valueMinor, movementType);
  }

  /** Removes stock at the costing method and returns the value taken out. */
  issue(
    productId: string,
    locationId: string,
    qtyMilli: bigint,
    movementType: StockMovementType,
  ): bigint {
    const s = this.slot(productId, locationId);
    if (this.fifo) {
      const result = issueFifo(s.balance, s.layers, qtyMilli);
      result.layers!.forEach((l, i) => {
        const layer = s.layers[i]!;
        if (l.qtyRemaining !== layer.qtyRemaining || l.valueRemaining !== layer.valueRemaining) {
          layer.qtyRemaining = l.qtyRemaining;
          layer.valueRemaining = l.valueRemaining;
          layer.changed = true;
        }
      });
      s.balance = result.balance;
      this.record(s, -qtyMilli, -result.valueMinor, movementType);
      return result.valueMinor;
    }
    const result = issueWeightedAverage(s.balance, qtyMilli);
    s.balance = result.balance;
    this.record(s, -qtyMilli, -result.valueMinor, movementType);
    return result.valueMinor;
  }

  /**
   * What is still on hand from a given receipt line, for valuing a price difference or charge.
   * FIFO knows exactly (the line's layer); weighted average can only say "up to what is here".
   */
  onHandFrom(
    productId: string,
    locationId: string,
    source: { id: string; lineNo: number },
  ): { qtyMilli: bigint; valueMinor: bigint } {
    const s = this.slot(productId, locationId);
    if (!this.fifo) return s.balance;
    const layer = s.layers.find(
      (l) => l.sourceId === source.id && l.sourceLineNo === source.lineNo && l.qtyRemaining > 0n,
    );
    return layer
      ? { qtyMilli: layer.qtyRemaining, valueMinor: layer.valueRemaining }
      : { qtyMilli: 0n, valueMinor: 0n };
  }

  /** Changes stock value without changing quantity (price differences, landed costs). */
  revalue(
    productId: string,
    locationId: string,
    deltaMinor: bigint,
    source: { id: string; lineNo: number },
  ): void {
    if (deltaMinor === 0n) return;
    const s = this.slot(productId, locationId);
    if (this.fifo) {
      const layer = s.layers.find(
        (l) => l.sourceId === source.id && l.sourceLineNo === source.lineNo && l.qtyRemaining > 0n,
      );
      if (!layer || layer.valueRemaining + deltaMinor < 0n) {
        throw new InventoryError('corrupt_balance', 'Cannot revalue stock that is not on hand');
      }
      layer.valueRemaining += deltaMinor;
      layer.changed = true;
    }
    const value = s.balance.valueMinor + deltaMinor;
    if (s.balance.qtyMilli === 0n || value < 0n) {
      throw new InventoryError('corrupt_balance', 'Cannot revalue stock that is not on hand');
    }
    s.balance = { qtyMilli: s.balance.qtyMilli, valueMinor: value };
    this.record(s, 0n, deltaMinor, 'cost_adjustment');
  }

  private record(s: Slot, qtyMilli: bigint, valueMinor: bigint, movementType: StockMovementType) {
    s.touched = true;
    this.movements.push({
      productId: s.productId,
      locationId: s.locationId,
      branchId: s.branchId,
      qtyMilli,
      valueMinor,
      movementType,
      balanceAfter: s.balance,
    });
  }

  /** Writes balances, layers and movements. Returns the product ids that moved. */
  write(
    tx: Transaction,
    meta: {
      postingDate: string;
      sourceType: StockSourceType;
      sourceId: string;
      sourceNumber: string;
      journalId: string | null;
      now: Timestamp;
      uid: string;
    },
  ): Set<string> {
    const refs = companyRefs(this.companyId);
    const moved = new Set<string>();
    for (const s of this.slots.values()) {
      if (!s.touched) continue;
      moved.add(s.productId);
      for (const layer of s.layers) {
        if (!layer.changed) continue;
        const fields = {
          qtyRemaining: toStorable(layer.qtyRemaining),
          valueRemaining: toStorable(layer.valueRemaining),
          open: layer.qtyRemaining > 0n,
        };
        if (layer.docId) {
          tx.update(refs.costLayers.doc(layer.docId), fields);
        } else {
          tx.set(refs.costLayers.doc(), {
            productId: s.productId,
            locationId: s.locationId,
            seq: layer.seq,
            qtyReceived: toStorable(layer.qtyReceived),
            receivedDate: layer.receivedDate,
            sourceId: layer.sourceId,
            sourceLineNo: layer.sourceLineNo,
            ...fields,
          } satisfies CostLayerDoc);
        }
      }
      tx.set(refs.stockBalance(s.productId, s.locationId), {
        productId: s.productId,
        locationId: s.locationId,
        branchId: s.branchId,
        qtyMilli: toStorable(s.balance.qtyMilli),
        valueMinor: toStorable(s.balance.valueMinor),
        nextLayerSeq: s.nextSeq,
        updatedAt: meta.now,
      } satisfies StockBalanceDoc);
      tx.set(refs.stockAvailability(s.productId, s.locationId), {
        productId: s.productId,
        locationId: s.locationId,
        branchId: s.branchId,
        qtyMilli: toStorable(s.balance.qtyMilli),
        updatedAt: meta.now,
      } satisfies StockAvailabilityDoc);
    }
    for (const m of this.movements) {
      tx.set(refs.stockMovements.doc(), {
        productId: m.productId,
        locationId: m.locationId,
        branchId: m.branchId,
        qtyMilli: toStorable(m.qtyMilli),
        valueMinor: toStorable(m.valueMinor),
        movementType: m.movementType,
        postingDate: meta.postingDate,
        sourceType: meta.sourceType,
        sourceId: meta.sourceId,
        sourceNumber: meta.sourceNumber,
        journalId: meta.journalId,
        balanceQtyMilli: toStorable(m.balanceAfter.qtyMilli),
        balanceValueMinor: toStorable(m.balanceAfter.valueMinor),
        postedAt: meta.now,
        postedBy: meta.uid,
      });
    }
    return moved;
  }
}
