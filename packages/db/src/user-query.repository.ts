import type { Prisma, PrismaClient } from './generated/prisma/client';

/** Explicit projection: account, password and two-factor data are never read. */
const USER_SUMMARY_SELECT = {
  id: true,
  name: true,
  email: true,
  emailVerified: true,
  role: true,
  banned: true,
  banExpires: true,
  twoFactorEnabled: true,
  createdAt: true,
} as const satisfies Prisma.UserSelect;

export type UserSummaryRow = Prisma.UserGetPayload<{ select: typeof USER_SUMMARY_SELECT }>;

export interface UserDetailRow extends UserSummaryRow {
  banReason: string | null;
  membershipCount: number;
  activeSessionCount: number;
}

export interface UserListFilter {
  /** Case-insensitive prefix on email or name. */
  q?: string;
  status?: 'active' | 'banned';
  role?: string;
  limit: number;
  /** Id of the last item of the previous page. */
  afterId?: string;
}

/** Read side of the platform admin API (UM-007). */
export class UserQueryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** Keyset page ordered by `createdAt desc, id desc`; `null` when `afterId` does not exist. */
  async list(
    filter: UserListFilter,
  ): Promise<{ items: UserSummaryRow[]; hasMore: boolean } | null> {
    if (filter.afterId) {
      const anchor = await this.prisma.user.findUnique({
        where: { id: filter.afterId },
        select: { id: true },
      });
      if (!anchor) return null;
    }
    const where: Prisma.UserWhereInput = {
      AND: [
        filter.q
          ? {
              OR: [
                { email: { startsWith: filter.q, mode: 'insensitive' } },
                { name: { startsWith: filter.q, mode: 'insensitive' } },
              ],
            }
          : {},
        filter.status === 'banned' ? { banned: true } : {},
        filter.status === 'active' ? { NOT: { banned: true } } : {},
        filter.role === 'USER' ? { OR: [{ role: 'USER' }, { role: null }] } : {},
        filter.role === 'PLATFORM_ADMIN' ? { role: 'PLATFORM_ADMIN' } : {},
      ],
    };
    const rows = await this.prisma.user.findMany({
      where,
      select: USER_SUMMARY_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: filter.limit + 1,
      ...(filter.afterId ? { cursor: { id: filter.afterId }, skip: 1 } : {}),
    });
    return { items: rows.slice(0, filter.limit), hasMore: rows.length > filter.limit };
  }

  async getDetail(id: string, now = new Date()): Promise<UserDetailRow | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...USER_SUMMARY_SELECT,
        banReason: true,
        _count: { select: { members: true, sessions: { where: { expiresAt: { gt: now } } } } },
      },
    });
    if (!user) return null;
    const { _count, ...rest } = user;
    return { ...rest, membershipCount: _count.members, activeSessionCount: _count.sessions };
  }

  countPlatformAdmins(client: Pick<PrismaClient, 'user'> = this.prisma): Promise<number> {
    return client.user.count({ where: { role: 'PLATFORM_ADMIN' } });
  }

  countActiveSessions(userId: string, now = new Date()): Promise<number> {
    return this.prisma.session.count({ where: { userId, expiresAt: { gt: now } } });
  }

  /** The token of `sessionId`, only if that session belongs to `userId`. */
  async findSessionTokenForUser(sessionId: string, userId: string): Promise<string | null> {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId },
      select: { token: true },
    });
    return session?.token ?? null;
  }
}
