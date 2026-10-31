import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import {
  adminSessionSchema,
  adminUserDetailSchema,
  adminUserSummarySchema,
  encodeCursor,
} from '@redova/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  api,
  createUser,
  createVerifiedUser,
  signIn,
  type TestUser,
  uniqueEmail,
} from './support/factories';
import { enrollMfa, signInWithTotp } from './support/mfa';
import { createTestApp, type TestApp, WEB_ORIGIN } from './support/test-app';

const DAY_MS = 24 * 60 * 60 * 1000;
const BAN = { reason: 'Credential stuffing source', expiresInDays: 7 };
const FORBIDDEN_KEYS = ['password', 'token', 'secret', 'backupCodes'];

interface Admin {
  user: TestUser;
  cookie: string;
  totpURI: string;
}

/** Recursively collects every object key of a JSON value. */
const keysOf = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => [key, ...keysOf(child)]);
  }
  return [];
};

describe('UM-007 admin user management', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  const admin = (cookie: string, origin = WEB_ORIGIN) => {
    const http = request(t.app.getHttpServer());
    const base = '/api/v1/admin/users';
    return {
      get: (path = '') => http.get(`${base}${path}`).set('cookie', cookie),
      put: (path: string, body: object) =>
        http.put(`${base}${path}`).set('origin', origin).set('cookie', cookie).send(body),
      delete: (path: string) =>
        http.delete(`${base}${path}`).set('origin', origin).set('cookie', cookie),
    };
  };

  /** A PLATFORM_ADMIN with real TOTP enrollment and a fresh session. */
  const makeAdmin = async (): Promise<Admin> => {
    const user = await createVerifiedUser(t);
    const { cookie, totpURI } = await enrollMfa(t, user);
    await t.prisma.user.update({ where: { id: user.id }, data: { role: 'PLATFORM_ADMIN' } });
    return { user, cookie, totpURI };
  };

  const auditsFor = (action: string, targetId: string) =>
    t.prisma.auditEvent.findMany({ where: { action, targetId } });
  const sessionOf = async (cookie: string) =>
    (await api(t).get('/api/auth/get-session', cookie)).body as { user: { id: string } } | null;

  let ada: Admin;
  beforeAll(async () => {
    ada = await makeAdmin();
  });

  it('IT-007-01 only MFA-enabled platform admins reach the admin API (AC-007-01)', async () => {
    const user = await createVerifiedUser(t);
    const userCookie = await signIn(t, user);
    const noMfa = await createVerifiedUser(t);
    const noMfaCookie = await signIn(t, noMfa);
    await t.prisma.user.update({ where: { id: noMfa.id }, data: { role: 'PLATFORM_ADMIN' } });

    const asUser = await admin(userCookie).get();
    expect(asUser.status).toBe(403);
    expect(asUser.body.error.code).toBe('FORBIDDEN_PERMISSION');
    const asNoMfa = await admin(noMfaCookie).get();
    expect(asNoMfa.status).toBe(403);
    expect(asNoMfa.body.error.code).toBe('MFA_ENROLLMENT_REQUIRED');
    await admin(ada.cookie).get().expect(200);
  });

  it('IT-007-02 walks 45 users with cursors, without gaps or duplicates (AC-007-02)', async () => {
    const prefix = `page${Date.now().toString(36)}`;
    const base = Date.now();
    await t.prisma.user.createMany({
      data: Array.from({ length: 45 }, (_, i) => ({
        id: randomUUID(),
        name: `${prefix} ${i}`,
        email: `${prefix}-${i}@redova.test`,
        emailVerified: true,
        // Groups of three share a timestamp: the id breaks the tie.
        createdAt: new Date(base - Math.floor(i / 3) * 1000),
      })),
    });
    const expected = await t.prisma.user.findMany({
      where: { email: { startsWith: prefix } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });

    const pages: { ids: string[]; hasMore: boolean; nextCursor: string | null }[] = [];
    let cursor: string | null = null;
    do {
      const query: string = `?q=${prefix}&limit=20${cursor ? `&cursor=${cursor}` : ''}`;
      const res = await admin(ada.cookie).get(query).expect(200);
      const { pagination } = res.body.meta as {
        pagination: { hasMore: boolean; nextCursor: string | null; limit: number };
      };
      pages.push({
        ids: (res.body.data as { id: string }[]).map((u) => u.id),
        hasMore: pagination.hasMore,
        nextCursor: pagination.nextCursor,
      });
      cursor = pagination.nextCursor;
    } while (cursor);

    expect(pages.map((p) => p.ids.length)).toEqual([20, 20, 5]);
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false]);
    expect(pages[2].nextCursor).toBeNull();
    expect(pages.flatMap((p) => p.ids)).toEqual(expected.map((u) => u.id));

    const valid = pages[0].nextCursor!;
    for (const tampered of [`${valid.slice(0, -2)}!!`, encodeCursor({ id: 'missing-user' })]) {
      const res = await admin(ada.cookie).get(`?cursor=${encodeURIComponent(tampered)}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_CURSOR');
    }
  });

  it('IT-007-03 searches by case-insensitive prefix and filters by status (AC-007-03)', async () => {
    const prefix = `ali${Date.now().toString(36)}`;
    const make = (email: string, name: string, banned: boolean) => ({
      id: randomUUID(),
      email,
      name,
      banned,
      emailVerified: true,
    });
    const users = [
      make(`${prefix}-ce@redova.test`, 'Alice', true),
      make(`zed-${prefix}@redova.test`, `${prefix.toUpperCase()} Name`, true),
      make(`${prefix}-active@redova.test`, 'Active', false),
      make(`bob-${prefix}@redova.test`, 'Bob', true),
    ];
    await t.prisma.user.createMany({ data: users });
    const res = await admin(ada.cookie).get(`?q=${prefix}&status=banned`).expect(200);
    const ids = (res.body.data as { id: string }[]).map((u) => u.id).sort();
    expect(ids).toEqual([users[0].id, users[1].id].sort());
  });

  describe('bans', () => {
    it('IT-007-04/05/06 a ban is immediate, generic for the user, audited once (AC-007-04..06)', async () => {
      const bob = await createVerifiedUser(t);
      const jarA = await signIn(t, bob, '10.7.0.1');
      const jarB = await signIn(t, bob, '10.7.0.2');

      const res = await admin(ada.cookie).put(`/${bob.id}/ban`, BAN).expect(200);
      expect(adminUserDetailSchema.parse(res.body.data)).toMatchObject({
        banned: true,
        banReason: BAN.reason,
      });
      const expires = new Date(res.body.data.banExpires as string).getTime();
      expect(Math.abs(expires - (Date.now() + 7 * DAY_MS))).toBeLessThan(60_000);
      expect(await sessionOf(jarA)).toBeNull();
      expect(await sessionOf(jarB)).toBeNull();

      const signInAttempt = await api(t).post('/api/auth/sign-in/email', {
        email: bob.email,
        password: bob.password,
      });
      expect(signInAttempt.status).toBe(403);
      expect(signInAttempt.body.code).toBe('BANNED_USER');
      expect(JSON.stringify(signInAttempt.body)).not.toContain(BAN.reason);

      const repeat = await admin(ada.cookie).put(`/${bob.id}/ban`, BAN).expect(200);
      expect(repeat.body.data.banExpires).toBe(res.body.data.banExpires);
      const audits = await auditsFor('admin.user.banned', bob.id);
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({ actorUserId: ada.user.id, metadata: { expiresInDays: 7 } });
      expect(JSON.stringify(audits[0].metadata)).not.toContain(BAN.reason);

      for (const body of [res.body, repeat.body]) {
        expect(keysOf(body).filter((key) => FORBIDDEN_KEYS.includes(key))).toEqual([]);
      }
    });

    it('IT-007-07 refuses self-bans and bans of other platform admins (AC-007-07)', async () => {
      const self = await admin(ada.cookie).put(`/${ada.user.id}/ban`, BAN);
      expect(self.status).toBe(400);
      expect(self.body.error.code).toBe('YOU_CANNOT_BAN_YOURSELF');
      const other = await makeAdmin();
      const res = await admin(ada.cookie).put(`/${other.user.id}/ban`, BAN);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ADMIN_TARGET_IS_PLATFORM_ADMIN');
      const banned = await t.prisma.user.count({
        where: { id: { in: [ada.user.id, other.user.id] }, banned: true },
      });
      expect(banned).toBe(0);
    });

    it('IT-007-08 unbanning is idempotent and audited once (AC-007-08)', async () => {
      const bob = await createVerifiedUser(t);
      await admin(ada.cookie).put(`/${bob.id}/ban`, BAN).expect(200);
      await admin(ada.cookie).delete(`/${bob.id}/ban`).expect(204);
      await signIn(t, bob);
      await admin(ada.cookie).delete(`/${bob.id}/ban`).expect(204);
      expect(await auditsFor('admin.user.unbanned', bob.id)).toHaveLength(1);
    });

    it('IT-007-09 an expired temporary ban is lifted at sign-in (AC-007-09)', async () => {
      const bob = await createVerifiedUser(t);
      await admin(ada.cookie)
        .put(`/${bob.id}/ban`, { ...BAN, expiresInDays: 1 })
        .expect(200);
      await t.prisma.user.update({
        where: { id: bob.id },
        data: { banExpires: new Date(Date.now() - 1000) },
      });
      await signIn(t, bob);
      const user = await t.prisma.user.findUniqueOrThrow({ where: { id: bob.id } });
      expect(user).toMatchObject({ banned: false, banReason: null, banExpires: null });
    });

    it('IT-007-14 a cross-origin admin mutation is blocked (AC-007-14)', async () => {
      const bob = await createVerifiedUser(t);
      const res = await admin(ada.cookie, 'https://evil.example').put(`/${bob.id}/ban`, BAN);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ORIGIN_NOT_ALLOWED');
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: bob.id } })).banned).toBe(false);
    });

    it('IT-007-15 native admin endpoints are not reachable over HTTP (AC-007-15)', async () => {
      const bob = await createVerifiedUser(t);
      const res = await api(t).post('/api/auth/admin/ban-user', { userId: bob.id }, ada.cookie);
      expect(res.status).toBe(404);
    });
  });

  it('IT-007-10 role changes are guarded, including concurrent mutual demotion (AC-007-10)', async () => {
    await t.prisma.user.updateMany({
      where: { role: 'PLATFORM_ADMIN', id: { not: ada.user.id } },
      data: { role: 'USER' },
    });
    const carl = await createVerifiedUser(t);
    const carlCookie = await signIn(t, carl);

    const promoted = await admin(ada.cookie).put(`/${carl.id}/role`, { role: 'PLATFORM_ADMIN' });
    expect(promoted.status).toBe(200);
    expect(promoted.body.data.role).toBe('PLATFORM_ADMIN');
    const [changed] = await auditsFor('admin.user.role_changed', carl.id);
    expect(changed).toMatchObject({
      actorUserId: ada.user.id,
      metadata: { previousRole: 'USER', newRole: 'PLATFORM_ADMIN' },
    });
    expect((await admin(carlCookie).get()).body.error.code).toBe('MFA_ENROLLMENT_REQUIRED');

    const self = await admin(ada.cookie).put(`/${ada.user.id}/role`, { role: 'USER' });
    expect(self.status).toBe(403);
    expect(self.body.error.code).toBe('ADMIN_SELF_ROLE_CHANGE_FORBIDDEN');
    await admin(ada.cookie).put(`/${carl.id}/role`, { role: 'USER' }).expect(200);
    const again = await admin(ada.cookie).put(`/${carl.id}/role`, { role: 'USER' }).expect(200);
    expect(again.body.data.role).toBe('USER');
    expect(await auditsFor('admin.user.role_changed', carl.id)).toHaveLength(2);

    // Two admins demote each other at the same time: exactly one wins.
    const dan = await makeAdmin();
    const results = await Promise.all([
      admin(ada.cookie).put(`/${dan.user.id}/role`, { role: 'USER' }),
      admin(dan.cookie).put(`/${ada.user.id}/role`, { role: 'USER' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409)?.body.error.code).toBe('LAST_PLATFORM_ADMIN');
    expect(await t.prisma.user.count({ where: { role: 'PLATFORM_ADMIN' } })).toBe(1);

    // Restore Ada for the next tests when Dan won the race.
    if (results[1].status === 200) {
      await t.prisma.user.update({ where: { id: ada.user.id }, data: { role: 'PLATFORM_ADMIN' } });
    }
  });

  it('IT-007-11 a stale admin session must re-authenticate for mutations only (AC-007-11)', async () => {
    const stale = await makeAdmin();
    await t.prisma.session.updateMany({
      where: { userId: stale.user.id },
      data: { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    });
    const bob = await createVerifiedUser(t);
    await admin(stale.cookie).get(`/${bob.id}`).expect(200);
    const denied = await admin(stale.cookie).put(`/${bob.id}/ban`, BAN);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('REAUTHENTICATION_REQUIRED');
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: bob.id } })).banned).toBe(false);

    const fresh = await signInWithTotp(t, stale.user, stale.totpURI);
    await admin(fresh).put(`/${bob.id}/ban`, BAN).expect(200);
  });

  describe('sessions', () => {
    it('IT-007-12 lists sessions without tokens and revokes one by id (AC-007-12)', async () => {
      const bob = await createVerifiedUser(t);
      const s1 = await signIn(t, bob, '10.7.1.1');
      const s2 = await signIn(t, bob, '10.7.1.2');
      const list = await admin(ada.cookie).get(`/${bob.id}/sessions`).expect(200);
      const sessions = (list.body.data as unknown[]).map((s) => adminSessionSchema.parse(s));
      expect(sessions).toHaveLength(2);
      expect(list.body.meta.pagination ?? null).toBeNull();
      expect(keysOf(list.body).filter((key) => FORBIDDEN_KEYS.includes(key))).toEqual([]);

      const rows = await t.prisma.session.findMany({ where: { userId: bob.id } });
      const s1Row = rows.find((r) => s1.includes(r.token))!;
      await admin(ada.cookie).delete(`/${bob.id}/sessions/${s1Row.id}`).expect(204);
      expect(await sessionOf(s1)).toBeNull();
      expect((await sessionOf(s2))?.user.id).toBe(bob.id);
      const [audit] = await auditsFor('admin.user.session_revoked', s1Row.id);
      expect(audit).toMatchObject({ actorUserId: ada.user.id, metadata: { userId: bob.id } });

      const other = await createVerifiedUser(t);
      const otherCookie = await signIn(t, other);
      const foreign = await t.prisma.session.findFirstOrThrow({ where: { userId: other.id } });
      const res = await admin(ada.cookie).delete(`/${bob.id}/sessions/${foreign.id}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('SESSION_NOT_FOUND');
      expect((await sessionOf(otherCookie))?.user.id).toBe(other.id);
    });

    it('IT-007-13 signs a user out everywhere, idempotently (AC-007-13)', async () => {
      const bob = await createVerifiedUser(t);
      const s1 = await signIn(t, bob, '10.7.2.1');
      const s2 = await signIn(t, bob, '10.7.2.2');
      await admin(ada.cookie).delete(`/${bob.id}/sessions`).expect(204);
      expect(await sessionOf(s1)).toBeNull();
      expect(await sessionOf(s2)).toBeNull();
      await admin(ada.cookie).delete(`/${bob.id}/sessions`).expect(204);
      const audits = await auditsFor('admin.user.sessions_revoked', bob.id);
      expect(audits).toHaveLength(1);
      expect(audits[0].metadata).toEqual({ count: 2 });
    });
  });

  it('IT-007-04 every admin payload matches the strict output schemas (AC-007-04)', async () => {
    const bob = await createVerifiedUser(t);
    const list = await admin(ada.cookie).get('?limit=5').expect(200);
    for (const item of list.body.data as unknown[]) adminUserSummarySchema.parse(item);
    const detail = await admin(ada.cookie).get(`/${bob.id}`).expect(200);
    adminUserDetailSchema.parse(detail.body.data);
    for (const body of [list.body, detail.body]) {
      expect(keysOf(body).filter((key) => FORBIDDEN_KEYS.includes(key))).toEqual([]);
    }
    const missing = await admin(ada.cookie).get('/missing-user');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('USER_NOT_FOUND');
  });

  it('documents every admin route in the OpenAPI document (DoD)', async () => {
    const res = await request(t.app.getHttpServer()).get('/api/v1/docs-json').expect(200);
    const paths = Object.keys((res.body as { paths: object }).paths);
    expect(paths).toEqual(
      expect.arrayContaining([
        '/api/v1/admin/users',
        '/api/v1/admin/users/{userId}',
        '/api/v1/admin/users/{userId}/ban',
        '/api/v1/admin/users/{userId}/role',
        '/api/v1/admin/users/{userId}/sessions',
        '/api/v1/admin/users/{userId}/sessions/{sessionId}',
      ]),
    );
  });

  describe('bootstrap CLI (AC-007-16)', () => {
    const cli = resolve(__dirname, '../dist/cli/admin-promote.js');
    const run = (...args: string[]) =>
      spawnSync(process.execPath, [cli, ...args], {
        env: { ...process.env, DATABASE_URL: t.env.DATABASE_URL },
        encoding: 'utf8',
      });

    it('IT-007-16 promotes the first admin, then requires --force', async () => {
      await t.prisma.user.updateMany({
        where: { role: 'PLATFORM_ADMIN' },
        data: { role: 'USER' },
      });
      const first = await createVerifiedUser(t);
      const second = await createVerifiedUser(t);
      const unverified = await createUser(t);

      const ok = run('--email', first.email);
      expect(ok.status, ok.stderr).toBe(0);
      expect(ok.stdout).toContain('enable MFA');
      const [audit] = await auditsFor('admin.bootstrap.promoted', first.id);
      expect(audit).toMatchObject({ actorType: 'SYSTEM', metadata: { forced: false } });

      expect(run('--email', second.email).status).toBe(1);
      expect(run('--email', unverified.email).status).toBe(1);
      expect(run('--email', uniqueEmail('ghost')).status).toBe(1);
      expect(await t.prisma.user.count({ where: { role: 'PLATFORM_ADMIN' } })).toBe(1);

      expect(run('--email', second.email, '--force').status).toBe(0);
      const [forced] = await auditsFor('admin.bootstrap.promoted', second.id);
      expect(forced.metadata).toEqual({ forced: true });
    });
  });
});
