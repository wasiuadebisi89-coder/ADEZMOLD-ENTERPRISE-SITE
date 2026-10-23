import { describe, expect, it } from 'vitest';
import {
  PeriodError,
  addDays,
  assertNoOverlap,
  assertPeriodTransition,
  assertPostingAllowed,
  businessDate,
  fiscalYearForDate,
  isIsoDate,
  planFiscalYear,
  type Period,
  type PostingContext,
} from './periods.js';

function code(fn: () => void): string | undefined {
  try {
    fn();
    return undefined;
  } catch (e) {
    return e instanceof PeriodError ? e.code : 'unexpected';
  }
}

describe('dates', () => {
  it('validates ISO dates strictly', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-2-1')).toBe(false);
  });
  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('computes the business date in the company time zone', () => {
    // 23:30 UTC on 31 Dec is already 1 Jan in Lagos (UTC+1)
    expect(businessDate(new Date('2026-12-31T23:30:00Z'), 'Africa/Lagos')).toBe('2027-01-01');
  });
});

describe('fiscal years (F6)', () => {
  it('plans a calendar year as 12 monthly periods', () => {
    const fy = planFiscalYear(2026, 1);
    expect(fy.id).toBe('FY2026-01');
    expect(fy.periods).toHaveLength(12);
    expect(fy.periods[1]).toEqual({ id: '2026-02', startDate: '2026-02-01', endDate: '2026-02-28' });
    expect(fy.endDate).toBe('2026-12-31');
  });
  it('plans a July–June year across two calendar years', () => {
    const fy = planFiscalYear(2026, 7);
    expect(fy.startDate).toBe('2026-07-01');
    expect(fy.endDate).toBe('2027-06-30');
    expect(fiscalYearForDate('2027-03-15', 7).id).toBe('FY2026-07');
  });
  it('rejects overlapping years', () => {
    const existing = [planFiscalYear(2026, 1)];
    expect(code(() => assertNoOverlap(existing, planFiscalYear(2026, 7)))).toBe('overlapping_year');
    expect(code(() => assertNoOverlap(existing, planFiscalYear(2027, 1)))).toBeUndefined();
  });
});

describe('assertPostingAllowed (F5)', () => {
  const base: PostingContext = {
    postingDate: '2026-10-20',
    today: '2026-10-23',
    period: { id: '2026-10', status: 'open' },
    backdateWindowDays: 3,
    canPostToSoftClosed: false,
    hasBackdateApproval: false,
  };
  it('allows a date inside the open period and backdate window', () => {
    expect(code(() => assertPostingAllowed(base))).toBeUndefined();
  });
  it('rejects future dates', () => {
    expect(code(() => assertPostingAllowed({ ...base, postingDate: '2026-10-24' }))).toBe('future_date');
  });
  it('rejects a missing or mismatched period', () => {
    expect(code(() => assertPostingAllowed({ ...base, period: undefined }))).toBe('no_period');
    expect(code(() => assertPostingAllowed({ ...base, period: { id: '2026-09', status: 'open' } }))).toBe('no_period');
  });
  it('rejects closed periods even with approvals and permissions', () => {
    expect(
      code(() =>
        assertPostingAllowed({ ...base, period: { id: '2026-10', status: 'closed' }, canPostToSoftClosed: true, hasBackdateApproval: true }),
      ),
    ).toBe('period_closed');
  });
  it('allows soft-closed periods only with permission', () => {
    const soft = { ...base, period: { id: '2026-10', status: 'soft_closed' as const } };
    expect(code(() => assertPostingAllowed(soft))).toBe('period_soft_closed');
    expect(code(() => assertPostingAllowed({ ...soft, canPostToSoftClosed: true }))).toBeUndefined();
  });
  it('requires approval beyond the backdate window', () => {
    const old = { ...base, postingDate: '2026-10-19' };
    expect(code(() => assertPostingAllowed(old))).toBe('backdate_requires_approval');
    expect(code(() => assertPostingAllowed({ ...old, hasBackdateApproval: true }))).toBeUndefined();
  });
});

describe('assertPeriodTransition (F4)', () => {
  const periods = (statuses: Period['status'][]) =>
    statuses.map((status, i) => ({ id: `2026-${String(i + 1).padStart(2, '0')}`, status }));

  it('closes in date order only', () => {
    const p = periods(['open', 'open', 'open']);
    expect(code(() => assertPeriodTransition(p, '2026-01', 'closed'))).toBeUndefined();
    expect(code(() => assertPeriodTransition(p, '2026-02', 'closed'))).toBe('close_out_of_order');
    expect(code(() => assertPeriodTransition(p, '2026-02', 'soft_closed'))).toBe('close_out_of_order');
  });
  it('allows soft-closing after an earlier soft close', () => {
    const p = periods(['soft_closed', 'open']);
    expect(code(() => assertPeriodTransition(p, '2026-02', 'soft_closed'))).toBeUndefined();
    expect(code(() => assertPeriodTransition(p, '2026-02', 'closed'))).toBe('close_out_of_order');
  });
  it('reopens latest first', () => {
    const p = periods(['closed', 'closed', 'open']);
    expect(code(() => assertPeriodTransition(p, '2026-01', 'open'))).toBe('reopen_out_of_order');
    expect(code(() => assertPeriodTransition(p, '2026-02', 'open'))).toBeUndefined();
  });
  it('rejects no-op and unknown transitions', () => {
    const p = periods(['open']);
    expect(code(() => assertPeriodTransition(p, '2026-01', 'open'))).toBe('invalid_transition');
    expect(code(() => assertPeriodTransition(p, '2026-05', 'closed'))).toBe('no_period');
  });
});
