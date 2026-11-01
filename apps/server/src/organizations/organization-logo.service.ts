import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ORGANIZATION_LOGO_MAX_BYTES } from '@redova/contracts';
import type { PrismaClient } from '@redova/db';
import { AuditService } from '../audit/audit.service';
import { ApiException } from '../common/api-exception';
import type { Env } from '../config/env';
import { ENV, PRISMA } from '../config/tokens';
import type { AvatarStorage } from '../storage/avatar-storage';
import { IMAGE_ID_PATTERN, imageKey } from '../storage/image-object';
import { normalizeImage } from '../storage/normalize-image';
import { ORGANIZATION_LOGO_STORAGE } from '../storage/storage.module';

@Injectable()
export class OrganizationLogoService {
  private readonly logger = new Logger(OrganizationLogoService.name);
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: Env,
    @Inject(ORGANIZATION_LOGO_STORAGE) private readonly storage: AvatarStorage,
    private readonly audit: AuditService,
  ) {}
  private url(organizationId: string, id: string): string {
    return new URL(
      `/api/v1/organizations/${encodeURIComponent(organizationId)}/logo/${id}`,
      this.env.BETTER_AUTH_URL,
    ).toString();
  }
  private ownedKey(organizationId: string, logo: string | null): string | null {
    if (!logo) return null;
    const id = logo.slice(logo.lastIndexOf('/') + 1);
    return IMAGE_ID_PATTERN.test(id) && logo === this.url(organizationId, id)
      ? imageKey(id, 'organization-logos')
      : null;
  }
  private async cleanup(key: string | null): Promise<void> {
    if (!key) return;
    try {
      await this.storage.delete(key);
    } catch (error) {
      this.logger.error({ err: error, key }, 'Organization logo cleanup failed; run logos:prune');
    }
  }
  private async swap(organizationId: string, logo: string | null): Promise<string | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`org-logo:${organizationId}`}, 0))::text`;
      const organization = await tx.organization.findFirst({
        where: { id: organizationId, status: 'ACTIVE' },
        select: { logo: true },
      });
      if (!organization) throw new ApiException('ORGANIZATION_NOT_FOUND');
      await tx.organization.update({
        where: { id: organizationId },
        data: { logo, updatedAt: new Date() },
      });
      return organization.logo;
    });
  }
  private record(organizationId: string, actorUserId: string) {
    return this.audit.record({
      action: 'org.updated',
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorUserId,
      organizationId,
      targetType: 'ORGANIZATION',
      targetId: organizationId,
      metadata: { fields: ['logo'] },
    });
  }
  async upload(
    organizationId: string,
    actorUserId: string,
    input: Buffer,
  ): Promise<{ logo: string }> {
    const body = await normalizeImage(input, {
      maxBytes: ORGANIZATION_LOGO_MAX_BYTES,
      maxPixels: 16_000_000,
      fit: 'inside',
      invalid: 'ORG_LOGO_INVALID',
      tooLarge: 'ORG_LOGO_TOO_LARGE',
    });
    const id = randomUUID();
    const key = imageKey(id, 'organization-logos');
    const logo = this.url(organizationId, id);
    await this.storage.put(key, body);
    let previous: string | null;
    try {
      previous = await this.swap(organizationId, logo);
    } catch (error) {
      await this.cleanup(key);
      throw error;
    }
    await this.cleanup(this.ownedKey(organizationId, previous));
    await this.record(organizationId, actorUserId);
    return { logo };
  }
  async remove(organizationId: string, actorUserId: string): Promise<void> {
    const previous = await this.swap(organizationId, null);
    await this.cleanup(this.ownedKey(organizationId, previous));
    if (previous) await this.record(organizationId, actorUserId);
  }
  async read(organizationId: string, id: string): Promise<Buffer> {
    if (!IMAGE_ID_PATTERN.test(id)) throw new ApiException('ORG_LOGO_NOT_FOUND');
    const organization = await this.prisma.organization.findFirst({
      where: { id: organizationId, status: 'ACTIVE', logo: this.url(organizationId, id) },
      select: { id: true },
    });
    if (!organization) throw new ApiException('ORG_LOGO_NOT_FOUND');
    const body = await this.storage.get(imageKey(id, 'organization-logos'));
    if (!body) throw new ApiException('ORG_LOGO_NOT_FOUND');
    return body;
  }
}
