import { describe, expect, it } from 'vitest';
import { hashEmail } from './audit-hooks';

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
