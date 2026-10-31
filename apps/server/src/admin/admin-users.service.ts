import { Inject, Injectable } from '@nestjs/common';
import type { Auth } from '@redova/auth';
import {
  type AdminSession,
  type AdminUserDetail,
  type AdminUserListQuery,
  type AdminUserSummary,
  type BanUserBody,
  decodeCursor,
  encodeCursor,
  InvalidCursorError,
  type Paginated,
  type SetRoleBody,
} from '@redova/contracts';
import { banExpiresInSeconds, canBanUser, canChangeGlobalRole, isSameBan } from '@redova/core';
import { type PrismaClient, UserQueryRepository } from '@redova/db';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { AuditService } from '../audit/audit.service';
import { ApiException } from '../common/api-exception';
import { PRISMA } from '../config/tokens';
import { toAdminSession, toAdminUserDetail, toAdminUserSummary } from './admin.mappers';

/** The admin performing the call; `headers` are forwarded so Better Auth re-checks the permission. */
export interface AdminActor {
  id: string;
  headers: Headers;
}

/** Serializes global role changes so concurrent demotions can never leave zero admins. */
const ROLE_LOCK_KEY = 'redova:platform-admin-role';

/** Platform admin use cases (README §14, §18.6). Idempotent repeats write no audit event. */
@Injectable()
export class AdminUsersService {
  private readonly users: UserQueryRepository;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly authService: AuthService<Auth>,
    private readonly audit: AuditService,
  ) {
    this.users = new UserQueryRepository(prisma);
  }

  private get api() {
    return this.authService.api;
  }

  async list(query: AdminUserListQuery): Promise<Paginated<AdminUserSummary>> {
    const page = await this.users.list({
      q: query.q,
      status: query.status,
      role: query.role,
      limit: query.limit,
      afterId: query.cursor ? decodeCursor(query.cursor).id : undefined,
    });
    if (!page) throw new InvalidCursorError();
    const last = page.items.at(-1);
    return {
      items: page.items.map(toAdminUserSummary),
      pagination: {
        limit: query.limit,
        hasMore: page.hasMore,
        nextCursor: page.hasMore && last ? encodeCursor({ id: last.id }) : null,
      },
    };
  }

  async get(userId: string): Promise<AdminUserDetail> {
    const row = await this.users.getDetail(userId);
    if (!row) throw new ApiException('USER_NOT_FOUND');
    return toAdminUserDetail(row);
  }

  async ban(actor: AdminActor, userId: string, body: BanUserBody): Promise<AdminUserDetail> {
    const target = await this.get(userId);
    const issue = canBanUser({ actorId: actor.id, targetId: userId, targetRole: target.role });
    if (issue) throw new ApiException(issue);
    const current = {
      banned: target.banned,
      banReason: target.banReason,
      banExpires: target.banExpires ? new Date(target.banExpires) : null,
    };
    if (isSameBan(current, { reason: body.reason, expiresInDays: body.expiresInDays })) {
      return target;
    }

    await this.api.banUser({
      headers: actor.headers,
      body: {
        userId,
        banReason: body.reason,
        banExpiresIn: banExpiresInSeconds(body.expiresInDays),
      },
    });
    // The reason stays on the user (admin-only); it is not copied into the audit trail.
    await this.record(actor, 'admin.user.banned', userId, {
      expiresInDays: body.expiresInDays,
    });
    return this.get(userId);
  }

  async unban(actor: AdminActor, userId: string): Promise<void> {
    const target = await this.get(userId);
    if (!target.banned) return;
    await this.api.unbanUser({ headers: actor.headers, body: { userId } });
    await this.record(actor, 'admin.user.unbanned', userId);
  }

  async setRole(actor: AdminActor, userId: string, body: SetRoleBody): Promise<AdminUserDetail> {
    const previousRole = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ROLE_LOCK_KEY}))`;
        const target = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
        if (!target) throw new ApiException('USER_NOT_FOUND');
        const currentRole = target.role ?? 'USER';
        const issue = canChangeGlobalRole({
          actorId: actor.id,
          targetId: userId,
          targetCurrentRole: currentRole,
          newRole: body.role,
          platformAdminCount: await this.users.countPlatformAdmins(tx),
        });
        if (issue) throw new ApiException(issue);
        if (currentRole === body.role) return null;
        // Committed before the lock is released, so the next request counts the new state.
        await this.api.setRole({ headers: actor.headers, body: { userId, role: body.role } });
        return currentRole;
      },
      { timeout: 15_000 },
    );
    if (previousRole) {
      await this.record(actor, 'admin.user.role_changed', userId, {
        previousRole,
        newRole: body.role,
      });
    }
    return this.get(userId);
  }

  async listSessions(actor: AdminActor, userId: string): Promise<AdminSession[]> {
    await this.get(userId);
    const result = (await this.api.listUserSessions({
      headers: actor.headers,
      body: { userId },
    })) as unknown as { sessions: Parameters<typeof toAdminSession>[0][] };
    return result.sessions.map(toAdminSession);
  }

  async revokeSession(actor: AdminActor, userId: string, sessionId: string): Promise<void> {
    const sessionToken = await this.users.findSessionTokenForUser(sessionId, userId);
    if (!sessionToken) throw new ApiException('SESSION_NOT_FOUND');
    await this.api.revokeUserSession({ headers: actor.headers, body: { sessionToken } });
    await this.audit.record({
      action: 'admin.user.session_revoked',
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorUserId: actor.id,
      targetType: 'SESSION',
      targetId: sessionId,
      metadata: { userId },
    });
  }

  async revokeAllSessions(actor: AdminActor, userId: string): Promise<void> {
    await this.get(userId);
    const count = await this.users.countActiveSessions(userId);
    if (count === 0) return;
    await this.api.revokeUserSessions({ headers: actor.headers, body: { userId } });
    await this.record(actor, 'admin.user.sessions_revoked', userId, { count });
  }

  private record(
    actor: AdminActor,
    action:
      | 'admin.user.banned'
      | 'admin.user.unbanned'
      | 'admin.user.role_changed'
      | 'admin.user.sessions_revoked',
    userId: string,
    metadata?: Record<string, string | number | null>,
  ) {
    return this.audit.record({
      action,
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorUserId: actor.id,
      targetType: 'USER',
      targetId: userId,
      metadata,
    });
  }
}
