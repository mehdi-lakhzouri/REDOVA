import { createHmac } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const base32Decode = (input: string): Buffer => {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of input.replace(/=+$/, '').toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error(`Invalid base32 character: ${char}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
};

/** RFC 6238 TOTP (HMAC-SHA1, 30 s period), as an authenticator app computes it. */
export const totp = (secret: Buffer, timeMs = Date.now(), digits = 6): string => {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(timeMs / 1000 / 30)));
  const hmac = createHmac('sha1', secret).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, '0');
};

/** Current code for the secret carried by an `otpauth://totp/...?secret=...` URI. */
export const totpFromUri = (totpURI: string, timeMs = Date.now()): string => {
  const secret = new URL(totpURI).searchParams.get('secret');
  if (!secret) throw new Error('totpURI has no secret');
  return totp(base32Decode(secret), timeMs);
};
