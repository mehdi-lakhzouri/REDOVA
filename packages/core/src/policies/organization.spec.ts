import { describe, expect, it } from 'vitest';
import { validateOrgCreation, validateOrgSlug, validateOrgUpdate } from './organization';

describe('validateOrgSlug (UT-005-01)', () => {
  it.each(['acme-security', 'abc', '0day-lab', `a${'b'.repeat(46)}c`])('accepts %s', (slug) => {
    expect(validateOrgSlug(slug)).toBeNull();
  });

  it.each([
    'a',
    'a1',
    'Acme',
    'Acme!',
    '-acme',
    'acme-',
    'acme security',
    'acme_security',
    `a${'b'.repeat(47)}c`,
    '',
    42,
    undefined,
  ])('rejects %s as invalid', (slug) => {
    expect(validateOrgSlug(slug)).toBe('ORG_SLUG_INVALID');
  });

  it.each(['admin', 'api', 'settings', 'new', 'orgs', 'invitations'])(
    'rejects reserved slug %s',
    (slug) => {
      expect(validateOrgSlug(slug)).toBe('ORG_SLUG_RESERVED');
    },
  );
});

describe('validateOrgCreation', () => {
  const valid = { name: 'Acme Security', slug: 'acme-security' };

  it('accepts a valid organization with or without an https logo', () => {
    expect(validateOrgCreation(valid)).toBeNull();
    expect(validateOrgCreation({ ...valid, logo: 'https://cdn.acme.io/logo.png' })).toBeNull();
  });

  it('checks the slug first, then the name and the logo', () => {
    expect(validateOrgCreation({ ...valid, slug: 'admin' })).toBe('ORG_SLUG_RESERVED');
    expect(validateOrgCreation({ ...valid, name: 'A' })).toBe('ORG_NAME_INVALID');
    expect(validateOrgCreation({ ...valid, name: '  ' })).toBe('ORG_NAME_INVALID');
    expect(validateOrgCreation({ ...valid, name: 'x'.repeat(65) })).toBe('ORG_NAME_INVALID');
    expect(validateOrgCreation({ ...valid, logo: 'http://acme.io/logo.png' })).toBe(
      'ORG_LOGO_INVALID',
    );
  });
});

describe('validateOrgUpdate (UT-005-03)', () => {
  it('rejects a slug change but accepts the current slug', () => {
    expect(validateOrgUpdate('acme-security', { slug: 'acme' })).toBe('ORG_SLUG_IMMUTABLE');
    expect(validateOrgUpdate('acme-security', { slug: 'acme-security', name: 'Acme' })).toBeNull();
  });

  it('validates only the fields present', () => {
    expect(validateOrgUpdate('acme', {})).toBeNull();
    expect(validateOrgUpdate('acme', { name: 'A' })).toBe('ORG_NAME_INVALID');
    expect(validateOrgUpdate('acme', { logo: null })).toBeNull();
    expect(validateOrgUpdate('acme', { logo: 'javascript:alert(1)' })).toBe('ORG_LOGO_INVALID');
    expect(validateOrgUpdate('acme', { logo: `https://a.io/${'x'.repeat(2048)}` })).toBe(
      'ORG_LOGO_INVALID',
    );
  });
});
