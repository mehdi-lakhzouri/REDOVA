import { adminSessionSchema } from '@redova/contracts';
import { describe, expect, it } from 'vitest';
import { toAdminSession, toAdminUserDetail } from './admin.mappers';

const createdAt = new Date('2026-10-31T12:00:00.000Z');

describe('admin mappers (UT-007-03)', () => {
  it('maps a session without its token', () => {
    const session = toAdminSession({
      id: 's1',
      token: 'secret-session-token',
      userId: 'u1',
      createdAt,
      updatedAt: createdAt,
      expiresAt: createdAt,
      ipAddress: '203.0.113.7',
      userAgent: null,
    } as Parameters<typeof toAdminSession>[0]);
    expect(session).toEqual({
      id: 's1',
      createdAt: '2026-10-31T12:00:00.000Z',
      updatedAt: '2026-10-31T12:00:00.000Z',
      expiresAt: '2026-10-31T12:00:00.000Z',
      ipAddress: '203.0.113.7',
      userAgent: null,
    });
    expect(JSON.stringify(session)).not.toContain('secret-session-token');
  });

  it('uses strict output schemas', () => {
    const parsed = adminSessionSchema.safeParse({
      ...toAdminSession({ id: 's1', createdAt, updatedAt: createdAt, expiresAt: createdAt }),
      token: 'leak',
    });
    expect(parsed.success).toBe(false);
  });

  it('normalizes nullable user flags', () => {
    const detail = toAdminUserDetail({
      id: 'u1',
      name: 'Bob',
      email: 'bob@acme.io',
      emailVerified: true,
      role: null,
      banned: null,
      banExpires: null,
      twoFactorEnabled: null,
      createdAt,
      banReason: null,
      membershipCount: 2,
      activeSessionCount: 1,
    });
    expect(detail).toMatchObject({ role: 'USER', banned: false, twoFactorEnabled: false });
  });
});
