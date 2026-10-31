import { auditEventSchema, encodeCursor } from '@redova/contracts';
import type { Prisma } from '@redova/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createVerifiedUser, signIn, uniqueEmail } from './support/factories';
import { enrollMfa } from './support/mfa';
import { addMember, createOrganization, type TestOrganization } from './support/organizations';
import { describeTenantIsolation } from './support/tenant-isolation.kit';
import { createTestApp, type TestApp, WEB_ORIGIN } from './support/test-app';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Inserts audit events directly (the API under test is read-only). */
const seedEvents = (t: TestApp, events: Prisma.AuditEventCreateManyInput[]) =>
  t.prisma.auditEvent.createManyAndReturn({ data: events, select: { id: true } });

describe('UM-008 audit log API', () => {
  let t: TestApp;
  let adminCookie: string;
  let actorId: string;
  beforeAll(async () => {
    t = await createTestApp();
    const admin = await createVerifiedUser(t);
    adminCookie = (await enrollMfa(t, admin)).cookie;
    await t.prisma.user.update({ where: { id: admin.id }, data: { role: 'PLATFORM_ADMIN' } });
    actorId = admin.id;
  });
  afterAll(() => t.close());

  const get = (path: string, cookie: string) =>
    request(t.app.getHttpServer()).get(path).set('cookie', cookie);

  it('IT-008-01 platform admins filter the whole trail; metadata is allow-listed (AC-008-01)', async () => {
    const org = await createOrganization(t);
    await seedEvents(t, [
      {
        action: 'admin.user.banned',
        outcome: 'SUCCESS',
        actorType: 'USER',
        actorUserId: actorId,
        targetType: 'USER',
        targetId: 'u-banned-1',
        metadata: { expiresInDays: 7, banReason: 'must not be returned' },
      },
      {
        action: 'admin.user.banned',
        outcome: 'SUCCESS',
        actorType: 'USER',
        actorUserId: actorId,
        targetType: 'USER',
        targetId: 'u-banned-2',
        metadata: { expiresInDays: null },
      },
      {
        action: 'org.updated',
        outcome: 'SUCCESS',
        actorType: 'USER',
        actorUserId: actorId,
        organizationId: org.id,
        metadata: { fields: ['name'] },
      },
    ]);

    const res = await get(
      '/api/v1/admin/audit-events?action=admin.user.banned&limit=10',
      adminCookie,
    ).expect(200);
    const events = (res.body.data as unknown[]).map((e) => auditEventSchema.parse(e));
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events.every((e) => e.action === 'admin.user.banned')).toBe(true);
    expect(events.map((e) => e.id)).toEqual([...events.map((e) => e.id)].sort().reverse());
    const seeded = events.find((e) => e.targetId === 'u-banned-1')!;
    expect(seeded.actor).toMatchObject({ id: actorId });
    expect(seeded.metadata).toEqual({ expiresInDays: 7 });
    expect(res.body.meta.pagination).toMatchObject({ limit: 10 });

    // Platform scope includes organization events (admin oversight).
    const orgEvents = await get(
      `/api/v1/admin/audit-events?action=org.updated`,
      adminCookie,
    ).expect(200);
    expect(
      (orgEvents.body.data as { organizationId: string }[]).map((e) => e.organizationId),
    ).toContain(org.id);
  });

  describe('organization scope', () => {
    let a: TestOrganization;
    let b: TestOrganization;
    let auditorCookie: string;
    beforeAll(async () => {
      a = await createOrganization(t, 'A');
      b = await createOrganization(t, 'B');
      auditorCookie = (await addMember(t, a.id, 'AUDITOR')).cookie;
    });

    it('IT-008-02 an auditor reads only its organization; viewers and outsiders cannot (AC-008-02)', async () => {
      const [inA] = await seedEvents(t, [
        { action: 'org.updated', outcome: 'SUCCESS', actorType: 'USER', organizationId: a.id },
      ]);
      const [inB] = await seedEvents(t, [
        { action: 'org.updated', outcome: 'SUCCESS', actorType: 'USER', organizationId: b.id },
      ]);
      const res = await get(
        `/api/v1/organizations/${a.id}/audit-events?limit=100`,
        auditorCookie,
      ).expect(200);
      const events = res.body.data as { id: string; organizationId: string }[];
      expect(events.every((e) => e.organizationId === a.id)).toBe(true);
      expect(events.map((e) => e.id)).toContain(inA.id);
      expect(events.map((e) => e.id)).not.toContain(inB.id);

      const foreign = await get(`/api/v1/organizations/${b.id}/audit-events`, auditorCookie);
      expect(foreign.status).toBe(404);
      expect(foreign.body.error.code).toBe('ORGANIZATION_NOT_FOUND');
      const viewer = await addMember(t, a.id, 'VIEWER');
      const denied = await get(`/api/v1/organizations/${a.id}/audit-events`, viewer.cookie);
      expect(denied.status).toBe(403);
      expect(denied.body.error.code).toBe('FORBIDDEN_PERMISSION');
    });

    it('IT-008-03 walks 120 events and validates range and cursor (AC-008-03)', async () => {
      const c = await createOrganization(t, 'C');
      const ownerCookie = c.owner.cookie;
      // A distinct action isolates the 120 seeded events from the organization's own events.
      const action = 'org.member.left';
      await seedEvents(
        t,
        Array.from({ length: 120 }, () => ({
          action,
          outcome: 'SUCCESS' as const,
          actorType: 'USER' as const,
          organizationId: c.id,
        })),
      );
      const expected = await t.prisma.auditEvent.findMany({
        where: { organizationId: c.id, action },
        orderBy: { id: 'desc' },
        select: { id: true },
      });

      const sizes: number[] = [];
      const ids: string[] = [];
      let cursor: string | null = null;
      do {
        const path: string = `/api/v1/organizations/${c.id}/audit-events?action=${action}&limit=50${cursor ? `&cursor=${cursor}` : ''}`;
        const res = await get(path, ownerCookie).expect(200);
        sizes.push(res.body.data.length);
        ids.push(...(res.body.data as { id: string }[]).map((e) => e.id));
        cursor = res.body.meta.pagination.nextCursor as string | null;
      } while (cursor);
      expect(sizes).toEqual([50, 50, 20]);
      expect(new Set(ids).size).toBe(120);
      expect(ids).toEqual(expected.map((e) => e.id));

      const from = new Date(Date.now() - 100 * DAY_MS).toISOString();
      const range = await get(
        `/api/v1/organizations/${c.id}/audit-events?from=${from}`,
        ownerCookie,
      );
      expect(range.status).toBe(400);
      expect(range.body.error.code).toBe('VALIDATION_FAILED');
      for (const tampered of ['not*a*cursor', encodeCursor({ id: 'not-a-uuid' })]) {
        const res = await get(
          `/api/v1/organizations/${c.id}/audit-events?cursor=${tampered}`,
          ownerCookie,
        );
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('INVALID_CURSOR');
      }
    });
  });

  describeTenantIsolation({
    name: 'organization audit events',
    setup: async () => {
      const a = await createOrganization(t, 'ISO-A');
      const b = await createOrganization(t, 'ISO-B');
      return {
        t,
        a: { organizationId: a.id, cookie: a.owner.cookie },
        b: { organizationId: b.id, cookie: b.owner.cookie },
      };
    },
    create: async (app, side) => {
      const [event] = await seedEvents(app, [
        {
          action: 'org.updated',
          outcome: 'SUCCESS',
          actorType: 'USER',
          organizationId: side.organizationId,
        },
      ]);
      return event.id;
    },
    listPath: (organizationId) => `/api/v1/organizations/${organizationId}/audit-events`,
    itemPath: (organizationId, id) => `/api/v1/organizations/${organizationId}/audit-events/${id}`,
  });

  it('IT-008-05 audit events cannot be modified through any path (AC-008-05)', async () => {
    const org = await createOrganization(t);
    const [event] = await seedEvents(t, [
      { action: 'org.updated', outcome: 'SUCCESS', actorType: 'USER', organizationId: org.id },
    ]);
    const http = request(t.app.getHttpServer());
    const paths = [
      '/api/v1/admin/audit-events',
      `/api/v1/admin/audit-events/${event.id}`,
      `/api/v1/organizations/${org.id}/audit-events`,
      `/api/v1/organizations/${org.id}/audit-events/${event.id}`,
    ];
    for (const path of paths) {
      for (const method of ['put', 'patch', 'delete'] as const) {
        const res = await http[method](path)
          .set('origin', WEB_ORIGIN)
          .set('cookie', adminCookie)
          .send({});
        expect([404, 405], `${method} ${path}`).toContain(res.status);
      }
    }
    await expect(
      t.prisma.$executeRaw`UPDATE audit_event SET action = 'tampered' WHERE id = ${event.id}::uuid`,
    ).rejects.toThrow();
    await expect(
      t.prisma.$executeRaw`DELETE FROM audit_event WHERE id = ${event.id}::uuid`,
    ).rejects.toThrow();
  });
});

describe('UM-008 per-account sign-in throttle (AC-008-06, AC-008-07)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ env: { RATE_LIMIT_ENABLED: 'true' } });
  });
  afterAll(() => t.close());

  /** 10 wrong passwords from 10 different IPs, then the correct password from an 11th. */
  const attack = async (email: string, password: string) => {
    const responses = [];
    for (let i = 1; i <= 10; i++) {
      responses.push(
        await api(t)
          .post('/api/auth/sign-in/email', { email, password: 'wrong-password-123' })
          .set('x-forwarded-for', `10.8.${email.length}.${i}`),
      );
    }
    responses.push(
      await api(t)
        .post('/api/auth/sign-in/email', { email, password })
        .set('x-forwarded-for', `10.8.${email.length}.99`),
    );
    return responses.map((r) => ({ status: r.status, body: r.body as unknown }));
  };

  it('IT-008-06 throttles an account across IPs until the window expires', async () => {
    const alice = await createVerifiedUser(t);
    const responses = await attack(alice.email, alice.password);
    expect(responses.slice(0, 10).every((r) => r.status === 401)).toBe(true);
    expect(responses[10]).toEqual({
      status: 429,
      body: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many sign-in attempts. Try again later.' },
    });
    const throttled = await t.prisma.auditEvent.findMany({
      where: { action: 'auth.sign_in.throttled', targetId: alice.id },
    });
    expect(throttled).toHaveLength(1);
    expect(throttled[0]).toMatchObject({ actorType: 'ANONYMOUS', outcome: 'DENIED' });

    const keys = await t.redis.keys('redova:signin-fail:*');
    expect(keys.some((key) => key.includes(alice.email))).toBe(false);
    await t.redis.del(keys);
    await signIn(t, alice, '10.8.200.1');
    expect(await t.redis.keys('redova:signin-fail:*')).toEqual([]);
  });

  it('IT-008-07 answers an unknown email exactly like an existing one', async () => {
    const known = await createVerifiedUser(t, { email: uniqueEmail('known') });
    const unknownEmail = uniqueEmail('ghost');
    const knownResponses = await attack(known.email, known.password);
    const unknownResponses = await attack(unknownEmail, known.password);
    expect(unknownResponses).toEqual(knownResponses);
  });
});
