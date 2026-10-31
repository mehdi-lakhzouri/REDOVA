import type { Response } from 'supertest';
import request from 'supertest';
import type { TestApp } from './test-app';
import { WEB_ORIGIN } from './test-app';

export const DEFAULT_PASSWORD = 'correct-horse-battery-staple';

let sequence = 0;
/** Unique, readable test email. */
export const uniqueEmail = (prefix = 'user'): string =>
  `${prefix}-${Date.now()}-${++sequence}@redova.test`;

export interface TestUser {
  id: string;
  email: string;
  password: string;
  name: string;
}

/** Creates a user through Better Auth (real hashing and hooks). Unverified unless `verified` is set. */
export const createUser = async (
  t: TestApp,
  options: { email?: string; password?: string; name?: string; verified?: boolean } = {},
): Promise<TestUser> => {
  const email = options.email ?? uniqueEmail();
  const password = options.password ?? DEFAULT_PASSWORD;
  const name = options.name ?? 'Test User';
  await t.auth.api.signUpEmail({ body: { name, email, password } });
  const user = await t.prisma.user.update({
    where: { email },
    data: { emailVerified: options.verified ?? false },
  });
  return { id: user.id, email, password, name };
};

export const createVerifiedUser = (t: TestApp, options: Parameters<typeof createUser>[1] = {}) =>
  createUser(t, { ...options, verified: true });

/** Joins the `Set-Cookie` headers of a response into a `Cookie` request header. */
export const cookieFrom = (res: Response): string =>
  ([] as string[])
    .concat(res.headers['set-cookie'] ?? [])
    .map((cookie) => cookie.split(';')[0])
    .join('; ');

/** Signs in over HTTP and returns the session cookie header. */
export const signIn = async (
  t: TestApp,
  user: Pick<TestUser, 'email' | 'password'>,
  ip = '10.0.0.1',
): Promise<string> => {
  const res = await request(t.app.getHttpServer())
    .post('/api/auth/sign-in/email')
    .set('origin', WEB_ORIGIN)
    .set('x-forwarded-for', ip)
    .send({ email: user.email, password: user.password });
  if (res.status !== 200)
    throw new Error(`sign-in failed: ${res.status} ${JSON.stringify(res.body)}`);
  return cookieFrom(res);
};

/** `supertest` agent bound to the app with the trusted Origin header. */
export const api = (t: TestApp) => {
  const http = request(t.app.getHttpServer());
  return {
    get: (path: string, cookie?: string) => http.get(path).set('cookie', cookie ?? ''),
    post: (path: string, body: object = {}, cookie?: string) =>
      http
        .post(path)
        .set('origin', WEB_ORIGIN)
        .set('cookie', cookie ?? '')
        .send(body),
  };
};
