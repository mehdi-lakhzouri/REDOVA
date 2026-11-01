/**
 * Address entered at sign-up, kept for this tab only so the verification page can display it and
 * resend the link without reading an email from the URL. Storage failures are non-fatal.
 */
const KEY = 'redova.pending-verification-email';

export function rememberVerificationEmail(email: string): void {
  try {
    sessionStorage.setItem(KEY, email.trim());
  } catch {
    // Private mode or blocked storage: the page falls back to the sign-in route for a new link.
  }
}

export function readVerificationEmail(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function forgetVerificationEmail(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clean up.
  }
}
