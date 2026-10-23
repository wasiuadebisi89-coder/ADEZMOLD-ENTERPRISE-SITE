/**
 * Bank reconciliation (ACCOUNTING_POLICIES.md §13). Ledger entries on a cash or bank account
 * are ticked off against the statement; with everything cleared before, they must add up to
 * the statement's closing balance. Each entry can be cleared once. Nothing is posted: entries
 * on the statement but not in the books are entered as journals or documents first.
 */
import { fromStorable, toDecimalString, toStorable } from '@bms/domain';
import { defineCommand } from '../lib/command.js';
import { companyTarget, money } from '../lib/documents.js';
import { failedPrecondition, invalid } from '../lib/errors.js';
import {
  companyRefs,
  type AccountDoc,
  type BankClearingDoc,
  type BankReconciliationDoc,
  type BankStateDoc,
  type CompanyDoc,
  type LedgerEntryDoc,
} from '../lib/model.js';

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
