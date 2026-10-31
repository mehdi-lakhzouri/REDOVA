import { z } from 'zod';
import { cursorQuerySchema } from './pagination';
import { GlobalRole } from './roles';

/** Platform admin API DTOs (README §18.6, UM-007). Output schemas are strict: no extra field leaks. */

export const adminUserListQuerySchema = cursorQuerySchema.extend({
  q: z.string().trim().min(1).max(100).optional(),
  status: z.enum(['active', 'banned']).optional(),
  role: GlobalRole.optional(),
});
export type AdminUserListQuery = z.infer<typeof adminUserListQuerySchema>;

export const adminUserSummarySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.email(),
    emailVerified: z.boolean(),
    role: GlobalRole,
    banned: z.boolean(),
    banExpires: z.iso.datetime().nullable(),
    twoFactorEnabled: z.boolean(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export type AdminUserSummary = z.infer<typeof adminUserSummarySchema>;

export const adminUserDetailSchema = adminUserSummarySchema
  .extend({
    banReason: z.string().nullable(),
    membershipCount: z.number().int().nonnegative(),
    activeSessionCount: z.number().int().nonnegative(),
  })
  .strict();
export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;

/** A session as shown to admins: identified by id, never by token. */
export const adminSessionSchema = z
  .object({
    id: z.string(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    ipAddress: z.string().nullable(),
    userAgent: z.string().nullable(),
  })
  .strict();
export type AdminSession = z.infer<typeof adminSessionSchema>;

export const banUserBodySchema = z.object({
  reason: z.string().trim().min(10).max(500),
  expiresInDays: z.union([z.literal(1), z.literal(7), z.literal(30), z.null()]),
});
export type BanUserBody = z.infer<typeof banUserBodySchema>;

export const setRoleBodySchema = z.object({ role: GlobalRole });
export type SetRoleBody = z.infer<typeof setRoleBodySchema>;
