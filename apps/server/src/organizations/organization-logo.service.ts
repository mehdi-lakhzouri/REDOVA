import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@redova/db';
import { AuditService } from '../audit/audit.service';
import { ApiException } from '../common/api-exception';
import type { Env } from '../config/env';
import { ENV, PRISMA } from '../config/tokens';
import { isMediaId, mediaKey } from '../media/media-key';
import { MediaService } from '../media/media.service';

@Injectable()
export class OrganizationLogoService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: Env,
    private readonly media: MediaService,
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
    return isMediaId(id) && logo === this.url(organizationId, id)
      ? mediaKey({ kind: 'organizationLogo', ownerId: organizationId, id })
      : null;
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
    const { id, key } = await this.media.store('organizationLogo', organizationId, input);
    const logo = this.url(organizationId, id);
    let previous: string | null;
    try {
      previous = await this.swap(organizationId, logo);
    } catch (error) {
      await this.media.discard(key);
      throw error;
    }
    await this.media.discard(this.ownedKey(organizationId, previous));
    await this.record(organizationId, actorUserId);
    return { logo };
  }
  async remove(organizationId: string, actorUserId: string): Promise<void> {
    const previous = await this.swap(organizationId, null);
    await this.media.discard(this.ownedKey(organizationId, previous));
    if (previous) await this.record(organizationId, actorUserId);
  }
  async read(organizationId: string, id: string): Promise<Buffer> {
    if (!isMediaId(id)) throw new ApiException('ORG_LOGO_NOT_FOUND');
    const organization = await this.prisma.organization.findFirst({
      where: { id: organizationId, status: 'ACTIVE', logo: this.url(organizationId, id) },
      select: { id: true },
    });
    if (!organization) throw new ApiException('ORG_LOGO_NOT_FOUND');
    return this.media.read('organizationLogo', organizationId, id);
  }
}
