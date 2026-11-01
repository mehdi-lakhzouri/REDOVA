import { describe, expect, it } from 'vitest';
import { authErrorMessage } from './auth-errors';

const FALLBACK = 'Something went wrong.';

describe('authErrorMessage', () => {
  it('maps known API codes', () => {
    expect(authErrorMessage({ code: 'INVALID_EMAIL_OR_PASSWORD' }, FALLBACK)).toBe(
      'The email or password is incorrect.',
    );
    expect(authErrorMessage({ code: 'TOKEN_EXPIRED' }, FALLBACK)).toMatch(/expired/);
  });

  it('explains rate limiting by status', () => {
    expect(authErrorMessage({ status: 429 }, FALLBACK)).toMatch(/Too many requests/);
  });

  it('never echoes unknown server messages', () => {
    expect(authErrorMessage({ code: 'SOMETHING_NEW', message: 'stack trace' }, FALLBACK)).toBe(
      FALLBACK,
    );
    expect(authErrorMessage(null, FALLBACK)).toBe(FALLBACK);
  });
});
