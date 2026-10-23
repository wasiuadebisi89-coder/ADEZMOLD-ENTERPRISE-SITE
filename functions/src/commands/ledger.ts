import {
  CHART_TEMPLATES,
  SYSTEM_ACCOUNT_SUBTYPES,
  fromStorable,
  isControlSubtype,
  openingBalanceDifference,
  reverseLines,
  subtypeAllowed,
  type ChartTemplate,
} from '@bms/domain';
import type { Timestamp, Transaction } from 'firebase-admin/firestore';
import { defineCommand } from '../lib/command.js';
import { conflict, failedPrecondition, invalid, notFound } from '../lib/errors.js';
import {
  companyRefs,
  type AccountDoc,
  type CompanyDoc,
  type JournalDoc,
  type LedgerSettingsDoc,
} from '../lib/model.js';
import { parseLines, preparePosting, writePosting } from '../lib/posting.js';

// --- Chart of accounts -----------------------------------------------------------------------

/** Writes every template account. The caller must have checked the chart is empty. */
export function seedChart(
  tx: Transaction,
  companyId: string,
  template: ChartTemplate,
  meta: { now: Timestamp; uid: string },
): number {
  const refs = companyRefs(companyId);
  const idsByCode = new Map(template.accounts.map((a) => [a.code, refs.accounts.doc().id]));
  for (const a of template.accounts) {
    const doc: AccountDoc = {
      code: a.code,
      name: a.name,
      type: a.type,
      subtype: a.subtype,
      parentId: a.parentCode ? idsByCode.get(a.parentCode)! : null,
      isPostable: a.isPostable,
      isControl: a.isPostable && isControlSubtype(a.subtype),
      status: 'active',
      hasPostings: false,
      template: { id: template.id, version: template.version },
      createdAt: meta.now,
      createdBy: meta.uid,
      updatedAt: meta.now,
      updatedBy: meta.uid,
    };
    tx.set(refs.account(idsByCode.get(a.code)!), doc);
  }
  return template.accounts.length;
}

export const applyChartTemplate = defineCommand({
  name: 'chart.applyTemplate',
  access: { kind: 'company', permission: 'ledger.accounts.manage' },
  async handler({ tx, caller, input, now }) {
    const refs = companyRefs(input.companyId);
    const existing = await tx.get(refs.accounts.limit(1));
    if (!existing.empty) {
      throw conflict('chart_exists', 'This company already has a chart of accounts');
    }
    const template = CHART_TEMPLATES[input.templateId]!;
    const count = seedChart(tx, input.companyId, template, { now, uid: caller.uid });
    return {
      result: { accounts: count },
      audit: {
        target: { scope: 'company', companyId: input.companyId },
        entityType: 'chartOfAccounts',
        entityId: template.id,
        after: { templateId: template.id, version: template.version, accounts: count },
      },
    };
  },
});

async function checkParent(
  tx: Transaction,
  companyId: string,
  parentId: string | null,
  type: AccountDoc['type'],
  selfId?: string,
): Promise<void> {
  if (!parentId) return;
  if (parentId === selfId) throw invalid('parent_invalid', 'An account cannot be its own heading');
  const parent = (await tx.get(companyRefs(companyId).account(parentId))).data() as
    AccountDoc | undefined;
  if (!parent) throw notFound('parent_not_found', 'Heading account not found');
  if (parent.isPostable) {
    throw invalid('parent_invalid', 'Accounts can only sit under a heading account');
  }
  if (parent.type !== type) {
    throw invalid('parent_invalid', 'The heading must be of the same account type');
  }
}

export const createAccount = defineCommand({
  name: 'account.create',
  access: { kind: 'company', permission: 'ledger.accounts.manage' },
  async handler({ tx, caller, input, now }) {
    const refs = companyRefs(input.companyId);
    if (!subtypeAllowed(input.type, input.subtype)) {
      throw invalid('subtype_invalid', `A ${input.type} account cannot have that role`, {
        fields: { subtype: 'Not allowed for this account type' },
      });
    }
    if (!input.isPostable && input.subtype !== 'general') {
      throw invalid('subtype_invalid', 'Heading accounts cannot have a special role', {
        fields: { subtype: 'Headings must be General' },
      });
    }
    const duplicate = await tx.get(refs.accounts.where('code', '==', input.code).limit(1));
    if (!duplicate.empty) {
      throw conflict('code_taken', `Account code ${input.code} is already used`);
    }
    if (SYSTEM_ACCOUNT_SUBTYPES.includes(input.subtype)) {
      const same = await tx.get(refs.accounts.where('subtype', '==', input.subtype).limit(1));
      if (!same.empty) {
        throw conflict('system_account_exists', 'The company already has an account for this role');
      }
    }
    await checkParent(tx, input.companyId, input.parentId, input.type);

    const ref = refs.accounts.doc();
    const doc: AccountDoc = {
      code: input.code,
      name: input.name,
      type: input.type,
      subtype: input.subtype,
      parentId: input.parentId,
      isPostable: input.isPostable,
      isControl: input.isPostable && isControlSubtype(input.subtype),
      status: 'active',
      hasPostings: false,
      template: null,
      createdAt: now,
      createdBy: caller.uid,
      updatedAt: now,
      updatedBy: caller.uid,
    };
    tx.set(ref, doc);
    return {
      result: { accountId: ref.id },
      audit: {
        target: { scope: 'company', companyId: input.companyId },
        entityType: 'account',
        entityId: ref.id,
        after: { code: doc.code, name: doc.name, type: doc.type, subtype: doc.subtype },
      },
    };
  },
});

export const updateAccount = defineCommand({
  name: 'account.update',
  access: { kind: 'company', permission: 'ledger.accounts.manage' },
  async handler({ tx, caller, input, now }) {
    const refs = companyRefs(input.companyId);
    const snap = await tx.get(refs.account(input.accountId));
    const account = snap.data() as AccountDoc | undefined;
    if (!account) throw notFound('account_not_found', 'Account not found');
    if (input.parentId !== undefined) {
      await checkParent(tx, input.companyId, input.parentId, account.type, input.accountId);
    }
    const patch: Partial<AccountDoc> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.status !== undefined) patch.status = input.status;
    if (input.parentId !== undefined) patch.parentId = input.parentId;
    tx.update(refs.account(input.accountId), { ...patch, updatedAt: now, updatedBy: caller.uid });
    return {
      result: { accountId: input.accountId },
      audit: {
        target: { scope: 'company', companyId: input.companyId },
        entityType: 'account',
        entityId: input.accountId,
        before: { name: account.name, status: account.status, parentId: account.parentId },
        after: patch,
      },
    };
  },
});

// --- Journals --------------------------------------------------------------------------------

export const postJournal = defineCommand({
  name: 'journal.post',
  access: { kind: 'company', permission: 'ledger.journal.post' },
  async handler({ tx, caller, input, now, company }) {
    const refs = companyRefs(input.companyId);
    const currency = ((await tx.get(refs.company)).data() as CompanyDoc).baseCurrency;
    const prepared = await preparePosting(
      tx,
      { company: company!, caller, now },
      {
        origin: 'manual',
        branchId: input.branchId,
        postingDate: input.postingDate,
        memo: input.memo,
        reference: input.reference,
        lines: parseLines(input.lines, currency),
        backdateApprovalId: input.backdateApprovalId,
      },
    );
    const { journalId, number } = writePosting(
      tx,
      { companyId: input.companyId, caller, now },
      prepared,
    );
    return {
      result: { journalId, number },
      audit: {
        target: { scope: 'company', companyId: input.companyId },
        entityType: 'journal',
        entityId: journalId,
        after: {
          number,
          postingDate: input.postingDate,
          total: prepared.totals.debit.toString(),
          backdateApprovalId: prepared.approvalToUse,
        },
      },
    };
  },
});

/** Journals the ledger itself may reverse. Module postings are reversed through their document. */
const REVERSIBLE: readonly JournalDoc['origin'][] = ['manual', 'opening_balance'];

export const reverseJournal = defineCommand({
  name: 'journal.reverse',
  access: { kind: 'company', permission: 'ledger.journal.reverse' },
  async handler({ tx, caller, input, now, company }) {
    const refs = companyRefs(input.companyId);
    const [originalSnap, ledgerSnap] = await tx.getAll(
      refs.journal(input.journalId),
      refs.ledgerSettings,
    );
    const original = originalSnap!.data() as JournalDoc | undefined;
    if (!original) throw notFound('journal_not_found', 'Journal not found');
    if (original.status !== 'posted' || original.reversedByJournalId) {
      throw failedPrecondition(
        'already_reversed',
        `Journal ${original.number} is already reversed`,
      );
    }
    if (!REVERSIBLE.includes(original.origin)) {
      throw failedPrecondition(
        'not_reversible',
        original.origin === 'reversal'
          ? 'A reversal cannot itself be reversed. Post a new journal instead'
          : original.origin === 'closing'
            ? 'A year-end close cannot be reversed. Post any correction to the year and close it again'
            : 'This journal belongs to another module. Reverse it from its source document',
      );
    }
    if (input.postingDate < original.postingDate) {
      throw invalid('reversal_before_original', 'A reversal cannot be dated before the original');
    }

    const prepared = await preparePosting(
      tx,
      { company: company!, caller, now },
      {
        origin: 'reversal',
        branchId: original.branchId,
        postingDate: input.postingDate,
        memo: `Reversal of ${original.number}: ${input.reason}`,
        reference: original.number,
        lines: reverseLines(
          original.lines.map((l) => ({
            accountId: l.accountId,
            debit: fromStorable(l.debit),
            credit: fromStorable(l.credit),
            memo: l.memo ?? undefined,
          })),
        ),
        backdateApprovalId: input.backdateApprovalId,
        reversesJournalId: input.journalId,
      },
    );
    const { journalId, number } = writePosting(
      tx,
      { companyId: input.companyId, caller, now },
      prepared,
    );
    // Only the link fields change on the original; its lines and amounts never do.
    tx.update(refs.journal(input.journalId), {
      status: 'reversed',
      reversedByJournalId: journalId,
      reversalReason: input.reason,
    });
    const ledgerSettings = ledgerSnap!.data() as LedgerSettingsDoc | undefined;
    if (ledgerSettings?.openingBalanceJournalId === input.journalId) {
      tx.update(refs.ledgerSettings, {
        openingBalanceJournalId: null,
        updatedAt: now,
        updatedBy: caller.uid,
      });
    }
    return {
      result: { journalId, number },
      audit: {
        target: { scope: 'company', companyId: input.companyId },
        entityType: 'journal',
        entityId: input.journalId,
        before: { status: 'posted' },
        after: { status: 'reversed', reversedByJournalId: journalId, reversalNumber: number },
        reason: input.reason,
      },
    };
  },
});

// --- Opening balances ------------------------------------------------------------------------

export const postOpeningBalance = defineCommand({
  name: 'openingBalance.post',
  access: { kind: 'company', permission: 'ledger.journal.post' },
  async handler({ tx, caller, input, now, company }) {
    const refs = companyRefs(input.companyId);
    const [companySnap, ledgerSnap] = await tx.getAll(refs.company, refs.ledgerSettings);
    const ledgerSettings = ledgerSnap!.data() as LedgerSettingsDoc | undefined;
    if (ledgerSettings?.openingBalanceJournalId) {
      throw conflict(
        'opening_balance_exists',
        'Opening balances are already posted. Reverse that journal to enter them again',
      );
    }
    const equity = await tx.get(
      refs.accounts
        .where('subtype', '==', 'openingBalanceEquity')
        .where('status', '==', 'active')
        .limit(2),
    );
    if (equity.size !== 1) {
      throw failedPrecondition(
        'opening_equity_missing',
        'Add one active account with the "Opening balance equity" role first',
      );
    }
    const equityId = equity.docs[0]!.id;
    const currency = (companySnap!.data() as CompanyDoc).baseCurrency;
    const entered = parseLines(input.lines, currency);
    if (entered.some((l) => l.accountId === equityId)) {
      throw invalid(
        'opening_equity_entered',
        'Leave out the opening balance equity account; the difference is posted to it for you',
      );
    }
    const difference = openingBalanceDifference(entered, equityId);
    const lines = difference ? [...entered, difference] : entered;

    const prepared = await preparePosting(
      tx,
      { company: company!, caller, now },
      {
        origin: 'opening_balance',
        branchId: input.branchId,
        postingDate: input.asAtDate,
        memo: input.memo ?? `Opening balances as at ${input.asAtDate}`,
        lines,
        backdateApprovalId: input.backdateApprovalId,
      },
    );
    const { journalId, number } = writePosting(
      tx,
      { companyId: input.companyId, caller, now },
      prepared,
    );
    tx.set(refs.ledgerSettings, {
      openingBalanceJournalId: journalId,
      updatedAt: now,
      updatedBy: caller.uid,
    } satisfies LedgerSettingsDoc);
    const differenceMinor = difference ? difference.debit - difference.credit : 0n;
    return {
      result: { journalId, number, difference: differenceMinor.toString() },
      audit: {
        target: { scope: 'company', companyId: input.companyId },
        entityType: 'journal',
        entityId: journalId,
        after: {
          number,
          asAtDate: input.asAtDate,
          total: prepared.totals.debit.toString(),
          openingEquityDifference: differenceMinor.toString(),
        },
      },
    };
  },
});
