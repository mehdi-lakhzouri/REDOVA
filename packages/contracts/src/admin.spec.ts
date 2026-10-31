import { describe, expect, it } from 'vitest';
import {
  adminSessionSchema,
  adminUserListQuerySchema,
  adminUserSummarySchema,
  banUserBodySchema,
  setRoleBodySchema,
} from './admin';
import { ERROR_HTTP_STATUS, ERROR_MESSAGES, ErrorCode } from './errors';
import { ORG_ROLE_LABELS, OrgRole } from './roles';

describe('admin DTOs (UM-007)', () => {
  it('applies list defaults and bounds the search', () => {
    expect(adminUserListQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(adminUserListQuerySchema.parse({ q: '  ali ', status: 'banned' })).toMatchObject({
      q: 'ali',
      status: 'banned',
    });
    expect(adminUserListQuerySchema.safeParse({ q: 'x'.repeat(101) }).success).toBe(false);
    expect(adminUserListQuerySchema.safeParse({ role: 'ORG_OWNER' }).success).toBe(false);
  });

  it('accepts only the documented ban durations and reason lengths', () => {
    for (const expiresInDays of [1, 7, 30, null]) {
      expect(
        banUserBodySchema.safeParse({ reason: 'Abusive behavior', expiresInDays }).success,
      ).toBe(true);
    }
    expect(
      banUserBodySchema.safeParse({ reason: 'Abusive behavior', expiresInDays: 2 }).success,
    ).toBe(false);
    expect(banUserBodySchema.safeParse({ reason: 'short', expiresInDays: 1 }).success).toBe(false);
    expect(setRoleBodySchema.safeParse({ role: 'ORG_ADMIN' }).success).toBe(false);
  });

  it('rejects extra fields in outputs, so nothing leaks by accident', () => {
    const session = {
      id: 's1',
      createdAt: '2026-10-31T12:00:00.000Z',
      updatedAt: '2026-10-31T12:00:00.000Z',
      expiresAt: '2026-11-07T12:00:00.000Z',
      ipAddress: null,
      userAgent: null,
    };
    expect(adminSessionSchema.safeParse(session).success).toBe(true);
    expect(adminSessionSchema.safeParse({ ...session, token: 't' }).success).toBe(false);
    const user = {
      id: 'u1',
      name: 'Bob',
      email: 'bob@acme.io',
      emailVerified: true,
      role: 'USER',
      banned: false,
      banExpires: null,
      twoFactorEnabled: false,
      createdAt: '2026-10-31T12:00:00.000Z',
    };
    expect(adminUserSummarySchema.safeParse(user).success).toBe(true);
    expect(adminUserSummarySchema.safeParse({ ...user, password: 'x' }).success).toBe(false);
  });
});

describe('error catalog and role labels', () => {
  it('gives every error code an HTTP status and a client-safe message', () => {
    for (const code of Object.values(ErrorCode)) {
      expect(ERROR_HTTP_STATUS[code]).toBeGreaterThanOrEqual(400);
      expect(ERROR_MESSAGES[code].length).toBeGreaterThan(0);
    }
    expect(ERROR_HTTP_STATUS.LAST_PLATFORM_ADMIN).toBe(409);
  });

  it('labels every organization role', () => {
    expect(Object.keys(ORG_ROLE_LABELS).sort()).toEqual([...OrgRole.options].sort());
  });
});
