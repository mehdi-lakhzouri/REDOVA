import type { Response } from 'supertest';
import { api, signIn, type TestUser } from './factories';
import type { TestApp } from './test-app';
import { totpFromUri } from './totp';

/** Minimal cookie jar: later `Set-Cookie` values win, expired (empty) cookies are dropped. */
export const mergeCookies = (jar: string, res: Response): string => {
  const cookies = new Map(
    jar
      .split('; ')
      .filter(Boolean)
      .map((pair) => [pair.split('=')[0], pair] as const),
  );
  for (const header of ([] as string[]).concat(res.headers['set-cookie'] ?? [])) {
    const pair = header.split(';')[0];
    const [name, value] = [pair.split('=')[0], pair.slice(pair.indexOf('=') + 1)];
    if (value) cookies.set(name, pair);
    else cookies.delete(name);
  }
  return [...cookies.values()].join('; ');
};

export interface MfaEnrollment {
  /** Session cookie after enrollment (confirmation replaces the session). */
  cookie: string;
  totpURI: string;
  backupCodes: string[];
}

/** Enables TOTP over HTTP and confirms it with a computed code. */
export const enrollMfa = async (t: TestApp, user: TestUser): Promise<MfaEnrollment> => {
  const cookie = await signIn(t, user);
  const enabled = await api(t)
    .post('/api/auth/two-factor/enable', { password: user.password }, cookie)
    .expect(200);
  const { totpURI, backupCodes } = enabled.body as { totpURI: string; backupCodes: string[] };
  const verified = await api(t)
    .post('/api/auth/two-factor/verify-totp', { code: totpFromUri(totpURI) }, cookie)
    .expect(200);
  return { cookie: mergeCookies(cookie, verified), totpURI, backupCodes };
};

/** Password + TOTP sign-in; returns the session cookie jar. */
export const signInWithTotp = async (
  t: TestApp,
  user: TestUser,
  totpURI: string,
): Promise<string> => {
  const started = await api(t)
    .post('/api/auth/sign-in/email', { email: user.email, password: user.password })
    .expect(200);
  const jar = mergeCookies('', started);
  const verified = await api(t)
    .post('/api/auth/two-factor/verify-totp', { code: totpFromUri(totpURI) }, jar)
    .expect(200);
  return mergeCookies(jar, verified);
};
