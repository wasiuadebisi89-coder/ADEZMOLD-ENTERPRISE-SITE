import { describe, expect, it } from 'vitest';
import { createCompanyInput, createInvitationInput, setPeriodStatusInput } from './index.js';

const base = {
  idempotencyKey: '7f1d8f3e-2b0a-4c39-9a51-3f0d2a8b9c11',
  legalName: '  Adezmold Trading Ltd ',
  country: 'ng',
  baseCurrency: 'NGN',
  timeZone: 'Africa/Lagos',
  fiscalYearStartMonth: 1,
  headOffice: { code: 'hq', name: 'Head office' },
};

describe('createCompanyInput', () => {
  it('normalises input and treats an empty trading name as absent', () => {
    const parsed = createCompanyInput.parse({ ...base, tradingName: '   ' });
    expect(parsed).toMatchObject({
      legalName: 'Adezmold Trading Ltd',
      country: 'NG',
      headOffice: { code: 'HQ' },
    });
    expect(parsed.tradingName).toBeUndefined();
  });
  it('rejects unknown currencies, time zones and months', () => {
    for (const bad of [
      { baseCurrency: 'BTC' },
      { timeZone: 'Nowhere/City' },
      { fiscalYearStartMonth: 0 },
      { idempotencyKey: '1' },
    ]) {
      expect(createCompanyInput.safeParse({ ...base, ...bad }).success).toBe(false);
    }
  });
});

describe('other schemas', () => {
  it('lower-cases invitation emails and validates branch scope', () => {
    const parsed = createInvitationInput.parse({
      idempotencyKey: base.idempotencyKey,
      companyId: 'c1',
      email: 'Ada@Example.TEST',
      roleIds: ['manager'],
      branchScope: 'all',
    });
    expect(parsed.email).toBe('ada@example.test');
    expect(createInvitationInput.safeParse({ ...parsed, branchScope: [] }).success).toBe(false);
  });
  it('validates period ids', () => {
    const ok = { idempotencyKey: base.idempotencyKey, companyId: 'c1', status: 'closed' };
    expect(setPeriodStatusInput.safeParse({ ...ok, periodId: '2026-10' }).success).toBe(true);
    expect(setPeriodStatusInput.safeParse({ ...ok, periodId: '2026-13' }).success).toBe(false);
  });
});
