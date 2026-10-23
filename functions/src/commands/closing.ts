/**
 * Year-end close (ACCOUNTING_POLICIES.md §14). Moves the year's income and expense balances
 * into retained earnings with one journal dated the year's last day. Every month of the year
 * must be closed or soft-closed first, so the figures being closed are settled. Running it
 * again closes only what was posted to the year since, so it can be repeated safely.
 */
import { AggregateField, FieldValue } from 'firebase-admin/firestore';
import { businessDate, yearEndClosing, type AccountMovement } from '@bms/domain';
import { defineCommand } from '../lib/command.js';
import { companyTarget, journalFrom, post, readSystemAccounts } from '../lib/documents.js';
import { failedPrecondition, notFound } from '../lib/errors.js';
import {
  companyRefs,
  type AccountDoc,
  type CompanyDoc,
  type FiscalYearDoc,
  type PeriodDoc,
} from '../lib/model.js';

export const closeFiscalYear = defineCommand({
  name: 'fiscalYear.close',
  access: { kind: 'company', permission: 'settings.periods.close' },
  async handler({ tx, caller, input, now, company }) {
    const refs = companyRefs(input.companyId);
    const [companySnap, yearSnap] = await tx.getAll(
      refs.company,
      refs.fiscalYear(input.fiscalYearId),
    );
    const companyDoc = companySnap!.data() as CompanyDoc;
    const year = yearSnap!.data() as FiscalYearDoc | undefined;
    if (!year) throw notFound('fiscal_year_not_found', 'Financial year not found');
    const today = businessDate(now.toDate(), companyDoc.timeZone);
    if (year.endDate >= today) {
      throw failedPrecondition(
        'year_not_ended',
        `This financial year ends on ${year.endDate}; it can be closed after that`,
      );
    }
    const periods = await tx.get(refs.periods.where('fiscalYearId', '==', input.fiscalYearId));
    const open = periods.docs.filter((p) => (p.data() as PeriodDoc).status === 'open');
    if (open.length > 0) {
      throw failedPrecondition(
        'periods_open',
        `Close or soft-close every month of the year first (${open
          .map((p) => p.id)
          .sort()
          .join(', ')} still open)`,
      );
    }

    const accountsSnap = await tx.get(refs.accounts.where('type', 'in', ['income', 'expense']));
    const accounts = accountsSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as AccountDoc) }))
      .filter((a) => a.isPostable && a.hasPostings);
    const movements: AccountMovement[] = [];
    for (const a of accounts) {
      const agg = await tx.get(
        refs.ledgerEntries
          .where('accountId', '==', a.id)
          .where('postingDate', '>=', year.startDate)
          .where('postingDate', '<=', year.endDate)
          .aggregate({ debit: AggregateField.sum('debit'), credit: AggregateField.sum('credit') }),
      );
      movements.push({
        account: { id: a.id, code: a.code, name: a.name, type: a.type, subtype: a.subtype },
        debit: BigInt(agg.data().debit ?? 0),
        credit: BigInt(agg.data().credit ?? 0),
      });
    }
    const system = await readSystemAccounts(tx, input.companyId, ['retainedEarnings'] as const);
    const { entries, profit } = yearEndClosing(movements, system.retainedEarnings);
    if (entries.length === 0) {
      throw failedPrecondition(
        'nothing_to_close',
        'Every income and expense account is already at zero for this year',
      );
    }
    const write = await post(
      tx,
      { company: company!, caller, now },
      {
        origin: 'closing',
        branchId: input.branchId,
        postingDate: year.endDate,
        memo: `Year-end close of ${input.fiscalYearId}`,
        reference: input.fiscalYearId,
        lines: journalFrom(entries),
        backdateApprovalId: input.backdateApprovalId,
        source: { type: 'fiscalYear', id: input.fiscalYearId, number: input.fiscalYearId },
      },
    );
    const { journalId, number } = write();
    tx.update(refs.fiscalYear(input.fiscalYearId), {
      closingJournalIds: FieldValue.arrayUnion(journalId),
    });
    return {
      result: { journalId, number, profit: profit.toString() },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'fiscalYear',
        entityId: input.fiscalYearId,
        before: { closingJournals: year.closingJournalIds?.length ?? 0 },
        after: { journalId, profit: profit.toString(), lines: entries.length },
      },
    };
  },
});
