import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import type { PrismaClient } from '@redova/db';
import type { Env } from '../config/env';
import type { AuditService } from '../audit/audit.service';
import { ImageProcessor } from '../media/image-processor';
import { MediaService } from '../media/media.service';
import { OrganizationLogoService } from './organization-logo.service';

describe('OrganizationLogoService', () => {
  let png: Buffer;
  const storage = { put: vi.fn(), get: vi.fn(), delete: vi.fn(), list: vi.fn() };
  const tx = { $queryRaw: vi.fn(), organization: { findFirst: vi.fn(), update: vi.fn() } };
  const prisma = { $transaction: vi.fn(), organization: { findFirst: vi.fn() } };
  const audit = { record: vi.fn() };
  let service: OrganizationLogoService;
  beforeAll(async () => {
    png = await sharp({ create: { width: 800, height: 400, channels: 4, background: '#ff2d2d' } })
      .png()
      .toBuffer();
  });
  beforeEach(() => {
    vi.resetAllMocks();
    storage.put.mockResolvedValue(undefined);
    storage.delete.mockResolvedValue(undefined);
    audit.record.mockResolvedValue(undefined);
    tx.organization.findFirst.mockResolvedValue({ logo: null });
    tx.organization.update.mockResolvedValue({});
    prisma.$transaction.mockImplementation((callback: (client: typeof tx) => unknown) =>
      Promise.resolve(callback(tx)),
    );
    service = new OrganizationLogoService(
      prisma as unknown as PrismaClient,
      { BETTER_AUTH_URL: 'https://api.redova.test' } as Env,
      new MediaService(storage, new ImageProcessor()),
      audit as unknown as AuditService,
    );
  });
  it('stores new WebP pixels with preserved aspect ratio and audits the update', async () => {
    const result = await service.upload('org-1', 'user-1', png);
    expect(result.logo).toMatch(
      /^https:\/\/api.redova.test\/api\/v1\/organizations\/org-1\/logo\//,
    );
    const [key, body] = storage.put.mock.calls[0] as [string, Buffer];
    expect(key).toMatch(/^organizations\/org-1\/logos\/[0-9a-f-]+\.webp$/);
    expect(await sharp(body).metadata()).toMatchObject({ format: 'webp', width: 512, height: 256 });
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'org.updated',
        organizationId: 'org-1',
        actorUserId: 'user-1',
        metadata: { fields: ['logo'] },
      }),
    );
  });
  it('rolls back the new object when publishing its database reference fails', async () => {
    tx.organization.update.mockRejectedValue(new Error('database unavailable'));
    await expect(service.upload('org-1', 'user-1', png)).rejects.toThrow('database unavailable');
    expect(storage.delete).toHaveBeenCalledWith(storage.put.mock.calls[0][0]);
    expect(audit.record).not.toHaveBeenCalled();
  });
  it('removes only the previous managed object, never an external URL', async () => {
    tx.organization.findFirst.mockResolvedValue({ logo: 'https://external.example/logo.png' });
    await service.upload('org-1', 'user-1', png);
    expect(storage.delete).not.toHaveBeenCalled();
  });
  it('rejects forged images and oversize uploads before writing storage', async () => {
    await expect(service.upload('org-1', 'user-1', Buffer.from('<svg/>'))).rejects.toMatchObject({
      code: 'ORG_LOGO_INVALID',
    });
    await expect(
      service.upload('org-1', 'user-1', Buffer.alloc(2 * 1024 * 1024 + 1)),
    ).rejects.toMatchObject({ code: 'ORG_LOGO_TOO_LARGE' });
    expect(storage.put).not.toHaveBeenCalled();
  });
  it('does not expose an obsolete or cross-organization logo', async () => {
    prisma.organization.findFirst.mockResolvedValue(null);
    await expect(
      service.read('org-2', '9d104101-2a00-4000-8000-000000000001'),
    ).rejects.toMatchObject({ code: 'ORG_LOGO_NOT_FOUND' });
    expect(storage.get).not.toHaveBeenCalled();
  });
  it('does not audit an already-empty removal', async () => {
    await service.remove('org-1', 'user-1');
    expect(storage.delete).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
