import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/firebase', () => ({ auth: {} }));
const { safeNext } = await import('./SignIn');

describe('safeNext', () => {
  it('only allows same-site paths after sign-in', () => {
    expect(safeNext('/c/abc/members')).toBe('/c/abc/members');
    expect(safeNext('https://evil.example')).toBe('/companies');
    expect(safeNext('//evil.example')).toBe('/companies');
    expect(safeNext(null)).toBe('/companies');
  });
});
