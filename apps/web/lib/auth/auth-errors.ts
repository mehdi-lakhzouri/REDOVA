/** Shape shared by Better Auth client errors and thrown fetch failures. */
export type AuthErrorLike = { code?: string; status?: number; message?: string } | null | undefined;

/**
 * User-facing copy per Better Auth / REDOVA error code. Messages stay generic where the API is
 * deliberately anti-enumeration (sign-in, sign-up, password recovery).
 */
const messages: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'The email or password is incorrect.',
  EMAIL_NOT_VERIFIED:
    'Verify your email before signing in. We’ve sent a new verification link to your inbox.',
  BANNED_USER: 'Your account has been suspended. Contact support.',
  PASSWORD_COMPROMISED: 'This password appears in a known data breach. Choose a different one.',
  PASSWORD_TOO_SHORT: 'Use at least 12 characters.',
  PASSWORD_TOO_LONG: 'Use no more than 128 characters.',
  INVALID_TOKEN: 'This link is invalid or has already been used. Request a new one.',
  TOKEN_EXPIRED: 'This link has expired. Request a new one.',
  INVALID_CODE: 'The code is incorrect. Check your authenticator app and try again.',
  INVALID_BACKUP_CODE: 'This backup code is incorrect or has already been used.',
  INVALID_TWO_FACTOR_COOKIE: 'Your verification session has expired. Sign in again.',
  TOO_MANY_ATTEMPTS: 'Too many attempts. Wait a few minutes before trying again.',
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: 'Too many attempts. Sign in again to get a new challenge.',
  AVATAR_TOO_LARGE: 'The image is larger than 5 MB.',
  AVATAR_INVALID_TYPE: 'Use a JPG, PNG or WebP image.',
};

const RATE_LIMITED = 'Too many requests. Wait a moment before trying again.';
const NETWORK = 'Unable to reach REDOVA. Check your connection and try again.';

/** Maps an API error to a sentence that tells the user what to do next. */
export function authErrorMessage(error: AuthErrorLike, fallback: string): string {
  if (!error) return fallback;
  if (error.code && messages[error.code]) return messages[error.code];
  if (error.status === 429) return RATE_LIMITED;
  if (error.status === 0 || error instanceof TypeError) return NETWORK;
  return fallback;
}
