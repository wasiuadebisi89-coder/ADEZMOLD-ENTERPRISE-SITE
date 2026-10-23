/**
 * The posting engine (docs/bms/ACCOUNTING_POLICIES.md §2–3). Every journal, whether typed by a
 * user or produced by a module, is written here so the same checks apply to all of them.
 *
 * Firestore transactions need every read before the first write, so posting is split in two:
 * `preparePosting` reads and validates, then `writePosting` writes. Callers that read more
 * documents of their own do so before calling `preparePosting`.
 */
import type { Timestamp, Transaction } from 'firebase-admin/firestore';
import {
  LedgerError,
  MoneyError,
  PeriodError,
  assertPostingAllowed,
  assertValidJournal,
  branchAllowed,
  businessDate,
  addDays,
  parseMoney,
  periodIdForDate,
  toStorable,
  type JournalLine,
  type JournalOrigin,
  type LedgerAccount,
} from '@bms/domain';
import type { Caller, CompanyContext } from './command.js';
import { CommandError, denied, failedPrecondition, invalid } from './errors.js';
import {
  companyRefs,
  type AccountDoc,
  type ApprovalRequestDoc,
  type BranchDoc,
  type CompanyDoc,
  type JournalDoc,
  type JournalLineDoc,
  type LedgerEntryDoc,
  type NumberSeriesDoc,
  type PeriodDoc,
  type SettingsDoc,
} from './model.js';

const SERIES: Record<JournalOrigin, { id: string; prefix: string }> = {
  manual: { id: 'journal.manual', prefix: 'JV' },
  opening_balance: { id: 'journal.opening', prefix: 'OB' },
  reversal: { id: 'journal.reversal', prefix: 'RV' },
  system: { id: 'journal.system', prefix: 'SJ' },
};

export function ledgerErrorToCommand(e: unknown): never {
  if (e instanceof LedgerError) {
    throw new CommandError('failed-precondition', e.code, e.message, {
      ...(e.lineNo ? { lineNo: e.lineNo } : {}),
    });
  }
  if (e instanceof PeriodError) throw new CommandError('failed-precondition', e.code, e.message);
  throw e;
}

/** Parses user-entered line amounts with the company currency's decimals. */
export function parseLines(
  lines: readonly { accountId: string; debit: string; credit: string; memo?: string | undefined }[],
  currency: string,
): JournalLine[] {
  return lines.map((l, i) => {
    try {
      return {
        accountId: l.accountId,
        debit: parseMoney(l.debit, currency),
        credit: parseMoney(l.credit, currency),
        memo: l.memo,
      };
    } catch (e) {
      if (e instanceof MoneyError) {
        throw invalid('amount_invalid', `Line ${i + 1}: ${e.message}`, { lineNo: i + 1 });
      }
      throw e;
    }
  });
}

export interface PostingRequest {
  origin: JournalOrigin;
  branchId: string;
  postingDate: string;
  memo: string;
  reference?: string | undefined;
  lines: JournalLine[];
  backdateApprovalId?: string | undefined;
  reversesJournalId?: string | undefined;
}

export interface PreparedPosting {
  request: PostingRequest;
  company: CompanyDoc;
  periodId: string;
  accounts: Map<string, LedgerAccount & { hasPostings: boolean }>;
  totals: { debit: bigint; credit: bigint };
  number: string;
  seriesNext: number;
  seriesExists: boolean;
  approvalToUse: string | null;
}

export async function preparePosting(
  tx: Transaction,
  ctx: { company: CompanyContext; caller: Caller; now: Timestamp },
  request: PostingRequest,
): Promise<PreparedPosting> {
  const { companyId, member, permissions } = ctx.company;
  const refs = companyRefs(companyId);
  const periodId = (() => {
    try {
      return periodIdForDate(request.postingDate);
    } catch (e) {
      return ledgerErrorToCommand(e);
    }
  })();
  const series = SERIES[request.origin];
  const accountIds = [...new Set(request.lines.map((l) => l.accountId))];

  const [companySnap, settingsSnap, periodSnap, branchSnap, seriesSnap, ...accountSnaps] =
    await tx.getAll(
      refs.company,
      refs.settings,
      refs.period(periodId),
      refs.branch(request.branchId),
      refs.numberSeries(series.id),
      ...accountIds.map((id) => refs.account(id)),
    );
  const company = companySnap!.data() as CompanyDoc;
  const settings = settingsSnap!.data() as SettingsDoc;
  const period = periodSnap!.data() as PeriodDoc | undefined;
  const branch = branchSnap!.data() as BranchDoc | undefined;

  if (!branch || branch.status !== 'active') {
    throw failedPrecondition('branch_inactive', 'Choose an active branch');
  }
  if (!branchAllowed(member.branchScope, request.branchId)) {
    throw denied('branch_not_allowed', 'You cannot post for this branch');
  }

  const accounts = new Map<string, LedgerAccount & { hasPostings: boolean }>();
  for (const snap of accountSnaps) {
    if (!snap.exists) continue;
    const d = snap.data() as AccountDoc;
    accounts.set(snap.id, {
      id: snap.id,
      code: d.code,
      name: d.name,
      type: d.type,
      subtype: d.subtype,
      isPostable: d.isPostable,
      isControl: d.isControl,
      status: d.status,
      hasPostings: d.hasPostings,
    });
  }

  let totals: { debit: bigint; credit: bigint };
  try {
    totals = assertValidJournal(request.lines, accounts, request.origin);
  } catch (e) {
    return ledgerErrorToCommand(e);
  }

  // Backdating beyond the window needs an approved request by this user for this date.
  const today = businessDate(ctx.now.toDate(), company.timeZone);
  const needsApproval = request.postingDate < addDays(today, -settings.backdateWindowDays);
  let approvalToUse: string | null = null;
  if (needsApproval && request.backdateApprovalId) {
    const approval = (await tx.get(refs.approval(request.backdateApprovalId))).data() as
      ApprovalRequestDoc | undefined;
    if (
      !approval ||
      approval.action !== 'ledger.backdate' ||
      approval.target.postingDate !== request.postingDate ||
      approval.status !== 'approved' ||
      approval.requestedBy !== ctx.caller.uid
    ) {
      throw failedPrecondition(
        'approval_invalid',
        'The backdating approval is missing, for another date, not approved, or already used',
      );
    }
    approvalToUse = request.backdateApprovalId;
  }

  try {
    assertPostingAllowed({
      postingDate: request.postingDate,
      today,
      period: period ? { id: periodId, status: period.status } : undefined,
      backdateWindowDays: settings.backdateWindowDays,
      canPostToSoftClosed: permissions.has('settings.periods.postSoftClosed'),
      hasBackdateApproval: approvalToUse !== null,
    });
  } catch (e) {
    return ledgerErrorToCommand(e);
  }

  const seriesDoc = seriesSnap!.data() as NumberSeriesDoc | undefined;
  const next = seriesDoc?.next ?? 1;
  return {
    request,
    company,
    periodId,
    accounts,
    totals,
    number: `${series.prefix}-${String(next).padStart(6, '0')}`,
    seriesNext: next,
    seriesExists: seriesDoc !== undefined,
    approvalToUse,
  };
}

/** Writes the journal, its ledger entries, the number series and first-posting locks. */
export function writePosting(
  tx: Transaction,
  ctx: { companyId: string; caller: Caller; now: Timestamp },
  prepared: PreparedPosting,
): { journalId: string; number: string } {
  const refs = companyRefs(ctx.companyId);
  const { request, accounts } = prepared;
  const journalRef = refs.journals.doc();
  const series = SERIES[request.origin];

  const lines: JournalLineDoc[] = request.lines.map((l, i) => {
    const account = accounts.get(l.accountId)!;
    return {
      lineNo: i + 1,
      accountId: l.accountId,
      accountCode: account.code,
      accountName: account.name,
      debit: toStorable(l.debit),
      credit: toStorable(l.credit),
      memo: l.memo ?? null,
    };
  });

  const journal: JournalDoc = {
    number: prepared.number,
    postingDate: request.postingDate,
    periodId: prepared.periodId,
    branchId: request.branchId,
    origin: request.origin,
    currency: prepared.company.baseCurrency,
    memo: request.memo,
    reference: request.reference ?? null,
    lines,
    totalDebit: toStorable(prepared.totals.debit),
    totalCredit: toStorable(prepared.totals.credit),
    status: 'posted',
    reversesJournalId: request.reversesJournalId ?? null,
    reversedByJournalId: null,
    reversalReason: null,
    backdateApprovalId: prepared.approvalToUse,
    postedAt: ctx.now,
    postedBy: ctx.caller.uid,
  };
  tx.set(journalRef, journal);

  for (const line of lines) {
    const entry: LedgerEntryDoc = {
      journalId: journalRef.id,
      journalNumber: prepared.number,
      lineNo: line.lineNo,
      accountId: line.accountId,
      postingDate: request.postingDate,
      periodId: prepared.periodId,
      branchId: request.branchId,
      origin: request.origin,
      debit: line.debit,
      credit: line.credit,
      memo: line.memo,
      postedAt: ctx.now,
    };
    tx.set(refs.ledgerEntry(`${journalRef.id}_${line.lineNo}`), entry);
  }

  const nextSeries: NumberSeriesDoc = { prefix: series.prefix, next: prepared.seriesNext + 1 };
  if (prepared.seriesExists) tx.update(refs.numberSeries(series.id), { next: nextSeries.next });
  else tx.set(refs.numberSeries(series.id), nextSeries);

  for (const account of accounts.values()) {
    if (!account.hasPostings) tx.update(refs.account(account.id), { hasPostings: true });
  }

  // The first posting fixes the currency and the financial year start (ACCOUNTING_POLICIES §1).
  const locks = prepared.company.locks;
  if (!locks.baseCurrency || !locks.fiscalYearStartMonth) {
    tx.update(refs.company, {
      'locks.baseCurrency': true,
      'locks.fiscalYearStartMonth': true,
    });
  }

  if (prepared.approvalToUse) {
    tx.update(refs.approval(prepared.approvalToUse), {
      status: 'used',
      usedAt: ctx.now,
      usedFor: journalRef.id,
    });
  }

  return { journalId: journalRef.id, number: prepared.number };
}
