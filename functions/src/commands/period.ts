import {
  MoneyError,
  businessDate,
  parseMoney,
  toStorable,
  assertNoOverlap,
  assertPeriodTransition,
  isReopen,
  planFiscalYear,
  PeriodError,
  type PeriodStatus,
  type Permission,
} from '@bms/domain';
import { defineCommand } from '../lib/command.js';
import {
  CommandError,
  conflict,
  denied,
  failedPrecondition,
  invalid,
  notFound,
} from '../lib/errors.js';
import {
  companyRefs,
  type ApprovalRequestDoc,
  type CompanyDoc,
  type CustomerDoc,
  type FiscalYearDoc,
  type PeriodDoc,
} from '../lib/model.js';

function toCommandError(e: unknown): never {
  if (e instanceof PeriodError) throw new CommandError('failed-precondition', e.code, e.message);
  throw e;
}

export const setPeriodStatus = defineCommand({
  name: 'period.setStatus',
  access: { kind: 'company', permission: 'settings.periods.close' },
  async handler({ tx, caller, input, now }) {
    const refs = companyRefs(input.companyId);
    const periodsSnap = await tx.get(refs.periods);
    const target = periodsSnap.docs.find((d) => d.id === input.periodId);
    if (!target) throw notFound('period_not_found', `Period ${input.periodId} does not exist`);
    const from = (target.data() as PeriodDoc).status;
    const to: PeriodStatus = input.status;

    try {
      assertPeriodTransition(
        periodsSnap.docs.map((d) => ({ id: d.id, status: (d.data() as PeriodDoc).status })),
        input.periodId,
        to,
      );
    } catch (e) {
      toCommandError(e);
    }

    // Reopening a closed period needs an approved, unused request for this period (F3).
    let approvalId: string | undefined;
    if (isReopen(from, to)) {
      if (!input.reason)
        throw failedPrecondition(
          'reason_required',
          'A reason is required to reopen a closed period',
        );
      if (!input.approvalRequestId) {
        throw failedPrecondition(
          'approval_required',
          'Reopening a closed period needs an approved request',
        );
      }
      const approvalRef = refs.approval(input.approvalRequestId);
      const approval = (await tx.get(approvalRef)).data() as ApprovalRequestDoc | undefined;
      if (
        !approval ||
        approval.action !== 'period.reopen' ||
        approval.target.periodId !== input.periodId ||
        approval.status !== 'approved'
      ) {
        throw failedPrecondition(
          'approval_invalid',
          'The approval request is missing, not approved, or already used',
        );
      }
      approvalId = input.approvalRequestId;
      tx.update(approvalRef, { status: 'used', usedAt: now, usedFor: input.periodId });
    }

    tx.update(refs.period(input.periodId), {
      status: to,
      statusChangedAt: now,
      statusChangedBy: caller.uid,
      lastReason: input.reason ?? null,
    });
    return {
      result: { periodId: input.periodId, status: to },
      audit: {
        target: { scope: 'company', companyId: input.companyId },
        entityType: 'period',
        entityId: input.periodId,
        before: { status: from },
        after: { status: to, approvalRequestId: approvalId ?? null },
        reason: input.reason,
      },
    };
  },
});

export const createFiscalYear = defineCommand({
  name: 'fiscalYear.create',
  access: { kind: 'company', permission: 'settings.periods.close' },
  async handler({ tx, caller, input, now }) {
    const refs = companyRefs(input.companyId);
    const company = (await tx.get(refs.company)).data() as CompanyDoc;
    const yearsSnap = await tx.get(refs.fiscalYears);
    const years = yearsSnap.docs.map((d) => d.data() as FiscalYearDoc);
    const plan = planFiscalYear(input.startYear, company.fiscalYearStartMonth);
    try {
      assertNoOverlap(years, plan);
    } catch (e) {
      toCommandError(e);
    }
    const latestEnd = years
      .map((y) => y.endDate)
      .sort()
      .at(-1);
    if (latestEnd) {
      const next = new Date(`${latestEnd}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      if (plan.startDate !== next.toISOString().slice(0, 10)) {
        throw failedPrecondition(
          'fiscal_year_gap',
          'The new fiscal year must start the day after the latest one ends',
        );
      }
    }
    tx.set(refs.fiscalYear(plan.id), {
      startDate: plan.startDate,
      endDate: plan.endDate,
      status: 'open',
      createdAt: now,
      createdBy: caller.uid,
    } satisfies FiscalYearDoc);
    for (const p of plan.periods) {
      tx.set(refs.period(p.id), {
        fiscalYearId: plan.id,
        startDate: p.startDate,
        endDate: p.endDate,
        status: 'open',
        statusChangedAt: now,
        statusChangedBy: caller.uid,
        lastReason: null,
      } satisfies PeriodDoc);
    }
    return {
      result: { fiscalYearId: plan.id },
      audit: {
        target: { scope: 'company', companyId: input.companyId },
        entityType: 'fiscalYear',
        entityId: plan.id,
        after: { startDate: plan.startDate, endDate: plan.endDate },
      },
    };
  },
});

export const requestApproval = defineCommand({
  name: 'approval.request',
  access: {
    kind: 'company',
    permission: (input) =>
      input.action === 'ledger.backdate'
        ? 'ledger.backdate.request'
        : input.action === 'sales.creditOverride'
          ? 'sales.invoice.post'
          : 'settings.periods.reopen.request',
  },
  async handler({ tx, caller, input, now }) {
    const refs = companyRefs(input.companyId);
    let pendingQuery;
    let target: ApprovalRequestDoc['target'] = input.target as ApprovalRequestDoc['target'];
    if (input.action === 'sales.creditOverride') {
      const [companySnap, customerSnap] = await tx.getAll(
        refs.company,
        refs.customer(input.target.customerId),
      );
      const customer = customerSnap!.data() as CustomerDoc | undefined;
      if (!customer) throw notFound('customer_not_found', 'Customer not found');
      let amountMinor: bigint;
      try {
        amountMinor = parseMoney(
          input.target.amount,
          (companySnap!.data() as CompanyDoc).baseCurrency,
        );
      } catch (e) {
        if (e instanceof MoneyError) throw invalid('amount_invalid', e.message);
        throw e;
      }
      if (amountMinor <= 0n) throw invalid('amount_zero', 'Enter the amount to sell on credit');
      target = {
        customerId: input.target.customerId,
        customerName: customer.name,
        amountMinor: toStorable(amountMinor),
      };
      pendingQuery = refs.approvals
        .where('action', '==', input.action)
        .where('target.customerId', '==', input.target.customerId)
        .where('requestedBy', '==', caller.uid);
    } else if (input.action === 'period.reopen') {
      const period = (await tx.get(refs.period(input.target.periodId))).data() as
        PeriodDoc | undefined;
      if (!period) throw notFound('period_not_found', 'Period not found');
      if (period.status !== 'closed')
        throw failedPrecondition('period_not_closed', 'Only closed periods need a reopen approval');
      pendingQuery = refs.approvals
        .where('action', '==', input.action)
        .where('target.periodId', '==', input.target.periodId);
    } else {
      const company = (await tx.get(refs.company)).data() as CompanyDoc;
      if (input.target.postingDate >= businessDate(now.toDate(), company.timeZone)) {
        throw failedPrecondition('not_backdated', 'Only past dates need a backdating approval');
      }
      pendingQuery = refs.approvals
        .where('action', '==', input.action)
        .where('target.postingDate', '==', input.target.postingDate)
        .where('requestedBy', '==', caller.uid);
    }
    const pending = await tx.get(pendingQuery.where('status', 'in', ['pending', 'approved']));
    if (!pending.empty) throw conflict('approval_exists', 'A request for this is already open');
    const ref = refs.approvals.doc();
    const doc = {
      action: input.action,
      target,
      reason: input.reason,
      status: 'pending',
      requestedBy: caller.uid,
      requestedAt: now,
      decidedBy: null,
      decidedAt: null,
      decisionReason: null,
      usedAt: null,
      usedFor: null,
    } as ApprovalRequestDoc;
    tx.set(ref, doc);
    return {
      result: { approvalRequestId: ref.id },
      audit: {
        target: { scope: 'company', companyId: input.companyId },
        entityType: 'approvalRequest',
        entityId: ref.id,
        after: { action: doc.action, target: doc.target },
        reason: input.reason,
      },
    };
  },
});

/** Permission needed to decide each kind of request; checked once the request is read. */
const APPROVE_PERMISSION: Record<ApprovalRequestDoc['action'], Permission> = {
  'period.reopen': 'settings.periods.reopen.approve',
  'ledger.backdate': 'ledger.backdate.approve',
  'sales.creditOverride': 'sales.creditLimit.override',
};

export const decideApproval = defineCommand({
  name: 'approval.decide',
  access: { kind: 'company', permission: 'approvals.read' },
  async handler({ tx, caller, input, now, company }) {
    const ref = companyRefs(input.companyId).approval(input.approvalRequestId);
    const approval = (await tx.get(ref)).data() as ApprovalRequestDoc | undefined;
    if (!approval) throw notFound('approval_not_found', 'Approval request not found');
    if (!company!.permissions.has(APPROVE_PERMISSION[approval.action])) {
      throw denied('missing_permission');
    }
    if (approval.status !== 'pending')
      throw failedPrecondition('approval_not_pending', 'This request has already been decided');
    if (approval.requestedBy === caller.uid) {
      throw denied('self_approval', 'You cannot approve or reject your own request');
    }
    tx.update(ref, {
      status: input.decision,
      decidedBy: caller.uid,
      decidedAt: now,
      decisionReason: input.reason,
    });
    return {
      result: { approvalRequestId: input.approvalRequestId, status: input.decision },
      audit: {
        target: { scope: 'company', companyId: input.companyId },
        entityType: 'approvalRequest',
        entityId: input.approvalRequestId,
        before: { status: 'pending' },
        after: { status: input.decision, action: approval.action },
        reason: input.reason,
      },
    };
  },
});
