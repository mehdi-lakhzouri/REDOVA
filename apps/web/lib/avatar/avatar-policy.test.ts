import { describe, expect, it } from 'vitest';
import { AVATAR_MAX_BYTES, validateAvatarFile } from './avatar-policy';

const file = (size: number, type: string) => new File([new Uint8Array(size)], 'avatar', { type });

describe('validateAvatarFile', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts %s', (type) => {
    expect(validateAvatarFile(file(1024, type))).toBeNull();
  });

  it('rejects other types, including SVG', () => {
    expect(validateAvatarFile(file(1024, 'image/svg+xml'))).toMatch(/JPG, PNG or WebP/);
    expect(validateAvatarFile(file(1024, 'image/gif'))).toMatch(/JPG, PNG or WebP/);
  });

  it('enforces the 5 MB server limit', () => {
    expect(validateAvatarFile(file(AVATAR_MAX_BYTES, 'image/png'))).toBeNull();
    expect(validateAvatarFile(file(AVATAR_MAX_BYTES + 1, 'image/png'))).toMatch(/5 MB/);
  });

  it('rejects empty files', () => {
    expect(validateAvatarFile(file(0, 'image/png'))).toMatch(/empty/);
  });
});
