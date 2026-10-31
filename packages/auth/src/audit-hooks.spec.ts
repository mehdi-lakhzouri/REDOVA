import { describe, expect, it } from 'vitest';
import { hashEmail } from './audit-hooks';
import { signInThrottleKey } from './sign-in-throttle';

describe('failed sign-in email hashing (UT-002-01)', () => {
  it('is stable across case and surrounding whitespace', () => {
    expect(hashEmail(' Alice@Acme.io ')).toBe(hashEmail('alice@acme.io'));
  });

  it('never contains the raw email', () => {
    const hash = hashEmail('alice@acme.io');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('alice');
  });
});

describe('sign-in throttle key (UT-008-03)', () => {
  it('is derived from the lower-cased email hash, never the raw email', () => {
    const key = signInThrottleKey(' Alice@Acme.io ');
    expect(key).toBe(signInThrottleKey('alice@acme.io'));
    expect(key).toBe(`redova:signin-fail:${hashEmail('alice@acme.io')}`);
    expect(key).not.toContain('alice');
  });
});
