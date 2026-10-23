/**
 * Financial years and monthly periods. Business dates are ISO `YYYY-MM-DD` strings in the
 * company's time zone; period ids are `YYYY-MM`. See docs/bms/ACCOUNTING_POLICIES.md §2.
 */

export type PeriodStatus = 'open' | 'soft_closed' | 'closed';

export interface Period {
  id: string;
  startDate: string;
  endDate: string;
  status: PeriodStatus;
}

export interface FiscalYearPlan {
  id: string;
  startDate: string;
  endDate: string;
  periods: Omit<Period, 'status'>[];
}

export class PeriodError extends Error {
  override name = 'PeriodError';
  constructor(
    public readonly code:
      | 'invalid_date'
      | 'no_period'
      | 'period_closed'
      | 'period_soft_closed'
      | 'backdate_requires_approval'
      | 'future_date'
      | 'close_out_of_order'
      | 'reopen_out_of_order'
      | 'invalid_transition'
      | 'overlapping_year',
    message: string,
  ) {
    super(message);
  }
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

function assertIsoDate(value: string): void {
  if (!isIsoDate(value)) throw new PeriodError('invalid_date', `Invalid date: ${value}`);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(date: string, days: number): string {
  assertIsoDate(date);
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function periodIdForDate(date: string): string {
  assertIsoDate(date);
  return date.slice(0, 7);
}

/** Today's business date in an IANA time zone. */
export function businessDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return parts; // en-CA formats as YYYY-MM-DD
}

/** Fiscal year that starts in `startMonth` (1–12) of `startYear`, split into 12 monthly periods. */
export function planFiscalYear(startYear: number, startMonth: number): FiscalYearPlan {
  if (!Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12) {
    throw new PeriodError('invalid_date', `Invalid fiscal year start month: ${startMonth}`);
  }
  const periods: FiscalYearPlan['periods'] = [];
  for (let i = 0; i < 12; i++) {
    const monthIndex = startMonth - 1 + i;
    const year = startYear + Math.floor(monthIndex / 12);
    const month = (monthIndex % 12) + 1;
    periods.push({
      id: `${year}-${pad(month)}`,
      startDate: `${year}-${pad(month)}-01`,
      endDate: `${year}-${pad(month)}-${pad(lastDayOfMonth(year, month))}`,
    });
  }
  const first = periods[0]!;
  const last = periods[11]!;
  return { id: `FY${first.id}`, startDate: first.startDate, endDate: last.endDate, periods };
}

/** Fiscal year containing `date` for a company whose year starts in `startMonth`. */
export function fiscalYearForDate(date: string, startMonth: number): FiscalYearPlan {
  assertIsoDate(date);
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return planFiscalYear(month >= startMonth ? year : year - 1, startMonth);
}

export function assertNoOverlap(
  existing: readonly { startDate: string; endDate: string }[],
  plan: { startDate: string; endDate: string },
): void {
  for (const fy of existing) {
    if (plan.startDate <= fy.endDate && fy.startDate <= plan.endDate) {
      throw new PeriodError('overlapping_year', 'Fiscal year overlaps an existing year');
    }
  }
}

export interface PostingContext {
  postingDate: string;
  /** Today's business date in the company time zone. */
  today: string;
  period: Pick<Period, 'id' | 'status'> | undefined;
  backdateWindowDays: number;
  canPostToSoftClosed: boolean;
  hasBackdateApproval: boolean;
}

/**
 * Central rule for whether a posting date is acceptable. Every posting service calls this
 * inside its transaction with freshly read period and settings data.
 */
export function assertPostingAllowed(ctx: PostingContext): void {
  assertIsoDate(ctx.postingDate);
  assertIsoDate(ctx.today);
  if (ctx.postingDate > ctx.today) {
    throw new PeriodError('future_date', 'Postings cannot be dated in the future');
  }
  if (!ctx.period || ctx.period.id !== periodIdForDate(ctx.postingDate)) {
    throw new PeriodError('no_period', `No financial period exists for ${ctx.postingDate}`);
  }
  if (ctx.period.status === 'closed') {
    throw new PeriodError('period_closed', `Period ${ctx.period.id} is closed`);
  }
  if (ctx.period.status === 'soft_closed' && !ctx.canPostToSoftClosed) {
    throw new PeriodError('period_soft_closed', `Period ${ctx.period.id} is soft-closed`);
  }
  const earliestWithoutApproval = addDays(ctx.today, -ctx.backdateWindowDays);
  if (ctx.postingDate < earliestWithoutApproval && !ctx.hasBackdateApproval) {
    throw new PeriodError(
      'backdate_requires_approval',
      `Postings dated before ${earliestWithoutApproval} require approval`,
    );
  }
}

const ALLOWED_TRANSITIONS: Record<PeriodStatus, PeriodStatus[]> = {
  open: ['soft_closed', 'closed'],
  soft_closed: ['open', 'closed'],
  closed: ['open'],
};

/**
 * Validates a status change for `targetId` given every period of the company, sorted or not.
 * Closing (soft or hard) must go in date order; reopening must go in reverse date order.
 */
export function assertPeriodTransition(
  periods: readonly Pick<Period, 'id' | 'status'>[],
  targetId: string,
  to: PeriodStatus,
): void {
  const sorted = [...periods].sort((a, b) => a.id.localeCompare(b.id));
  const index = sorted.findIndex((p) => p.id === targetId);
  const target = sorted[index];
  if (!target) throw new PeriodError('no_period', `Unknown period ${targetId}`);
  if (!ALLOWED_TRANSITIONS[target.status].includes(to)) {
    throw new PeriodError(
      'invalid_transition',
      `Cannot move ${targetId} from ${target.status} to ${to}`,
    );
  }
  const rank: Record<PeriodStatus, number> = { open: 0, soft_closed: 1, closed: 2 };
  if (rank[to] > rank[target.status]) {
    const earlierBehind = sorted.slice(0, index).some((p) => rank[p.status] < rank[to]);
    if (earlierBehind) {
      throw new PeriodError(
        'close_out_of_order',
        'Earlier periods must be closed to at least the same status first',
      );
    }
  } else {
    const laterAhead = sorted.slice(index + 1).some((p) => rank[p.status] > rank[to]);
    if (laterAhead) {
      throw new PeriodError('reopen_out_of_order', 'Later periods must be reopened first');
    }
  }
}

/** True when the transition needs the reopen permission plus an approved request. */
export function isReopen(from: PeriodStatus, to: PeriodStatus): boolean {
  return from === 'closed' && to !== 'closed';
}
