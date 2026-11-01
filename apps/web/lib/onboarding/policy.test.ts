import { describe, expect, it } from 'vitest';
import {
  allowedInvitationRoles,
  invitationSchema,
  logoProblem,
  organizationSchema,
  suggestSlug,
} from './policy';

describe('organization onboarding policy', () => {
  it('normalizes a suggested slug without changing an explicit slug', () => {
    expect(suggestSlug('  Équipe Sécurité / AI  ')).toBe('equipe-securite-ai');
    expect(suggestSlug('a'.repeat(60))).toHaveLength(48);
  });
  it.each([
    'admin',
    'api',
    'settings',
    'new',
    'orgs',
    'invitations',
    'ab',
    '-abc',
    'abc-',
    'Acme',
    'a'.repeat(49),
  ])('rejects invalid or reserved slug %s', (slug) => {
    expect(organizationSchema.safeParse({ name: 'Acme', slug }).success).toBe(false);
  });
  it('matches the backend name and slug boundaries', () => {
    expect(organizationSchema.parse({ name: '  AC  ', slug: 'a-b' }).name).toBe('AC');
    expect(
      organizationSchema.safeParse({ name: 'a'.repeat(64), slug: 'b'.repeat(48) }).success,
    ).toBe(true);
    expect(organizationSchema.safeParse({ name: 'A', slug: 'acme' }).success).toBe(false);
    expect(organizationSchema.safeParse({ name: 'a'.repeat(65), slug: 'acme' }).success).toBe(
      false,
    );
  });
  it('accepts optional logos, HTTPS URLs and bounded supported files', () => {
    expect(logoProblem({ kind: 'none' })).toBeNull();
    expect(logoProblem({ kind: 'url', url: 'https://example.com/logo.png' })).toBeNull();
    expect(
      logoProblem({ kind: 'file', file: new File(['pixels'], 'logo.png', { type: 'image/png' }) }),
    ).toBeNull();
    expect(
      logoProblem({
        kind: 'file',
        file: new File([new Uint8Array(2 * 1024 * 1024)], 'logo.webp', { type: 'image/webp' }),
      }),
    ).toBeNull();
  });
  it('rejects oversized, empty, unsupported files and unsafe URL protocols', () => {
    for (const file of [
      new File([], 'empty.png', { type: 'image/png' }),
      new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }),
      new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' }),
    ]) {
      expect(logoProblem({ kind: 'file', file })).toBeTruthy();
    }
    for (const url of [
      'http://example.com/logo.png',
      'javascript:alert(1)',
      'data:image/png,a',
      'bad',
      'https://example.com/' + 'a'.repeat(2048),
    ]) {
      expect(logoProblem({ kind: 'url', url })).toBeTruthy();
    }
  });
});

describe('invitation policy', () => {
  const schema = invitationSchema('Owner@acme.com');
  it('allows an optional blank row but rejects malformed, duplicate and self invitations', () => {
    expect(schema.safeParse({ members: [{ email: '', role: 'VIEWER' }] }).success).toBe(true);
    for (const emails of [['bad'], ['owner@acme.com'], ['alice@acme.com', 'ALICE@acme.com']]) {
      expect(
        schema.safeParse({ members: emails.map((email) => ({ email, role: 'VIEWER' })) }).success,
      ).toBe(false);
    }
  });
  it('limits a batch to ten members and never offers ownership', () => {
    expect(
      schema.safeParse({
        members: Array.from({ length: 11 }, (_, i) => ({ email: `${i}@acme.com`, role: 'VIEWER' })),
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ members: [{ email: 'alice@acme.com', role: 'ORG_OWNER' }] }).success,
    ).toBe(false);
    expect(allowedInvitationRoles('ORG_OWNER')).toContain('ORG_ADMIN');
    expect(allowedInvitationRoles('ORG_ADMIN')).not.toContain('ORG_ADMIN');
    expect(allowedInvitationRoles('VIEWER')).toEqual([]);
  });
});
