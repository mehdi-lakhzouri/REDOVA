import { encodeCursor } from '@redova/contracts';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './test-app';
import { WEB_ORIGIN } from './test-app';

export interface TenantSide {
  organizationId: string;
  cookie: string;
}

export interface TenantIsolationOptions {
  /** Name of the tenant-owned resource under test. */
  name: string;
  /** Two organizations with a member of each that has read access to the resource. */
  setup: () => Promise<{ t: TestApp; a: TenantSide; b: TenantSide }>;
  /** Creates one resource in the given tenant and returns its id. */
  create: (t: TestApp, side: TenantSide) => Promise<string>;
  /** Collection path, e.g. `/api/v1/organizations/:id/agents`. */
  listPath: (organizationId: string) => string;
  /** Single-resource path. */
  itemPath: (organizationId: string, id: string) => string;
  /** Optional: create endpoint path, to check that a body/query organizationId is ignored. */
  createPath?: (organizationId: string) => string;
}

/**
 * Cross-tenant contract tests TENANT-ISO-01…04 (README §10.3). Every tenant-scoped module must run
 * this kit against its endpoints as part of its Definition of Done.
 */
export const describeTenantIsolation = (options: TenantIsolationOptions) =>
  describe(`tenant isolation: ${options.name}`, () => {
    let ctx: Awaited<ReturnType<TenantIsolationOptions['setup']>>;
    let itemA: string;
    let itemB: string;

    const get = (path: string, cookie: string) =>
      request(ctx.t.app.getHttpServer()).get(path).set('cookie', cookie);

    beforeAll(async () => {
      ctx = await options.setup();
      itemA = await options.create(ctx.t, ctx.a);
      itemB = await options.create(ctx.t, ctx.b);
      await options.create(ctx.t, ctx.b);
    });

    it('TENANT-ISO-01 lists only the caller tenant resources', async () => {
      const res = await get(options.listPath(ctx.a.organizationId), ctx.a.cookie).expect(200);
      const ids = (res.body.data as Array<{ id: string }>).map((item) => item.id);
      expect(ids).toContain(itemA);
      expect(ids).not.toContain(itemB);
    });

    it("TENANT-ISO-02 returns 404 for another tenant's resource, like a missing id", async () => {
      const foreign = await get(options.itemPath(ctx.a.organizationId, itemB), ctx.a.cookie);
      const missing = await get(
        options.itemPath(ctx.a.organizationId, 'does-not-exist'),
        ctx.a.cookie,
      );
      expect(foreign.status).toBe(404);
      expect(foreign.body.error.code).toBe(missing.body.error.code);
      // And through the other tenant's path, the caller is not even a member.
      const viaOtherPath = await get(options.itemPath(ctx.b.organizationId, itemB), ctx.a.cookie);
      expect(viaOtherPath.status).toBe(404);
    });

    it('TENANT-ISO-03 a cursor from another tenant never yields foreign rows', async () => {
      const cursor = encodeCursor({ id: itemB });
      const res = await get(
        `${options.listPath(ctx.a.organizationId)}?cursor=${cursor}`,
        ctx.a.cookie,
      );
      expect([200, 400]).toContain(res.status);
      if (res.status === 200) {
        const orgs = (res.body.data as Array<{ organizationId?: string }>).map(
          (i) => i.organizationId,
        );
        expect(orgs.every((org) => org === undefined || org === ctx.a.organizationId)).toBe(true);
      } else {
        expect(res.body.error.code).toBe('INVALID_CURSOR');
      }
    });

    it('TENANT-ISO-04 ignores an organizationId supplied in the query or body', async () => {
      const res = await get(
        `${options.listPath(ctx.a.organizationId)}?organizationId=${ctx.b.organizationId}`,
        ctx.a.cookie,
      );
      if (res.status === 200) {
        const ids = (res.body.data as Array<{ id: string }>).map((item) => item.id);
        expect(ids).not.toContain(itemB);
      } else {
        expect(res.status).toBe(400);
      }
      if (options.createPath) {
        const created = await request(ctx.t.app.getHttpServer())
          .post(options.createPath(ctx.a.organizationId))
          .set('origin', WEB_ORIGIN)
          .set('cookie', ctx.a.cookie)
          .send({ name: 'smuggled', organizationId: ctx.b.organizationId });
        expect(created.status).toBe(201);
        expect(created.body.data.organizationId).toBe(ctx.a.organizationId);
      }
    });
  });
