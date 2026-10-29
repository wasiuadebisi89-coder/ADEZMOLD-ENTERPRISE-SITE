import { FirebaseError } from 'firebase/app';
import { describe, expect, it, vi } from 'vitest';
import { authErrorMessage } from './authErrors';

const err = (code: string) => new FirebaseError(code, 'x');

describe('authErrorMessage', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});

  it('does not reveal whether an account exists', () => {
    expect(authErrorMessage(err('auth/user-not-found'))).toBe(
      authErrorMessage(err('auth/wrong-password')),
    );
  });

  it('names project set-up problems so they can be fixed', () => {
    expect(authErrorMessage(err('auth/operation-not-allowed'))).toMatch(/not switched on/);
    expect(authErrorMessage(err('auth/invalid-api-key'))).toContain('auth/invalid-api-key');
    expect(authErrorMessage(err('auth/internal-error'))).toContain('(auth/internal-error)');
    expect(authErrorMessage(err('app-check/fetch-status-error'))).toContain(
      '(app-check/fetch-status-error)',
    );
    expect(authErrorMessage(new Error('boom'))).toBe('Something went wrong. Please try again.');
  });
});
