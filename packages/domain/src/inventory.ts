/**
 * Perpetual inventory and costing (docs/bms/ACCOUNTING_POLICIES.md §4, §9).
 *
 * - Quantities are integer milli-units of the product's base unit (2.5 kg → 2500n).
 * - Unit costs are minor units × 10⁴ per base unit (₦12.34567 → 123457n).
 * - Values are integer minor units.
 *
 * Every function here is pure; the posting services persist what they return.
 */
import { currencyInfo, divRoundHalfAwayFromZero } from './money.js';

export const QTY_SCALE = 1000n;
export const COST_SCALE = 10_000n;

export type CostingMethod = 'weighted_average' | 'fifo';

export class InventoryError extends Error {
  override name = 'InventoryError';
  constructor(
    public readonly code:
      | 'invalid_quantity'
      | 'invalid_cost'
      | 'insufficient_stock'
      | 'cost_required'
      | 'corrupt_balance',
    message: string,
  ) {
    super(message);
  }
}

/** Base units a product can be counted in. Decimals is how many decimal places it allows (≤3). */
export const UNITS = {
  pcs: { code: 'pcs', name: 'Pieces', decimals: 0 },
  kg: { code: 'kg', name: 'Kilograms', decimals: 3 },
  g: { code: 'g', name: 'Grams', decimals: 0 },
  l: { code: 'l', name: 'Litres', decimals: 3 },
  m: { code: 'm', name: 'Metres', decimals: 3 },
  box: { code: 'box', name: 'Boxes', decimals: 0 },
  pack: { code: 'pack', name: 'Packs', decimals: 0 },
  bag: { code: 'bag', name: 'Bags', decimals: 0 },
  carton: { code: 'carton', name: 'Cartons', decimals: 0 },
  roll: { code: 'roll', name: 'Rolls', decimals: 0 },
  // For service items (Phase 9)
  hr: { code: 'hr', name: 'Hours', decimals: 2 },
  day: { code: 'day', name: 'Days', decimals: 1 },
  job: { code: 'job', name: 'Jobs', decimals: 0 },
} as const;
export type UnitCode = keyof typeof UNITS;
export const UNIT_CODES = Object.keys(UNITS) as [UnitCode, ...UnitCode[]];

/** Parses a quantity such as "2.5" into milli-units, refusing more decimals than the unit allows. */
export function parseQuantity(input: string, unit: UnitCode, allowNegative = false): bigint {
  const { decimals } = UNITS[unit];
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(input.trim().replace(/,/g, ''));
  if (!match) throw new InventoryError('invalid_quantity', `Invalid quantity: "${input}"`);
  const [, sign, whole = '0', frac = ''] = match;
  if (frac.replace(/0+$/, '').length > decimals) {
    throw new InventoryError(
      'invalid_quantity',
      decimals === 0
        ? `Quantity "${input}" must be a whole number of ${UNITS[unit].name.toLowerCase()}`
        : `Quantity "${input}" has more than ${decimals} decimal places`,
    );
  }
  const milli = BigInt(whole) * QTY_SCALE + BigInt((frac + '000').slice(0, 3));
  if (sign && !allowNegative && milli !== 0n) {
    throw new InventoryError('invalid_quantity', 'Quantity cannot be negative');
  }
  return sign ? -milli : milli;
}

export function formatQuantity(milli: bigint | number, unit: UnitCode): string {
  const v = typeof milli === 'number' ? BigInt(milli) : milli;
  const negative = v < 0n;
  const abs = negative ? -v : v;
  const whole = abs / QTY_SCALE;
  const frac = (abs % QTY_SCALE)
    .toString()
    .padStart(3, '0')
    .slice(0, UNITS[unit].decimals || 0);
  const trimmed = frac.replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole.toLocaleString('en')}${trimmed ? '.' + trimmed : ''}`;
}

/**
 * Parses a unit cost such as "1250.5" or "12.345678" into minor units × 10⁴. Allows up to
 * four more decimals than the currency so per-unit costs of cheap items stay exact.
 */
export function parseUnitCost(input: string, currency: string): bigint {
  const { decimals } = currencyInfo(currency);
  const match = /^(\d+)(?:\.(\d+))?$/.exec(input.trim().replace(/,/g, ''));
  if (!match) throw new InventoryError('invalid_cost', `Invalid unit cost: "${input}"`);
  const [, whole = '0', frac = ''] = match;
  const places = decimals + 4;
  if (frac.replace(/0+$/, '').length > places) {
    throw new InventoryError(
      'invalid_cost',
      `Unit cost "${input}" has more than ${places} decimal places`,
    );
  }
  return BigInt(whole + frac.padEnd(places, '0').slice(0, places));
}

/** Value in minor units of `qtyMilli` at `costScaled`, rounded half away from zero. */
export function valueAt(qtyMilli: bigint, costScaled: bigint): bigint {
  return divRoundHalfAwayFromZero(qtyMilli * costScaled, QTY_SCALE * COST_SCALE);
}

/** Average unit cost of a balance, or null when there is no stock. */
export function averageCost(balance: StockBalance): bigint | null {
  if (balance.qtyMilli <= 0n) return null;
  return divRoundHalfAwayFromZero(balance.valueMinor * QTY_SCALE * COST_SCALE, balance.qtyMilli);
}

export interface StockBalance {
  qtyMilli: bigint;
  valueMinor: bigint;
}

export interface CostLayer {
  id: string;
  qtyRemaining: bigint;
  valueRemaining: bigint;
}

export interface Receipt {
  qtyMilli: bigint;
  valueMinor: bigint;
}

export interface Issue {
  /** Value taken out of stock, in minor units (positive). */
  valueMinor: bigint;
  balance: StockBalance;
  /** FIFO only: layers after the issue, in the same order; emptied layers have zero quantity. */
  layers?: CostLayer[];
}

function assertBalance(b: StockBalance): void {
  if (b.qtyMilli < 0n || b.valueMinor < 0n || (b.qtyMilli === 0n && b.valueMinor !== 0n)) {
    throw new InventoryError('corrupt_balance', 'Stock balance is inconsistent');
  }
}

/** Adds stock. Both methods carry quantity and value; FIFO also adds a layer. */
export function receive(balance: StockBalance, receipt: Receipt): StockBalance {
  assertBalance(balance);
  if (receipt.qtyMilli <= 0n || receipt.valueMinor < 0n) {
    throw new InventoryError('invalid_quantity', 'Received quantity must be positive');
  }
  return {
    qtyMilli: balance.qtyMilli + receipt.qtyMilli,
    valueMinor: balance.valueMinor + receipt.valueMinor,
  };
}

function insufficient(balance: StockBalance, qty: bigint): never {
  throw new InventoryError(
    'insufficient_stock',
    `Not enough stock: ${formatMilli(balance.qtyMilli)} on hand, ${formatMilli(qty)} needed`,
  );
}

const formatMilli = (m: bigint) => (Number(m) / 1000).toString();

/**
 * Weighted average issue. The issue is valued at the current average; an issue that empties
 * the balance takes the exact remaining value, so value reaches zero with quantity (§9).
 */
export function issueWeightedAverage(balance: StockBalance, qtyMilli: bigint): Issue {
  assertBalance(balance);
  if (qtyMilli <= 0n)
    throw new InventoryError('invalid_quantity', 'Issued quantity must be positive');
  if (qtyMilli > balance.qtyMilli) insufficient(balance, qtyMilli);
  const valueMinor =
    qtyMilli === balance.qtyMilli
      ? balance.valueMinor
      : divRoundHalfAwayFromZero(balance.valueMinor * qtyMilli, balance.qtyMilli);
  return {
    valueMinor,
    balance: { qtyMilli: balance.qtyMilli - qtyMilli, valueMinor: balance.valueMinor - valueMinor },
  };
}

/**
 * FIFO issue from layers ordered oldest first. A layer emptied completely gives up its exact
 * remaining value; a partly used layer gives a proportional, rounded share.
 */
export function issueFifo(
  balance: StockBalance,
  layers: readonly CostLayer[],
  qtyMilli: bigint,
): Issue {
  assertBalance(balance);
  if (qtyMilli <= 0n)
    throw new InventoryError('invalid_quantity', 'Issued quantity must be positive');
  if (qtyMilli > balance.qtyMilli) insufficient(balance, qtyMilli);
  const layerQty = layers.reduce((s, l) => s + l.qtyRemaining, 0n);
  const layerValue = layers.reduce((s, l) => s + l.valueRemaining, 0n);
  if (layerQty !== balance.qtyMilli || layerValue !== balance.valueMinor) {
    throw new InventoryError('corrupt_balance', 'Cost layers do not match the stock balance');
  }
  let remaining = qtyMilli;
  let valueMinor = 0n;
  const after = layers.map((layer) => {
    if (remaining === 0n || layer.qtyRemaining === 0n) return { ...layer };
    const take = remaining < layer.qtyRemaining ? remaining : layer.qtyRemaining;
    const value =
      take === layer.qtyRemaining
        ? layer.valueRemaining
        : divRoundHalfAwayFromZero(layer.valueRemaining * take, layer.qtyRemaining);
    remaining -= take;
    valueMinor += value;
    return {
      ...layer,
      qtyRemaining: layer.qtyRemaining - take,
      valueRemaining: layer.valueRemaining - value,
    };
  });
  return {
    valueMinor,
    balance: { qtyMilli: balance.qtyMilli - qtyMilli, valueMinor: balance.valueMinor - valueMinor },
    layers: after,
  };
}

/**
 * Cost for stock found or added without a stated cost: the current average cost
 * (ACCOUNTING_POLICIES §4). With no stock on hand a cost must be entered.
 */
export function defaultIncreaseCost(balance: StockBalance): bigint {
  const avg = averageCost(balance);
  if (avg === null) {
    throw new InventoryError(
      'cost_required',
      'Enter a unit cost: there is no stock to take a cost from',
    );
  }
  return avg;
}
