import {
  type AdminSession,
  type AdminUserDetail,
  type AdminUserSummary,
  adminSessionSchema,
  adminUserDetailSchema,
  adminUserSummarySchema,
} from '@redova/contracts';
import type { UserDetailRow, UserSummaryRow } from '@redova/db';

const iso = (value: Date | string): string => new Date(value).toISOString();

const summaryFields = (row: UserSummaryRow) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  emailVerified: row.emailVerified,
  role: row.role === 'PLATFORM_ADMIN' ? ('PLATFORM_ADMIN' as const) : ('USER' as const),
  banned: row.banned === true,
  banExpires: row.banExpires ? iso(row.banExpires) : null,
  twoFactorEnabled: row.twoFactorEnabled === true,
  createdAt: iso(row.createdAt),
});

/** Outputs are parsed with strict schemas: a field added by mistake fails loudly, never leaks. */
export const toAdminUserSummary = (row: UserSummaryRow): AdminUserSummary =>
  adminUserSummarySchema.parse(summaryFields(row));

export const toAdminUserDetail = (row: UserDetailRow): AdminUserDetail =>
  adminUserDetailSchema.parse({
    ...summaryFields(row),
    banReason: row.banReason,
    membershipCount: row.membershipCount,
    activeSessionCount: row.activeSessionCount,
  });

/** Picks the public fields of a Better Auth session; the token is never copied. */
export const toAdminSession = (session: {
  id: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  expiresAt: Date | string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): AdminSession =>
  adminSessionSchema.parse({
    id: session.id,
    createdAt: iso(session.createdAt),
    updatedAt: iso(session.updatedAt),
    expiresAt: iso(session.expiresAt),
    ipAddress: session.ipAddress ?? null,
    userAgent: session.userAgent ?? null,
  });
