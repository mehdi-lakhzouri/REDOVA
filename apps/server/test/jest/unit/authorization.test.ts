import { describe, expect, it, jest } from '@jest/globals';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PrismaClient } from '@redova/db';
import type { AuditService } from '../../../src/audit/audit.service';
import {
  requireSession,
  type AuthenticatedRequest,
} from '../../../src/authz/authenticated-request';
import { FreshSessionGuard } from '../../../src/authz/fresh-session.guard';
import { ORG_PERMISSIONS_KEY, OrgPermissionGuard } from '../../../src/authz/org-permission.guard';
import { OriginGuard } from '../../../src/authz/origin.guard';
import { PlatformAdminGuard } from '../../../src/authz/platform-admin.guard';

const session = (overrides: Record<string, unknown> = {}) => ({
  session: { id: 'session', createdAt: new Date() },
  user: {
    id: 'actor',
    email: 'actor@example.test',
    emailVerified: true,
    role: 'USER',
    ...overrides,
  },
});
const request = (fields: Record<string, unknown> = {}) =>
  ({
    session: session(),
    params: { organizationId: 'org-a' },
    method: 'GET',
    get: () => undefined,
    ...fields,
  }) as unknown as AuthenticatedRequest;
const handler = () => undefined;
Reflect.defineMetadata(ORG_PERMISSIONS_KEY, { auditLog: ['read'] }, handler);
const context = (req: AuthenticatedRequest) =>
  ({
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => handler,
    getClass: () => class Controller {},
  }) as unknown as ExecutionContext;
const audit = () => {
  const record = jest.fn<AuditService['record']>().mockResolvedValue(undefined);
  return { service: { record } as unknown as AuditService, record };
};

describe('authenticated session requirements', () => {
  it.each([undefined, null, {}])('rejects a missing user: %s', (value) => {
    expect(() => requireSession(request({ session: value }))).toThrow(
      'Authentication is required.',
    );
  });
  it('rejects an unverified user even when a session was attached', () => {
    expect(() => requireSession(request({ session: session({ emailVerified: false }) }))).toThrow(
      expect.objectContaining({ code: 'EMAIL_NOT_VERIFIED' }),
    );
  });
  it('returns the verified session unchanged', () => {
    const req = request();
    expect(requireSession(req)).toBe(req.session);
  });
});

describe('platform administration', () => {
  it.each(['USER', null, undefined])(
    'rejects a non-admin role %s and audits the denial',
    async (role) => {
      const a = audit();
      await expect(
        new PlatformAdminGuard(a.service).canActivate(
          context(request({ session: session({ role }) })),
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN_PERMISSION' });
      expect(a.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'authz.access_denied',
          actorUserId: 'actor',
          outcome: 'DENIED',
        }),
      );
    },
  );
  it.each([false, null, undefined])('requires enrolled MFA: %s', async (twoFactorEnabled) => {
    const a = audit();
    await expect(
      new PlatformAdminGuard(a.service).canActivate(
        context(
          request({
            session: session({ role: 'PLATFORM_ADMIN', twoFactorEnabled }),
          }),
        ),
      ),
    ).rejects.toMatchObject({ code: 'MFA_ENROLLMENT_REQUIRED' });
  });
  it('admits an MFA-enabled platform admin without a denial event', async () => {
    const a = audit();
    expect(
      await new PlatformAdminGuard(a.service).canActivate(
        context(
          request({
            session: session({ role: 'PLATFORM_ADMIN', twoFactorEnabled: true }),
          }),
        ),
      ),
    ).toBe(true);
    expect(a.record).not.toHaveBeenCalled();
  });
});

describe('fresh authentication', () => {
  it('rejects a stale session and records the reason', async () => {
    const a = audit();
    const value = session();
    value.session.createdAt = new Date(Date.now() - 3_600_001);
    await expect(
      new FreshSessionGuard(a.service).canActivate(context(request({ session: value }))),
    ).rejects.toMatchObject({ code: 'REAUTHENTICATION_REQUIRED' });
    expect(a.record).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { reason: 'REAUTHENTICATION_REQUIRED' },
      }),
    );
  });
  it('admits a recent session', async () => {
    const a = audit();
    expect(await new FreshSessionGuard(a.service).canActivate(context(request()))).toBe(true);
    expect(a.record).not.toHaveBeenCalled();
  });
});

describe('request origin', () => {
  it.each(['GET', 'HEAD', 'OPTIONS'])('admits %s without an Origin', async (method) => {
    expect(
      await new OriginGuard(
        { WEB_ORIGIN: 'http://localhost:3000' } as never,
        audit().service,
      ).canActivate(context(request({ method }))),
    ).toBe(true);
  });
  it.each(['https://evil.example', 'http://localhost:3000.evil.example', 'null', undefined])(
    'rejects a state-changing request with origin %s',
    async (origin) => {
      const a = audit();
      const guard = new OriginGuard({ WEB_ORIGIN: 'http://localhost:3000' } as never, a.service);
      await expect(
        guard.canActivate(
          context(
            request({
              method: 'POST',
              get: (key: string) => (key === 'origin' ? origin : undefined),
            }),
          ),
        ),
      ).rejects.toMatchObject({ code: 'ORIGIN_NOT_ALLOWED' });
    },
  );
  it('admits a mutation from the configured origin', async () => {
    const a = audit();
    expect(
      await new OriginGuard(
        { WEB_ORIGIN: 'http://localhost:3000' } as never,
        a.service,
      ).canActivate(
        context(
          request({
            method: 'POST',
            get: (key: string) => (key === 'origin' ? 'http://localhost:3000' : undefined),
          }),
        ),
      ),
    ).toBe(true);
  });
});

describe('tenant authorization', () => {
  it.each(['ORG_OWNER', 'ORG_ADMIN', 'AUDITOR'])(
    'resolves the tenant for %s from the route',
    async (role) => {
      const a = audit();
      const findFirst = jest
        .fn<(input: unknown) => Promise<unknown>>()
        .mockResolvedValue({ id: 'membership', role });
      const prisma = { member: { findFirst } } as unknown as PrismaClient;
      const req = request({
        query: { organizationId: 'org-b' },
        body: { organizationId: 'org-b' },
      });
      expect(
        await new OrgPermissionGuard(new Reflector(), prisma, a.service).canActivate(context(req)),
      ).toBe(true);
      expect(req.tenant).toEqual({
        organizationId: 'org-a',
        userId: 'actor',
        memberId: 'membership',
        role,
      });
      expect(findFirst).toHaveBeenCalledWith({
        where: { organizationId: 'org-a', userId: 'actor', status: 'ACTIVE' },
        select: { id: true, role: true },
      });
    },
  );
  it.each(['VIEWER', 'AI_DEVELOPER', 'SECURITY_ENGINEER', 'UNKNOWN'])(
    'denies audit access to %s',
    async (role) => {
      const a = audit();
      const prisma = {
        member: {
          findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: 'm', role }),
        },
      } as unknown as PrismaClient;
      await expect(
        new OrgPermissionGuard(new Reflector(), prisma, a.service).canActivate(context(request())),
      ).rejects.toMatchObject({ code: 'FORBIDDEN_PERMISSION' });
      expect(a.record).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-a', action: 'authz.access_denied' }),
      );
    },
  );
  it('does not grant platform administrators implicit organization membership', async () => {
    const a = audit();
    const prisma = {
      member: { findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue(null) },
    } as unknown as PrismaClient;
    await expect(
      new OrgPermissionGuard(new Reflector(), prisma, a.service).canActivate(
        context(request({ session: session({ role: 'PLATFORM_ADMIN', twoFactorEnabled: true }) })),
      ),
    ).rejects.toMatchObject({ code: 'ORGANIZATION_NOT_FOUND' });
  });
  it.each([undefined, '', ['org-a']])(
    'rejects an invalid tenant identifier %s before querying',
    async (organizationId) => {
      const findFirst = jest.fn();
      const prisma = { member: { findFirst } } as unknown as PrismaClient;
      await expect(
        new OrgPermissionGuard(new Reflector(), prisma, audit().service).canActivate(
          context(request({ params: { organizationId } })),
        ),
      ).rejects.toMatchObject({ code: 'ORGANIZATION_NOT_FOUND' });
      expect(findFirst).not.toHaveBeenCalled();
    },
  );
});
