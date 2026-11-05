/**
 * Bank reconciliation (ACCOUNTING_POLICIES.md §13). Ledger entries on a cash or bank account
 * are ticked off against the statement; with everything cleared before, they must add up to
 * the statement's closing balance. Each entry can be cleared once. Nothing is posted: entries
 * on the statement but not in the books are entered as journals or documents first.
 */
import { fromStorable, toDecimalString, toStorable } from '@bms/domain';
import type { Transaction } from 'firebase-admin/firestore';
import { defineCommand } from '../lib/command.js';
import { companyTarget, money } from '../lib/documents.js';
import { conflict, failedPrecondition, invalid, notFound } from '../lib/errors.js';
import {
  companyRefs,
  type AccountDoc,
  type BankDetails,
  type BankClearingDoc,
  type BankReconciliationDoc,
  type BankStateDoc,
  type CompanyDoc,
  type LedgerEntryDoc,
} from '../lib/model.js';
import { checkParent } from './ledger.js';

export const completeBankReconciliation = defineCommand({
  name: 'bankReconciliation.complete',
  access: { kind: 'company', permission: 'ledger.bank.reconcile' },
  async handler({ tx, caller, input, now }) {
    const refs = companyRefs(input.companyId);
    if (new Set(input.entryIds).size !== input.entryIds.length) {
      throw invalid('duplicate_entry', 'Each entry can be ticked only once');
    }
    const [companySnap, accountSnap, stateSnap, ...rest] = await tx.getAll(
      refs.company,
      refs.account(input.accountId),
      refs.bankState(input.accountId),
      ...input.entryIds.map((id) => refs.ledgerEntry(id)),
      ...input.entryIds.map((id) => refs.bankClearing(id)),
    );
    const currency = (companySnap!.data() as CompanyDoc).baseCurrency;
    const account = accountSnap!.data() as AccountDoc | undefined;
    if (!account || (account.subtype !== 'cash' && account.subtype !== 'bank')) {
      throw invalid('account_invalid', 'Choose a cash or bank account');
    }
    const state = stateSnap!.data() as BankStateDoc | undefined;
    if (state && input.statementDate < state.lastStatementDate) {
      throw failedPrecondition(
        'statement_before_last',
        `This account was reconciled to ${state.lastStatementDate}; enter a later statement`,
      );
    }
    const entries = rest.slice(0, input.entryIds.length);
    const clearings = rest.slice(input.entryIds.length);
    let debit = 0n;
    let credit = 0n;
    entries.forEach((snap, i) => {
      const entry = snap!.data() as LedgerEntryDoc | undefined;
      if (!entry || entry.accountId !== input.accountId) {
        throw invalid('entry_not_found', 'An entry ticked is not on this account');
      }
      if (entry.postingDate > input.statementDate) {
        throw invalid(
          'entry_after_statement',
          `${entry.journalNumber} is dated after the statement`,
        );
      }
      if (clearings[i]!.exists) {
        throw failedPrecondition('entry_cleared', `${entry.journalNumber} is already reconciled`);
      }
      debit += fromStorable(entry.debit);
      credit += fromStorable(entry.credit);
    });
    const opening = state ? fromStorable(state.reconciledBalanceMinor) : 0n;
    const statement = money(input.statementBalance, currency);
    const difference = statement - (opening + debit - credit);
    if (difference !== 0n) {
      throw failedPrecondition(
        'reconciliation_difference',
        `The ticked entries leave a difference of ${toDecimalString(difference, currency)} against the statement`,
      );
    }

    const ref = refs.bankReconciliations.doc();
    const doc: BankReconciliationDoc = {
      accountId: input.accountId,
      accountName: `${account.code} ${account.name}`,
      statementDate: input.statementDate,
      openingBalanceMinor: toStorable(opening),
      statementBalanceMinor: toStorable(statement),
      entryIds: input.entryIds,
      clearedDebitMinor: toStorable(debit),
      clearedCreditMinor: toStorable(credit),
      completedAt: now,
      completedBy: caller.uid,
    };
    tx.set(ref, doc);
    for (const id of input.entryIds) {
      tx.set(refs.bankClearing(id), {
        accountId: input.accountId,
        reconciliationId: ref.id,
        statementDate: input.statementDate,
        clearedAt: now,
      } satisfies BankClearingDoc);
    }
    tx.set(refs.bankState(input.accountId), {
      accountId: input.accountId,
      reconciledBalanceMinor: toStorable(statement),
      lastStatementDate: input.statementDate,
      lastReconciliationId: ref.id,
      updatedAt: now,
    } satisfies BankStateDoc);
    return {
      result: { reconciliationId: ref.id },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'bankReconciliation',
        entityId: ref.id,
        before: { reconciledBalance: opening.toString() },
        after: {
          accountId: input.accountId,
          statementDate: input.statementDate,
          statementBalance: statement.toString(),
          entries: input.entryIds.length,
        },
      },
    };
  },
});

// --- Company bank accounts -------------------------------------------------------------------

/** Refuses a bank and account number another of the company's accounts already uses. */
async function checkNumberFree(
  tx: Transaction,
  companyId: string,
  bankName: string,
  accountNumber: string,
  selfId?: string,
): Promise<void> {
  const same = await tx.get(
    companyRefs(companyId).accounts.where('bank.accountNumber', '==', accountNumber),
  );
  const clash = same.docs.find(
    (d) =>
      d.id !== selfId &&
      (d.data() as AccountDoc).bank?.bankName.toLowerCase() === bankName.toLowerCase(),
  );
  if (clash) {
    const other = clash.data() as AccountDoc;
    throw conflict(
      'bank_account_exists',
      `${bankName} ${accountNumber} is already set up as ${other.code} ${other.name}`,
    );
  }
}

export const createBankAccount = defineCommand({
  name: 'bankAccount.create',
  access: { kind: 'company', permission: 'ledger.accounts.manage' },
  async handler({ tx, caller, input, now }) {
    const refs = companyRefs(input.companyId);
    const baseCurrency = ((await tx.get(refs.company)).data() as CompanyDoc).baseCurrency;
    const currency = input.currency ?? baseCurrency;
    if (currency !== baseCurrency) {
      throw invalid(
        'currency_unsupported',
        `Bank accounts must be in ${baseCurrency}, the company's currency, for now`,
        { fields: { currency: `Use ${baseCurrency}` } },
      );
    }
    const bank: BankDetails = {
      bankName: input.bankName,
      accountName: input.accountName,
      accountNumber: input.accountNumber,
      currency,
    };

    if (input.ledger.mode === 'existing') {
      const accountId = input.ledger.accountId;
      const account = (await tx.get(refs.account(accountId))).data() as AccountDoc | undefined;
      if (!account) throw notFound('account_not_found', 'Ledger account not found');
      if (account.subtype !== 'bank' || !account.isPostable) {
        throw invalid('account_invalid', 'Choose a ledger account with the Bank role');
      }
      if (account.bank) {
        throw conflict(
          'bank_details_exist',
          `${account.code} ${account.name} already has bank details; edit them instead`,
        );
      }
      await checkNumberFree(tx, input.companyId, bank.bankName, bank.accountNumber);
      tx.update(refs.account(accountId), { bank, updatedAt: now, updatedBy: caller.uid });
      return {
        result: { accountId },
        audit: {
          target: companyTarget(input.companyId),
          entityType: 'account',
          entityId: accountId,
          before: { bank: null },
          after: { bank },
        },
      };
    }

    const { code, name, parentId } = input.ledger;
    const duplicate = await tx.get(refs.accounts.where('code', '==', code).limit(1));
    if (!duplicate.empty) {
      throw conflict('code_taken', `Account code ${code} is already used`);
    }
    await checkParent(tx, input.companyId, parentId, 'asset');
    await checkNumberFree(tx, input.companyId, bank.bankName, bank.accountNumber);
    const ref = refs.accounts.doc();
    const doc: AccountDoc = {
      code,
      name,
      type: 'asset',
      subtype: 'bank',
      parentId,
      isPostable: true,
      isControl: false,
      status: 'active',
      hasPostings: false,
      template: null,
      bank,
      createdAt: now,
      createdBy: caller.uid,
      updatedAt: now,
      updatedBy: caller.uid,
    };
    tx.set(ref, doc);
    return {
      result: { accountId: ref.id },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'account',
        entityId: ref.id,
        after: { code, name, type: 'asset', subtype: 'bank', bank },
      },
    };
  },
});

export const updateBankAccount = defineCommand({
  name: 'bankAccount.update',
  access: { kind: 'company', permission: 'ledger.accounts.manage' },
  async handler({ tx, caller, input, now }) {
    const refs = companyRefs(input.companyId);
    const account = (await tx.get(refs.account(input.accountId))).data() as AccountDoc | undefined;
    if (!account?.bank) throw notFound('bank_account_not_found', 'Bank account not found');
    const bank: BankDetails = {
      ...account.bank,
      ...(input.bankName !== undefined && { bankName: input.bankName }),
      ...(input.accountName !== undefined && { accountName: input.accountName }),
      ...(input.accountNumber !== undefined && { accountNumber: input.accountNumber }),
    };
    if (
      bank.accountNumber !== account.bank.accountNumber ||
      bank.bankName.toLowerCase() !== account.bank.bankName.toLowerCase()
    ) {
      await checkNumberFree(
        tx,
        input.companyId,
        bank.bankName,
        bank.accountNumber,
        input.accountId,
      );
    }
    const status = input.status ?? account.status;
    tx.update(refs.account(input.accountId), {
      bank,
      status,
      updatedAt: now,
      updatedBy: caller.uid,
    });
    return {
      result: { accountId: input.accountId },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'account',
        entityId: input.accountId,
        before: { bank: account.bank, status: account.status },
        after: { bank, status },
      },
    };
  },
});
