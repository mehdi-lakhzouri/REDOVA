import { describe, expect, it } from 'vitest';
import { banExpiresInSeconds, canBanUser, canChangeGlobalRole, isSameBan } from './admin';

describe('canChangeGlobalRole (UT-007-01)', () => {
  const base = { actorId: 'ada', targetId: 'carl', platformAdminCount: 2 };

  it('forbids changing your own role', () => {
    expect(
      canChangeGlobalRole({
        ...base,
        targetId: 'ada',
        targetCurrentRole: 'PLATFORM_ADMIN',
        newRole: 'USER',
      }),
    ).toBe('ADMIN_SELF_ROLE_CHANGE_FORBIDDEN');
  });

  it('protects the last platform admin', () => {
    expect(
      canChangeGlobalRole({
        ...base,
        targetCurrentRole: 'PLATFORM_ADMIN',
        newRole: 'USER',
        platformAdminCount: 1,
      }),
    ).toBe('LAST_PLATFORM_ADMIN');
  });

  it('allows a promotion and a demotion when other admins remain', () => {
    expect(
      canChangeGlobalRole({ ...base, targetCurrentRole: 'USER', newRole: 'PLATFORM_ADMIN' }),
    ).toBeNull();
    expect(
      canChangeGlobalRole({ ...base, targetCurrentRole: 'PLATFORM_ADMIN', newRole: 'USER' }),
    ).toBeNull();
  });
});

describe('canBanUser (UT-007-02)', () => {
  it('leaves self-bans to the native check', () => {
    expect(
      canBanUser({ actorId: 'ada', targetId: 'ada', targetRole: 'PLATFORM_ADMIN' }),
    ).toBeNull();
  });

  it('refuses to ban a platform admin and allows a user', () => {
    expect(canBanUser({ actorId: 'ada', targetId: 'carl', targetRole: 'PLATFORM_ADMIN' })).toBe(
      'ADMIN_TARGET_IS_PLATFORM_ADMIN',
    );
    expect(canBanUser({ actorId: 'ada', targetId: 'bob', targetRole: 'USER' })).toBeNull();
    expect(canBanUser({ actorId: 'ada', targetId: 'bob', targetRole: null })).toBeNull();
  });
});

describe('ban duration (UT-007-04)', () => {
  it('maps days to seconds and permanent to no expiry', () => {
    expect(banExpiresInSeconds(1)).toBe(86_400);
    expect(banExpiresInSeconds(7)).toBe(604_800);
    expect(banExpiresInSeconds(30)).toBe(2_592_000);
    expect(banExpiresInSeconds(null)).toBeUndefined();
  });
});

describe('isSameBan (UT-007-05)', () => {
  const now = Date.UTC(2026, 9, 31, 12);
  const day = 86_400_000;
  const banned = { banned: true, banReason: 'Credential stuffing source' };

  it('treats a retry of the same temporary ban as a no-op', () => {
    const current = { ...banned, banExpires: new Date(now + 7 * day - 60_000) };
    expect(isSameBan(current, { reason: banned.banReason, expiresInDays: 7 }, now)).toBe(true);
  });

  it('detects a different reason, duration or permanence', () => {
    const current = { ...banned, banExpires: new Date(now + 7 * day) };
    expect(isSameBan(current, { reason: 'Other reason here', expiresInDays: 7 }, now)).toBe(false);
    expect(isSameBan(current, { reason: banned.banReason, expiresInDays: 30 }, now)).toBe(false);
    expect(isSameBan(current, { reason: banned.banReason, expiresInDays: null }, now)).toBe(false);
  });

  it('compares permanent bans and never matches a user who is not banned', () => {
    const permanent = { ...banned, banExpires: null };
    expect(isSameBan(permanent, { reason: banned.banReason, expiresInDays: null }, now)).toBe(true);
    expect(
      isSameBan(
        { banned: false, banReason: null, banExpires: null },
        { reason: 'x'.repeat(10), expiresInDays: null },
        now,
      ),
    ).toBe(false);
  });
});
