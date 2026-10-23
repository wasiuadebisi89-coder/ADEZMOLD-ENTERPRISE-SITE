/**
 * Fixed assets (ACCOUNTING_POLICIES.md §11): the register, monthly straight-line depreciation
 * and disposal. Every amount the register holds is also posted to the ledger in the same
 * transaction, so the register and the asset accounts move together.
 */
import type { Transaction } from 'firebase-admin/firestore';
import {
  AssetError,
  addMonths,
  assertValidAsset,
  businessDate,
  depreciationDue,
  firstDepreciationMonth,
  fromStorable,
  lastChargedMonth,
  lastDayOfMonth,
  lastMonthBeforeDisposal,
  toDecimalString,
  toStorable,
  type DepreciationState,
} from '@bms/domain';
import { defineCommand } from '../lib/command.js';
import {
  companyTarget,
  journalFrom,
  money,
  post,
  readSeries,
  readSystemAccounts,
} from '../lib/documents.js';
import { failedPrecondition, invalid, notFound } from '../lib/errors.js';
import {
  companyRefs,
  type AccountDoc,
  type CompanyDoc,
  type DepreciationRunDoc,
  type FixedAssetDoc,
} from '../lib/model.js';

/** The most assets one depreciation run charges (one Firestore transaction). */
export const MAX_ASSETS_PER_RUN = 400;

function assetError(e: unknown): never {
  if (e instanceof AssetError) throw invalid(e.code, e.message);
  throw e;
}

type AccountRule = {
  what: string;
  allowed: (a: AccountDoc) => boolean;
  rule: string;
};

const usable = (a: AccountDoc | undefined): a is AccountDoc =>
  !!a && a.status === 'active' && a.isPostable;

function assertAccount(account: AccountDoc | undefined, check: AccountRule): AccountDoc {
  if (!usable(account) || !check.allowed(account)) {
    throw invalid('account_invalid', `${check.what} must be ${check.rule}`);
  }
  return account;
}

const ASSET_ACCOUNT: AccountRule = {
  what: 'The asset account',
  allowed: (a) => a.subtype === 'fixedAsset',
  rule: 'an active fixed asset account',
};
const ACCUMULATED_ACCOUNT: AccountRule = {
  what: 'The accumulated depreciation account',
  allowed: (a) => a.subtype === 'accumDepreciation',
  rule: 'an active accumulated depreciation account',
};
const EXPENSE_ACCOUNT: AccountRule = {
  what: 'The depreciation expense account',
  allowed: (a) => a.subtype === 'depreciation',
  rule: 'an active depreciation expense account',
};
/** What a purchase is paid from or owed on. Control accounts belong to their modules. */
const PAID_FROM: AccountRule = {
  what: 'The account the asset was paid from',
  allowed: (a) =>
    a.subtype === 'cash' ||
    a.subtype === 'bank' ||
    ((a.type === 'liability' || a.type === 'equity') && a.subtype === 'general'),
  rule: 'a cash or bank account, or a general liability or equity account',
};
const PROCEEDS_TO: AccountRule = {
  what: 'The account the proceeds went to',
  allowed: (a) =>
    a.subtype === 'cash' || a.subtype === 'bank' || (a.type === 'asset' && a.subtype === 'general'),
  rule: 'a cash or bank account, or a general asset account',
};
const GAIN_LOSS: AccountRule = {
  what: 'The gain or loss account',
  allowed: (a) => (a.type === 'income' || a.type === 'expense') && a.subtype === 'general',
  rule: 'a general income or expense account',
};

export function stateOf(a: FixedAssetDoc): DepreciationState {
  return {
    costMinor: fromStorable(a.costMinor),
    residualMinor: fromStorable(a.residualMinor),
    lifeMonths: a.usefulLifeMonths,
    baseMonths: a.baseMonths,
    baseAccumulatedMinor: fromStorable(a.baseAccumulatedMinor),
    firstMonth: a.firstMonth,
    chargedMonths: a.chargedMonths,
    accumulatedMinor: fromStorable(a.accumulatedMinor),
  };
}

async function readAccounts(tx: Transaction, companyId: string, ids: readonly string[]) {
  const refs = companyRefs(companyId);
  const snaps = await tx.getAll(...ids.map((id) => refs.account(id)));
  return snaps.map((s) => s.data() as AccountDoc | undefined);
}

export const createFixedAsset = defineCommand({
  name: 'fixedAsset.create',
  access: { kind: 'company', permission: 'assets.manage' },
  async handler({ tx, caller, input, now, company }) {
    const refs = companyRefs(input.companyId);
    const companyDoc = (await tx.get(refs.company)).data() as CompanyDoc;
    const currency = companyDoc.baseCurrency;
    const opening = input.acquisition === 'opening';
    const [assetAccount, accumulated, expense, paidFrom] = await readAccounts(tx, input.companyId, [
      input.assetAccountId,
      input.accumulatedAccountId,
      input.expenseAccountId,
      ...(opening ? [] : [input.creditAccountId]),
    ]);
    const assetAcc = assertAccount(assetAccount, ASSET_ACCOUNT);
    assertAccount(accumulated, ACCUMULATED_ACCOUNT);
    assertAccount(expense, EXPENSE_ACCOUNT);
    if (!opening) assertAccount(paidFrom, PAID_FROM);

    const cost = money(input.cost, currency);
    const residual = money(input.residual, currency);
    const date = opening ? input.asAtDate : input.acquiredDate;
    let firstMonth: string;
    let baseMonths = 0;
    let baseAccumulated = 0n;
    if (opening) {
      if (input.availableForUseDate > input.asAtDate) {
        throw invalid(
          'invalid_asset',
          'An asset brought in at cut-over must have been in use by the as-at date',
        );
      }
      baseMonths = input.monthsDepreciated;
      baseAccumulated = money(input.accumulatedToDate, currency);
      // Charges after cut-over start the month after the as-at date.
      const afterAsAt = addMonths(input.asAtDate.slice(0, 7), 1);
      const fromUse = firstDepreciationMonth(input.availableForUseDate);
      firstMonth = fromUse > afterAsAt ? fromUse : afterAsAt;
    } else {
      if (input.availableForUseDate < input.acquiredDate) {
        throw invalid('invalid_asset', 'An asset cannot be in use before it was acquired');
      }
      firstMonth = firstDepreciationMonth(input.availableForUseDate);
    }
    try {
      assertValidAsset({
        costMinor: cost,
        residualMinor: residual,
        lifeMonths: input.usefulLifeMonths,
        baseMonths,
        baseAccumulatedMinor: baseAccumulated,
        firstMonth,
      });
    } catch (e) {
      assetError(e);
    }

    const system = opening
      ? await readSystemAccounts(tx, input.companyId, ['openingBalanceEquity'] as const)
      : null;
    const series = await readSeries(tx, input.companyId, 'fixedAsset', 'FA');
    const ref = refs.fixedAssets.doc();
    const lines = opening
      ? journalFrom([
          { accountId: input.assetAccountId, amount: cost },
          { accountId: input.accumulatedAccountId, amount: -baseAccumulated },
          { accountId: system!.openingBalanceEquity, amount: -(cost - baseAccumulated) },
        ])
      : journalFrom([
          { accountId: input.assetAccountId, amount: cost },
          { accountId: input.creditAccountId, amount: -cost },
        ]);
    const write = await post(
      tx,
      { company: company!, caller, now },
      {
        origin: 'system',
        branchId: input.branchId,
        postingDate: date,
        memo: `${series.number}: ${opening ? 'brought in' : 'bought'} ${input.name}`,
        reference: input.reference ?? series.number,
        lines,
        backdateApprovalId: input.backdateApprovalId,
        source: { type: 'fixedAsset', id: ref.id, number: series.number },
      },
    );
    series.commit();
    const { journalId } = write();
    const doc: FixedAssetDoc = {
      number: series.number,
      name: input.name,
      branchId: input.branchId,
      assetAccountId: input.assetAccountId,
      assetAccountName: `${assetAcc.code} ${assetAcc.name}`,
      accumulatedAccountId: input.accumulatedAccountId,
      expenseAccountId: input.expenseAccountId,
      costMinor: toStorable(cost),
      residualMinor: toStorable(residual),
      usefulLifeMonths: input.usefulLifeMonths,
      availableForUseDate: input.availableForUseDate,
      firstMonth,
      baseMonths,
      baseAccumulatedMinor: toStorable(baseAccumulated),
      chargedMonths: baseMonths,
      accumulatedMinor: toStorable(baseAccumulated),
      depreciatedThrough: null,
      status: 'active',
      acquisition: {
        kind: input.acquisition,
        date,
        creditAccountId: opening ? null : input.creditAccountId,
        journalId,
      },
      disposal: null,
      reference: input.reference ?? null,
      createdAt: now,
      createdBy: caller.uid,
      updatedAt: now,
    };
    tx.set(ref, doc);
    return {
      result: { assetId: ref.id, number: series.number, journalId },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'fixedAsset',
        entityId: ref.id,
        after: {
          number: series.number,
          acquisition: input.acquisition,
          cost: cost.toString(),
          residual: residual.toString(),
          usefulLifeMonths: input.usefulLifeMonths,
          firstMonth,
          baseMonths,
          baseAccumulated: baseAccumulated.toString(),
        },
      },
    };
  },
});

export const runDepreciation = defineCommand({
  name: 'depreciation.run',
  access: { kind: 'company', permission: 'assets.depreciation.post' },
  async handler({ tx, caller, input, now, company }) {
    const refs = companyRefs(input.companyId);
    const companyDoc = (await tx.get(refs.company)).data() as CompanyDoc;
    const postingDate = lastDayOfMonth(input.month);
    const today = businessDate(now.toDate(), companyDoc.timeZone);
    if (postingDate > today) {
      throw failedPrecondition(
        'month_not_ended',
        `Depreciation for ${input.month} can be run from ${postingDate}`,
      );
    }
    const snap = await tx.get(
      refs.fixedAssets
        .where('branchId', '==', input.branchId)
        .where('status', '==', 'active')
        .limit(MAX_ASSETS_PER_RUN + 1),
    );
    if (snap.size > MAX_ASSETS_PER_RUN) {
      throw failedPrecondition(
        'too_many_assets',
        `A run can charge at most ${MAX_ASSETS_PER_RUN} assets; this branch has more`,
      );
    }
    const due = snap.docs
      .map((d) => {
        const asset = d.data() as FixedAssetDoc;
        const state = stateOf(asset);
        // An asset bought after the month is not charged for it, whatever its use date.
        if (asset.acquisition.date > postingDate) return null;
        const charge = depreciationDue(state, input.month);
        return charge.amountMinor > 0n || charge.months > 0
          ? { id: d.id, asset, state, ...charge }
          : null;
      })
      .filter((x) => x !== null)
      .sort((a, b) => a.asset.number.localeCompare(b.asset.number));
    const total = due.reduce((s, d) => s + d.amountMinor, 0n);
    if (due.length === 0 || total === 0n) {
      throw failedPrecondition(
        'nothing_due',
        `No depreciation is due in this branch up to ${input.month}`,
      );
    }
    const series = await readSeries(tx, input.companyId, 'depreciationRun', 'DR');
    const ref = refs.depreciationRuns.doc();
    const write = await post(
      tx,
      { company: company!, caller, now },
      {
        origin: 'system',
        branchId: input.branchId,
        postingDate,
        memo: `${series.number}: depreciation to ${input.month}`,
        reference: series.number,
        lines: journalFrom(
          due.flatMap((d) => [
            { accountId: d.asset.expenseAccountId, amount: d.amountMinor },
            { accountId: d.asset.accumulatedAccountId, amount: -d.amountMinor },
          ]),
        ),
        backdateApprovalId: input.backdateApprovalId,
        source: { type: 'depreciationRun', id: ref.id, number: series.number },
      },
    );
    series.commit();
    const { journalId, number: journalNumber } = write();
    for (const d of due) {
      const next = { ...d.state, chargedMonths: d.chargedMonths };
      tx.update(refs.fixedAsset(d.id), {
        chargedMonths: d.chargedMonths,
        accumulatedMinor: toStorable(d.state.accumulatedMinor + d.amountMinor),
        depreciatedThrough: lastChargedMonth(next),
        updatedAt: now,
      });
    }
    const doc: DepreciationRunDoc = {
      branchId: input.branchId,
      month: input.month,
      postingDate,
      totalMinor: toStorable(total),
      assets: due.map((d) => ({
        assetId: d.id,
        number: d.asset.number,
        months: d.months,
        amountMinor: toStorable(d.amountMinor),
      })),
      journalId,
      journalNumber,
      postedAt: now,
      postedBy: caller.uid,
    };
    tx.set(ref, doc);
    return {
      result: { runId: ref.id, number: series.number, journalId, assets: due.length },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'depreciationRun',
        entityId: ref.id,
        after: {
          number: series.number,
          branchId: input.branchId,
          month: input.month,
          total: total.toString(),
          assets: due.length,
        },
      },
    };
  },
});

export const disposeFixedAsset = defineCommand({
  name: 'fixedAsset.dispose',
  access: { kind: 'company', permission: 'assets.manage' },
  async handler({ tx, caller, input, now, company }) {
    const refs = companyRefs(input.companyId);
    const [companySnap, assetSnap] = await tx.getAll(refs.company, refs.fixedAsset(input.assetId));
    const currency = (companySnap!.data() as CompanyDoc).baseCurrency;
    const asset = assetSnap!.data() as FixedAssetDoc | undefined;
    if (!asset) throw notFound('asset_not_found', 'Asset not found');
    if (asset.status !== 'active') {
      throw failedPrecondition('asset_disposed', `${asset.number} has already been disposed of`);
    }
    if (input.disposalDate < asset.acquisition.date) {
      throw invalid('invalid_date', 'An asset cannot be disposed of before it was acquired');
    }
    const proceeds = money(input.proceeds, currency);
    if (proceeds > 0n && !input.proceedsAccountId) {
      throw invalid('account_invalid', 'Choose the account the proceeds went to');
    }
    const [gainLoss, proceedsTo] = await readAccounts(tx, input.companyId, [
      input.gainLossAccountId,
      ...(proceeds > 0n ? [input.proceedsAccountId!] : []),
    ]);
    assertAccount(gainLoss, GAIN_LOSS);
    if (proceeds > 0n) assertAccount(proceedsTo, PROCEEDS_TO);

    // Catch up depreciation to the disposal (DECISION 10 applied to the last month).
    const state = stateOf(asset);
    const throughMonth = lastMonthBeforeDisposal(input.disposalDate);
    const charged = lastChargedMonth(state);
    if (charged && charged > throughMonth) {
      throw failedPrecondition(
        'depreciated_past_disposal',
        `${asset.number} has been depreciated through ${charged}; a disposal on this date would need that reversed`,
      );
    }
    const catchUp = depreciationDue(state, throughMonth);
    const accumulated = state.accumulatedMinor + catchUp.amountMinor;
    const cost = state.costMinor;
    const gain = proceeds - (cost - accumulated);

    const series = await readSeries(tx, input.companyId, 'fixedAssetDisposal', 'FD');
    const write = await post(
      tx,
      { company: company!, caller, now },
      {
        origin: 'system',
        branchId: asset.branchId,
        postingDate: input.disposalDate,
        memo: `${series.number}: disposed of ${asset.number} ${asset.name}`,
        reference: series.number,
        lines: journalFrom([
          { accountId: asset.expenseAccountId, amount: catchUp.amountMinor },
          { accountId: asset.accumulatedAccountId, amount: accumulated - catchUp.amountMinor },
          ...(proceeds > 0n ? [{ accountId: input.proceedsAccountId!, amount: proceeds }] : []),
          { accountId: asset.assetAccountId, amount: -cost },
          { accountId: input.gainLossAccountId, amount: -gain },
        ]),
        backdateApprovalId: input.backdateApprovalId,
        source: { type: 'fixedAsset', id: input.assetId, number: asset.number },
      },
    );
    series.commit();
    const { journalId } = write();
    const next = { ...state, chargedMonths: catchUp.chargedMonths };
    tx.update(refs.fixedAsset(input.assetId), {
      status: 'disposed',
      chargedMonths: catchUp.chargedMonths,
      accumulatedMinor: toStorable(accumulated),
      depreciatedThrough: lastChargedMonth(next),
      disposal: {
        date: input.disposalDate,
        proceedsMinor: toStorable(proceeds),
        proceedsAccountId: proceeds > 0n ? input.proceedsAccountId! : null,
        gainLossAccountId: input.gainLossAccountId,
        gainMinor: toStorable(gain),
        reason: input.reason,
        journalId,
        disposedAt: now,
        disposedBy: caller.uid,
      } satisfies FixedAssetDoc['disposal'],
      updatedAt: now,
    });
    return {
      result: {
        journalId,
        number: series.number,
        gain: toDecimalString(gain, currency),
        depreciationMonths: catchUp.months,
      },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'fixedAsset',
        entityId: input.assetId,
        before: { status: 'active', accumulated: state.accumulatedMinor.toString() },
        after: {
          status: 'disposed',
          disposalDate: input.disposalDate,
          proceeds: proceeds.toString(),
          catchUp: catchUp.amountMinor.toString(),
          gain: gain.toString(),
        },
      },
    };
  },
});
