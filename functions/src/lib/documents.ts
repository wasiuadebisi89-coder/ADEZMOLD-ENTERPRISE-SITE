/**
 * Helpers shared by module documents: number series, accounts looked up by role, parsing typed
 * amounts and quantities, building journals, and allocating payments to open documents.
 */
import type { Timestamp, Transaction } from 'firebase-admin/firestore';
import {
  MoneyError,
  PurchasingError,
  assertAllocations,
  fromStorable,
  parseMoney,
  parseQuantity,
  toStorable,
  type AccountSubtype,
  type JournalLine,
  type UnitCode,
} from '@bms/domain';
import type { Caller, CompanyContext } from './command.js';
import { CommandError, failedPrecondition, invalid } from './errors.js';
import { companyRefs, type AccountDoc, type NumberSeriesDoc, type SettlementDoc } from './model.js';
import { preparePosting, writePosting, type PostingRequest } from './posting.js';
import { inventoryError } from './stock.js';

/** Reads the next number of a document series. Call `commit` once all reads are done. */
export async function readSeries(
  tx: Transaction,
  companyId: string,
  id: string,
  prefix: string,
): Promise<{ number: string; commit: () => void }> {
  const ref = companyRefs(companyId).numberSeries(id);
  const doc = (await tx.get(ref)).data() as NumberSeriesDoc | undefined;
  const next = doc?.next ?? 1;
  return {
    number: `${prefix}-${String(next).padStart(6, '0')}`,
    commit: () => {
      if (doc) tx.update(ref, { next: next + 1 });
      else tx.set(ref, { prefix, next: next + 1 } satisfies NumberSeriesDoc);
    },
  };
}

const ROLE_NAMES: Partial<Record<AccountSubtype, string>> = {
  inventory: 'Inventory',
  wip: 'Work in progress',
  payable: 'Trade payables',
  grni: 'Goods received not invoiced',
  cogs: 'Cost of goods sold',
  inputTax: 'Input tax recoverable',
  supplierAdvance: 'Advances to suppliers',
  purchasePriceVariance: 'Purchase price variance',
  inventoryAdjustment: 'Inventory adjustments',
  openingBalanceEquity: 'Opening balance equity',
  receivable: 'Trade receivables',
  revenue: 'Sales revenue',
  serviceRevenue: 'Service revenue',
  outputTax: 'Output tax payable',
  customerAdvance: 'Customer advances',
};

/**
 * Finds the one active account for each role a posting needs. Control roles (inventory,
 * payables, GRNI) must be control accounts so manual journals cannot touch them.
 */
export async function readSystemAccounts<S extends AccountSubtype>(
  tx: Transaction,
  companyId: string,
  subtypes: readonly S[],
  controlSubtypes: readonly S[] = [],
): Promise<Record<S, string>> {
  const refs = companyRefs(companyId);
  const snaps = await Promise.all(
    subtypes.map((s) =>
      tx.get(refs.accounts.where('subtype', '==', s).where('status', '==', 'active').limit(2)),
    ),
  );
  const result = {} as Record<S, string>;
  subtypes.forEach((s, i) => {
    const snap = snaps[i]!;
    const name = ROLE_NAMES[s] ?? s;
    if (snap.size !== 1) {
      throw failedPrecondition(
        'accounts_missing',
        `The chart needs exactly one active ${name} account`,
      );
    }
    const doc = snap.docs[0]!;
    if (controlSubtypes.includes(s) && !(doc.data() as AccountDoc).isControl) {
      throw failedPrecondition('accounts_missing', `The ${name} account must be a control account`);
    }
    result[s] = doc.id;
  });
  return result;
}

/** Parses a typed amount with the company currency; errors name the line when given. */
export function money(input: string, currency: string, lineNo?: number): bigint {
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

export function positiveQuantity(input: string, unit: UnitCode, lineNo: number): bigint {
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
export function journalFrom(
  entries: readonly { accountId: string; amount: bigint }[],
): JournalLine[] {
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

/** Validates a posting (all reads) and returns the function that writes it. */
export async function post(
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

export const companyTarget = (companyId: string) => ({ scope: 'company' as const, companyId });

/** An invoice that payments settle: purchase or sales. */
export interface Settleable {
  number: string;
  totalMinor: number;
  paidMinor: number;
  creditedMinor: number;
}

export function settleableOutstanding(doc: Settleable): bigint {
  return (
    fromStorable(doc.totalMinor) - fromStorable(doc.paidMinor) - fromStorable(doc.creditedMinor)
  );
}

/** Checks requested allocations against what each invoice still owes and what is available. */
export function planAllocations(
  available: bigint,
  requested: readonly { invoiceId: string; amount: string }[],
  invoices: ReadonlyMap<string, Settleable>,
  currency: string,
) {
  const planned = requested.map((a, i) => ({
    invoiceId: a.invoiceId,
    amountMinor: money(a.amount, currency, i + 1),
    outstandingMinor: settleableOutstanding(invoices.get(a.invoiceId)!),
    label: invoices.get(a.invoiceId)!.number,
  }));
  try {
    return { planned, total: assertAllocations(available, planned) };
  } catch (e) {
    if (e instanceof PurchasingError) {
      throw new CommandError(
        e.code === 'over_allocated' ? 'failed-precondition' : 'invalid-argument',
        e.code,
        e.message,
      );
    }
    throw e;
  }
}

export type PlannedAllocation = ReturnType<typeof planAllocations>['planned'][number];

export type SettlementSource = Pick<
  SettlementDoc,
  'date' | 'sourceType' | 'sourceId' | 'journalId'
>;

/** Records an amount settled against an invoice, for ageing as at a past date. */
export function recordSettlement(
  tx: Transaction,
  companyId: string,
  ctx: { now: Timestamp },
  s: Omit<SettlementDoc, 'at' | 'amountMinor'> & { amount: bigint },
) {
  const { amount, ...rest } = s;
  if (amount === 0n) return;
  tx.set(companyRefs(companyId).settlements.doc(), {
    ...rest,
    amountMinor: toStorable(amount),
    at: ctx.now,
  } satisfies SettlementDoc);
}
