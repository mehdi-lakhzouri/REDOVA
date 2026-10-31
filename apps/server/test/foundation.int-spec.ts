import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DISABLED_PATHS } from '@redova/auth';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditService } from '../src/audit/audit.service';
import { ProbeController } from './support/probe.controller';
import { createTestApp, type TestApp, WEB_ORIGIN } from './support/test-app';

describe('UM-001 foundation (integration)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    t = await createTestApp({ extra: { controllers: [ProbeController] } });
    http = request(t.app.getHttpServer());
  });
  afterAll(() => t.close());

  it('IT-001-01 health uses the envelope with db and redis up (AC-001-02)', async () => {
    const res = await http.get('/api/v1/health').expect(200);
    expect(res.body).toEqual({
      data: { status: 'ok', db: 'up', redis: 'up' },
      meta: { requestId: expect.any(String) },
      error: null,
    });
    expect(res.body.meta.requestId).not.toBe('');
  });

  it('IT-001-02 mounts Better Auth once at /api/auth (AC-001-04)', async () => {
    await http.get('/api/auth/ok').expect(200, { ok: true });
    await http.get('/api/v1/api/auth/ok').expect(404);
    await http.get('/api/api/auth/ok').expect(404);
  });

  it('IT-001-04 renders validation errors in the envelope (AC-001-08)', async () => {
    const res = await http.get('/api/v1/__test/validate?limit=500').expect(400);
    expect(res.body).toMatchObject({
      data: null,
      error: { code: 'VALIDATION_FAILED', details: [{ path: 'limit' }] },
    });
    const ok = await http.get('/api/v1/__test/validate?limit=5').expect(200);
    expect(ok.body).toEqual({
      data: { limit: 5 },
      meta: { requestId: expect.any(String) },
      error: null,
    });
  });

  it('IT-001-04 masks unknown errors (AC-001-09)', async () => {
    const res = await http.get('/api/v1/__test/boom').expect(500);
    expect(res.body.error).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
    });
    expect(JSON.stringify(res.body)).not.toMatch(/secret|stack/i);
  });

  it('IT-001-05 protects routes by default (AC-001-10)', async () => {
    const res = await http.get('/api/v1/__test/protected').expect(401);
    expect(res.body).toMatchObject({ data: null, error: { code: 'UNAUTHENTICATED' } });
  });

  it('moves pagination into meta for paginated results', async () => {
    const res = await http.get('/api/v1/__test/paginated').expect(200);
    expect(res.body.meta.pagination).toEqual({ limit: 20, nextCursor: null, hasMore: false });
  });

  it('IT-001-06 disabled Better Auth paths return 404 over HTTP but work server-side (AC-001-11)', async () => {
    for (const path of DISABLED_PATHS) {
      const res = await http.post(`/api/auth${path}`).set('origin', WEB_ORIGIN).send({});
      expect(res.status, path).toBe(404);
      const get = await http.get(`/api/auth${path}`);
      expect(get.status, path).toBe(404);
    }

    // Server-side auth.api calls still work for a platform admin session.
    await t.auth.api.signUpEmail({
      body: { name: 'Ada', email: 'ada@redova.io', password: 'correct-horse-battery' },
    });
    await t.prisma.user.update({
      where: { email: 'ada@redova.io' },
      data: { emailVerified: true, role: 'PLATFORM_ADMIN' },
    });
    const { headers } = await t.auth.api.signInEmail({
      body: { email: 'ada@redova.io', password: 'correct-horse-battery' },
      returnHeaders: true,
    });
    const cookie = headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
    const result = (await t.auth.api.listUsers({
      headers: new Headers({ cookie }),
      query: {},
    })) as unknown as {
      users: { email: string }[];
    };
    expect(result.users.map((u) => u.email)).toContain('ada@redova.io');
  });

  it('IT-001-09 propagates the request id (AC-001-14)', async () => {
    const res = await http.get('/api/v1/health').set('x-request-id', 'test-123').expect(200);
    expect(res.headers['x-request-id']).toBe('test-123');
    expect(res.body.meta.requestId).toBe('test-123');
    const generated = await http.get('/api/v1/health').set('x-request-id', 'bad id with spaces');
    expect(generated.headers['x-request-id']).not.toBe('bad id with spaces');
    expect(generated.body.meta.requestId).toBe(generated.headers['x-request-id']);
  });

  it('IT-001-10 AuditService persists events with request context and rejects unknown actions (AC-001-15)', async () => {
    const audit = t.app.get(AuditService);
    await audit.record({
      action: 'auth.sign_out',
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorUserId: 'user-1',
    });
    const row = await t.prisma.auditEvent.findFirstOrThrow({ where: { actorUserId: 'user-1' } });
    expect(row).toMatchObject({ action: 'auth.sign_out', outcome: 'SUCCESS' });
    await expect(
      audit.record({ action: 'auth.unknown' as never, outcome: 'SUCCESS', actorType: 'USER' }),
    ).rejects.toThrow();
  });

  it('records sign-up and session creation in the audit trail', async () => {
    await http
      .post('/api/auth/sign-up/email')
      .set('origin', WEB_ORIGIN)
      .set('x-request-id', 'signup-req')
      .send({ name: 'Bob', email: 'bob@redova.io', password: 'correct-horse-battery' })
      .expect(200);
    const event = await t.prisma.auditEvent.findFirstOrThrow({
      where: { action: 'auth.sign_up.completed', requestId: 'signup-req' },
    });
    expect(event.targetType).toBe('USER');
  });

  it('IT-001-12 sets the security headers (AC-001-16)', async () => {
    const res = await http.get('/api/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['content-security-policy']).toBe(
      "default-src 'none';frame-ancestors 'none'",
    );
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('UM-001 rate limiting (IT-001-07, AC-001-12)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ env: { RATE_LIMIT_ENABLED: 'true' } });
  });
  afterAll(() => t.close());

  it('rejects the 6th sign-in from one IP within a minute with X-Retry-After', async () => {
    const http = request(t.app.getHttpServer());
    const statuses: number[] = [];
    let retryAfter: string | undefined;
    for (let i = 0; i < 6; i++) {
      const res = await http
        .post('/api/auth/sign-in/email')
        .set('origin', WEB_ORIGIN)
        .set('x-forwarded-for', '10.0.0.6')
        .send({ email: 'nobody@redova.io', password: 'wrong-password-123' });
      statuses.push(res.status);
      retryAfter = res.headers['x-retry-after'];
    }
    expect(statuses.slice(0, 5).every((s) => s !== 429)).toBe(true);
    expect(statuses[5]).toBe(429);
    expect(Number(retryAfter)).toBeGreaterThan(0);
    const keys = await t.redis.keys('redova:rate-limit:*');
    expect(keys.length).toBeGreaterThan(0);
  });
});

describe('UM-001 fail-fast configuration (IT-001-11, AC-001-03)', () => {
  it('exits non-zero and names the invalid variable without listening', () => {
    const main = resolve(__dirname, '../dist/main.js');
    expect(existsSync(main), 'run `pnpm build` before the integration tests').toBe(true);
    const result = spawnSync(process.execPath, [main], {
      env: { ...process.env, BETTER_AUTH_SECRET: 'short', PORT: '0' },
      encoding: 'utf8',
      timeout: 20_000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('BETTER_AUTH_SECRET');
  });
});
