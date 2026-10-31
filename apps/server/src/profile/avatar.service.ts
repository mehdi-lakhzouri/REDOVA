import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@redova/db';
import { AuditService } from '../audit/audit.service';
import type { SessionUser } from '../authz/authenticated-request';
import { ApiException } from '../common/api-exception';
import type { Env } from '../config/env';
import { ENV, PRISMA } from '../config/tokens';
import {
  AVATAR_ID_PATTERN,
  AVATAR_STORAGE,
  avatarKey,
  type AvatarStorage,
} from '../storage/avatar-storage';
import { AvatarImageService } from './avatar-image.service';

@Injectable()
export class AvatarService {
  private readonly logger = new Logger(AvatarService.name);
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: Env,
    @Inject(AVATAR_STORAGE) private readonly storage: AvatarStorage,
    private readonly images: AvatarImageService,
    private readonly audit: AuditService,
  ) {}
  private url(id: string): string {
    return new URL(`/api/v1/avatars/${id}`, this.env.BETTER_AUTH_URL).toString();
  }
  private ownedKey(url: string | null): string | null {
    if (!url) return null;
    const id = url.slice(url.lastIndexOf('/') + 1);
    return AVATAR_ID_PATTERN.test(id) && url === this.url(id) ? avatarKey(id) : null;
  }
  private async cleanup(key: string | null): Promise<void> {
    if (!key) return;
    try {
      await this.storage.delete(key);
    } catch (error) {
      // The prune command safely retries orphan cleanup after the 24-hour grace period.
      this.logger.error({ err: error, key }, 'Avatar cleanup failed; run avatars:prune');
    }
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
    const body = await this.images.normalize(input);
    const id = randomUUID();
    const key = avatarKey(id);
    const image = this.url(id);
    // A unique object is published in the database only after a complete storage write.
    await this.storage.put(key, body);
    let previous: string | null;
    try {
      previous = await this.swap(userId, image);
    } catch (error) {
      await this.cleanup(key);
      throw error;
    }
    await this.cleanup(this.ownedKey(previous));
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
    await this.cleanup(this.ownedKey(previous));
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
    if (!AVATAR_ID_PATTERN.test(id)) throw new ApiException('AVATAR_NOT_FOUND');
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
    const body = await this.storage.get(avatarKey(id));
    if (!body) throw new ApiException('AVATAR_NOT_FOUND');
    return body;
  }
}
