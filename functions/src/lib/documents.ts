/** Helpers shared by module documents: number series and accounts looked up by role. */
import type { Transaction } from 'firebase-admin/firestore';
import type { AccountSubtype } from '@bms/domain';
import { failedPrecondition } from './errors.js';
import { companyRefs, type AccountDoc, type NumberSeriesDoc } from './model.js';

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
  payable: 'Trade payables',
  grni: 'Goods received not invoiced',
  cogs: 'Cost of goods sold',
  inputTax: 'Input tax recoverable',
  supplierAdvance: 'Advances to suppliers',
  purchasePriceVariance: 'Purchase price variance',
  inventoryAdjustment: 'Inventory adjustments',
  openingBalanceEquity: 'Opening balance equity',
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
