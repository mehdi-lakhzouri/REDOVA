import { describe, expect, it } from 'vitest';
import { DEFAULT_AUTHENTICATED_ROUTE, safeRedirectPath, withNext } from './redirects';

describe('safeRedirectPath', () => {
  it.each(['/dashboard', '/settings/profile?tab=security', '/a#b'])('keeps %s', (path) => {
    expect(safeRedirectPath(path)).toBe(path);
  });

  it.each([
    null,
    undefined,
    '',
    'dashboard',
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    '/dash\nboard',
    '/dash\u0000board',
  ])('rejects %j', (value) => {
    expect(safeRedirectPath(value)).toBe(DEFAULT_AUTHENTICATED_ROUTE);
  });

  it('uses the given fallback', () => {
    expect(safeRedirectPath('//evil.example', '/sign-in')).toBe('/sign-in');
  });
});

describe('withNext', () => {
  it('appends an encoded safe destination', () => {
    expect(withNext('/sign-in', '/dashboard?tab=1')).toBe('/sign-in?next=%2Fdashboard%3Ftab%3D1');
  });

  it('drops an unsafe destination', () => {
    expect(withNext('/sign-in', '//evil.example')).toBe('/sign-in');
  });
});
