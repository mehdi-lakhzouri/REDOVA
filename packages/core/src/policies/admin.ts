/** Platform administration safeguards (README §9.3, §14, UM-007). */
export type AdminPolicyIssue =
  'ADMIN_SELF_ROLE_CHANGE_FORBIDDEN' | 'LAST_PLATFORM_ADMIN' | 'ADMIN_TARGET_IS_PLATFORM_ADMIN';

const PLATFORM_ADMIN = 'PLATFORM_ADMIN';
const DAY_SECONDS = 24 * 60 * 60;

/** Allowed ban durations; `null` is a permanent ban. */
export const BAN_DURATIONS_DAYS = [1, 7, 30] as const;
export type BanDurationDays = (typeof BAN_DURATIONS_DAYS)[number] | null;

/** An admin never changes their own role, and the last PLATFORM_ADMIN is never demoted. */
export const canChangeGlobalRole = ({
  actorId,
  targetId,
  targetCurrentRole,
  newRole,
  platformAdminCount,
}: {
  actorId: string;
  targetId: string;
  targetCurrentRole: string | null;
  newRole: string;
  platformAdminCount: number;
}): AdminPolicyIssue | null => {
  if (actorId === targetId) return 'ADMIN_SELF_ROLE_CHANGE_FORBIDDEN';
  const demotesAdmin = targetCurrentRole === PLATFORM_ADMIN && newRole !== PLATFORM_ADMIN;
  if (demotesAdmin && platformAdminCount <= 1) return 'LAST_PLATFORM_ADMIN';
  return null;
};

/**
 * Platform admins cannot be banned (demote them first). Self-bans are left to Better Auth, whose
 * native `YOU_CANNOT_BAN_YOURSELF` error is kept.
 */
export const canBanUser = ({
  actorId,
  targetId,
  targetRole,
}: {
  actorId: string;
  targetId: string;
  targetRole: string | null;
}): AdminPolicyIssue | null => {
  if (actorId === targetId) return null;
  return targetRole === PLATFORM_ADMIN ? 'ADMIN_TARGET_IS_PLATFORM_ADMIN' : null;
};

/** Better Auth `banExpiresIn` (seconds); `undefined` means permanent. */
export const banExpiresInSeconds = (days: BanDurationDays): number | undefined =>
  days === null ? undefined : days * DAY_SECONDS;

/**
 * A repeated ban request is a no-op when the user is already banned with the same reason and the
 * same duration, counted in whole remaining days (a retry minutes later does not extend the ban).
 */
export const isSameBan = (
  current: { banned: boolean | null; banReason: string | null; banExpires: Date | null },
  requested: { reason: string; expiresInDays: BanDurationDays },
  now = Date.now(),
): boolean => {
  if (!current.banned || current.banReason !== requested.reason) return false;
  if (requested.expiresInDays === null || current.banExpires === null) {
    return requested.expiresInDays === null && current.banExpires === null;
  }
  const remainingDays = Math.ceil((current.banExpires.getTime() - now) / (DAY_SECONDS * 1000));
  return remainingDays === requested.expiresInDays;
};
