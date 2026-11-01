import { describe, expect, it } from 'vitest';
import { MEDIA_POLICIES } from '@redova/contracts';
import { mediaAccept, mediaFileProblem, mediaRequirements } from './media-policy';

const file = (size: number, type: string, name = 'avatar.png') =>
  new File([new Uint8Array(size)], name, { type });
const AVATAR_MAX = MEDIA_POLICIES.avatar.maxBytes;
const LOGO_MAX = MEDIA_POLICIES.organizationLogo.maxBytes;

describe('mediaFileProblem', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts %s', (type) => {
    expect(mediaFileProblem('avatar', file(1024, type, 'photo'))).toBeNull();
  });

  it('rejects other types, including SVG and GIF', () => {
    expect(mediaFileProblem('avatar', file(1024, 'image/svg+xml', 'a.svg'))).toBe(
      'Use a JPG, PNG or WebP image.',
    );
    expect(mediaFileProblem('avatar', file(1024, 'image/gif', 'a.gif'))).toMatch(/JPG, PNG/);
  });

  it('rejects an extension that does not match the allow-list', () => {
    expect(mediaFileProblem('avatar', file(1024, 'image/png', 'avatar.png.exe'))).toMatch(/JPG/);
  });

  it('enforces the per-kind limits shared with the API', () => {
    expect(mediaFileProblem('avatar', file(AVATAR_MAX, 'image/png'))).toBeNull();
    expect(mediaFileProblem('avatar', file(AVATAR_MAX + 1, 'image/png'))).toMatch(/5 MB/);
    expect(mediaFileProblem('organizationLogo', file(LOGO_MAX + 1, 'image/png'))).toMatch(/2 MB/);
  });

  it('rejects empty files', () => {
    expect(mediaFileProblem('avatar', file(0, 'image/png'))).toMatch(/empty/);
  });
});

describe('mediaAccept / mediaRequirements', () => {
  it('derives the input filter and the help text from the policy', () => {
    expect(mediaAccept('avatar')).toBe('image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp');
    expect(mediaRequirements('organizationLogo')).toBe('JPG, PNG or WebP · Max 2 MB');
  });
});
