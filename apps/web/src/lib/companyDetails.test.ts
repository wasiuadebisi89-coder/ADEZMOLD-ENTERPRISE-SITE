import { describe, expect, it } from 'vitest';
import { contactLine, registrationLine } from './companyDetails';

describe('document detail lines', () => {
  it('adds RC only when it is missing', () => {
    expect(registrationLine({ rcNumber: '1445936', taxId: null })).toBe('RC 1445936');
    expect(registrationLine({ rcNumber: 'RC 1445936', taxId: '1234-5678' })).toBe(
      'RC 1445936 · TIN 1234-5678',
    );
    expect(registrationLine(undefined)).toBe('');
  });
  it('joins phone and email', () => {
    expect(contactLine({ phone: '0801', email: null })).toBe('0801');
    expect(contactLine({ phone: '0801', email: 'a@b.c' })).toBe('0801 · a@b.c');
  });
});
