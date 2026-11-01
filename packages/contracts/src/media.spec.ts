import { describe, expect, it } from 'vitest';
import {
  checkMediaFile,
  ERROR_HTTP_STATUS,
  fileExtension,
  MEDIA_KINDS,
  MEDIA_POLICIES,
  mediaAcceptAttribute,
} from './index';

describe('media policies', () => {
  it.each(MEDIA_KINDS)('%s derives extensions from MIME types and maps to HTTP errors', (kind) => {
    const policy = MEDIA_POLICIES[kind];
    expect(policy.extensions).toEqual(expect.arrayContaining(['jpg', 'jpeg', 'png', 'webp']));
    expect(ERROR_HTTP_STATUS[policy.errors.invalid]).toBe(400);
    expect(ERROR_HTTP_STATUS[policy.errors.tooLarge]).toBe(413);
    expect(ERROR_HTTP_STATUS[policy.errors.notFound]).toBe(404);
  });

  it('builds the accept attribute', () => {
    expect(mediaAcceptAttribute('organizationLogo')).toBe(
      'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp',
    );
  });

  it('reads extensions case-insensitively and ignores dotfiles', () => {
    expect(fileExtension('Photo.JPG')).toBe('jpg');
    expect(fileExtension('.env')).toBeNull();
    expect(fileExtension('photo')).toBeNull();
  });

  it('checks type, extension, emptiness and size', () => {
    const file = (name: string, type: string, size = 10) => ({ name, type, size });
    expect(checkMediaFile('avatar', file('a.png', 'image/png'))).toBeNull();
    expect(checkMediaFile('avatar', file('a.svg', 'image/svg+xml'))).toBe('type');
    expect(checkMediaFile('avatar', file('a.php', 'image/png'))).toBe('type');
    expect(checkMediaFile('avatar', file('a.png', 'image/png', 0))).toBe('empty');
    expect(
      checkMediaFile('organizationLogo', file('a.png', 'image/png', 2 * 1024 * 1024 + 1)),
    ).toBe('size');
  });
});
