import { SESSION_FRESH_AGE_SECONDS } from '@redova/auth';
import { describe, expect, it } from 'vitest';
import { isFreshSession } from './fresh-session.guard';
import { isTrustedOrigin } from './origin.guard';

describe('FreshSessionGuard boundary (UT-006-05)', () => {
  const now = Date.parse('2026-10-31T12:00:00Z');
  const ageMs = SESSION_FRESH_AGE_SECONDS * 1000;

  it('accepts a session younger than freshAge', () => {
    expect(isFreshSession(new Date(now - ageMs + 1000), now)).toBe(true);
  });

  it('rejects a session exactly freshAge old or older', () => {
    expect(isFreshSession(new Date(now - ageMs), now)).toBe(false);
    expect(isFreshSession(new Date(now - 2 * ageMs).toISOString(), now)).toBe(false);
  });
});

describe('OriginGuard decision (UT-006-06)', () => {
  const web = 'http://localhost:3000';

  it('lets safe methods through without an Origin header', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      expect(isTrustedOrigin(method, { origin: 'https://evil.example' }, web)).toBe(true);
    }
  });

  it('accepts the trusted origin and rejects any other origin on mutations', () => {
    expect(isTrustedOrigin('POST', { origin: 'http://localhost:3000' }, web)).toBe(true);
    expect(isTrustedOrigin('PUT', { origin: 'https://evil.example' }, web)).toBe(false);
    expect(isTrustedOrigin('DELETE', { origin: 'http://localhost:3000.evil.example' }, web)).toBe(
      false,
    );
  });

  it('falls back to Sec-Fetch-Site when the Origin header is absent', () => {
    expect(isTrustedOrigin('POST', { secFetchSite: 'same-origin' }, web)).toBe(true);
    expect(isTrustedOrigin('POST', { secFetchSite: 'cross-site' }, web)).toBe(false);
    expect(isTrustedOrigin('POST', {}, web)).toBe(false);
  });
});
