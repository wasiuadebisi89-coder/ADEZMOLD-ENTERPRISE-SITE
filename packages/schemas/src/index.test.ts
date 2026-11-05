import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  bankAccountNumber,
  createBankAccountInput,
  createCompanyInput,
  createInvitationInput,
  setPeriodStatusInput,
} from './index.js';

const base = {
  idempotencyKey: randomUUID(),
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

describe('bank accounts', () => {
  const key = randomUUID();
  it('normalises account numbers and requires a ledger choice', () => {
    const parsed = createBankAccountInput.parse({
      idempotencyKey: key,
      companyId: 'c1',
      bankName: ' GTBank ',
      accountName: 'Adezmold',
      accountNumber: '0123-456 789',
      ledger: { mode: 'new', code: '1121', name: 'GTBank' },
    });
    expect(parsed.accountNumber).toBe('0123456789');
    expect(parsed.bankName).toBe('GTBank');
    expect(parsed.ledger).toEqual({ mode: 'new', code: '1121', name: 'GTBank', parentId: null });
    expect(bankAccountNumber.safeParse('12').success).toBe(false);
    expect(bankAccountNumber.safeParse('0123/456').success).toBe(false);
    expect(bankAccountNumber.parse('gb29 nwbk 6016 1331 9268 19')).toBe('GB29NWBK60161331926819');
  });
});
