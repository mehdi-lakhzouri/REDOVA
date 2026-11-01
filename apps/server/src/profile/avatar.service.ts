import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@redova/db';
import { AuditService } from '../audit/audit.service';
import type { SessionUser } from '../authz/authenticated-request';
import { ApiException } from '../common/api-exception';
import type { Env } from '../config/env';
import { ENV, PRISMA } from '../config/tokens';
import { isMediaId, mediaKey } from '../media/media-key';
import { MediaService } from '../media/media.service';

@Injectable()
export class AvatarService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: Env,
    private readonly media: MediaService,
    private readonly audit: AuditService,
  ) {}
  private url(id: string): string {
    return new URL(`/api/v1/avatars/${id}`, this.env.BETTER_AUTH_URL).toString();
  }
  /** Storage key of a URL this service issued; `null` for empty or external values. */
  private ownedKey(userId: string, url: string | null): string | null {
    if (!url) return null;
    const id = url.slice(url.lastIndexOf('/') + 1);
    return isMediaId(id) && url === this.url(id)
      ? mediaKey({ kind: 'avatar', ownerId: userId, id })
      : null;
  }
  private async swap(userId: string, image: string | null): Promise<string | null> {
    return this.prisma.$transaction(async (tx) => {
      // Serialize replace/delete across all API replicas, not just this Node process.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))::text`;
      const previous = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { image: true },
      });
      await tx.user.update({ where: { id: userId }, data: { image } });
      return previous.image;
    });
  }
  async upload(userId: string, input: Buffer): Promise<{ image: string }> {
    // A unique object is published in the database only after a complete storage write.
    const { id, key } = await this.media.store('avatar', userId, input);
    const image = this.url(id);
    let previous: string | null;
    try {
      previous = await this.swap(userId, image);
    } catch (error) {
      await this.media.discard(key);
      throw error;
    }
    await this.media.discard(this.ownedKey(userId, previous));
    await this.audit.record({
      action: 'profile.avatar.updated',
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorUserId: userId,
      targetType: 'USER',
      targetId: userId,
    });
    return { image };
  }
  async remove(userId: string): Promise<void> {
    const previous = await this.swap(userId, null);
    await this.media.discard(this.ownedKey(userId, previous));
    if (previous)
      await this.audit.record({
        action: 'profile.avatar.deleted',
        outcome: 'SUCCESS',
        actorType: 'USER',
        actorUserId: userId,
        targetType: 'USER',
        targetId: userId,
      });
  }
  async read(id: string, viewer: SessionUser): Promise<Buffer> {
    if (!isMediaId(id)) throw new ApiException('AVATAR_NOT_FOUND');
    const owner = await this.prisma.user.findFirst({
      where: { image: this.url(id) },
      select: { id: true },
    });
    if (!owner) throw new ApiException('AVATAR_NOT_FOUND');
    if (owner.id !== viewer.id && !(viewer.role === 'PLATFORM_ADMIN' && viewer.twoFactorEnabled)) {
      const shared = await this.prisma.member.findFirst({
        where: {
          userId: viewer.id,
          status: 'ACTIVE',
          organization: {
            status: 'ACTIVE',
            members: { some: { userId: owner.id, status: 'ACTIVE' } },
          },
        },
        select: { id: true },
      });
      if (!shared) throw new ApiException('AVATAR_NOT_FOUND');
    }
    return this.media.read('avatar', owner.id, id);
  }
}
