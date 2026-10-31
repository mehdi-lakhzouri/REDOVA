import { describe, expect, it } from 'vitest';
import { base32Decode, totp, totpFromUri } from './totp';

describe('TOTP test helper (UT-004-01)', () => {
  // RFC 6238 Appendix B, SHA-1 seed.
  const seed = Buffer.from('12345678901234567890');

  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1234567890, '89005924'],
    [20000000000, '65353130'],
  ])('matches the RFC 6238 vector at T=%i', (seconds, expected) => {
    expect(totp(seed, seconds * 1000, 8)).toBe(expected);
  });

  it('decodes base32 secrets from an otpauth URI', () => {
    expect(base32Decode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')).toEqual(seed);
    const uri = 'otpauth://totp/REDOVA:alice?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=REDOVA';
    expect(totpFromUri(uri, 59_000)).toBe('287082');
  });
});
