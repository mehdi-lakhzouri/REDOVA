import { routes } from '@/config/site';

/** Where a signed-in user lands when no safe `next` destination was requested. */
export const DEFAULT_AUTHENTICATED_ROUTE = routes.onboarding;

/**
 * Accepts only same-origin absolute paths, so `?next=` can never become an open redirect
 * (`//evil.com`, `/\evil.com`, `https://…` and control characters are rejected).
 */
export function safeRedirectPath(
  value: string | null | undefined,
  fallback: string = DEFAULT_AUTHENTICATED_ROUTE,
): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return fallback;
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  return value;
}

/** Builds `path?next=…` for flows that must come back to the original destination. */
export function withNext(path: string, next: string | null | undefined): string {
  const safe = safeRedirectPath(next, '');
  return safe ? `${path}?${new URLSearchParams({ next: safe })}` : path;
}

/** Reads `?next=` at submit time, so pages need no Suspense boundary for `useSearchParams`. */
export function currentNextParam(): string | null {
  return typeof window === 'undefined'
    ? null
    : new URLSearchParams(window.location.search).get('next');
}
