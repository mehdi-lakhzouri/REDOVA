import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, type PrismaClient } from './client';
import { getTestDatabaseUrl, loadTestEnv, resetDatabase } from './test';

describe('SaaS tenant foundation', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    loadTestEnv();
    prisma = createPrismaClient(getTestDatabaseUrl());
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
    await prisma.organization.createMany({
      data: [
        { id: 'tenant-a', name: 'Tenant A', slug: 'tenant-a', createdAt: new Date() },
        { id: 'tenant-b', name: 'Tenant B', slug: 'tenant-b', createdAt: new Date() },
      ],
    });
  });
  afterAll(() => prisma.$disconnect());

  it('associates independent settings, quotas and subscriptions with each organization', async () => {
    await prisma.organizationSettings.create({
      data: { organizationId: 'tenant-a', requireMfa: true, sessionMaxAgeSeconds: 3600 },
    });
    await prisma.organizationSettings.create({ data: { organizationId: 'tenant-b' } });
    await prisma.tenantQuota.create({
      data: { organizationId: 'tenant-a', maxMembers: 10, maxStorageBytes: 10_000_000_000n },
    });
    await prisma.tenantSubscription.create({
      data: { organizationId: 'tenant-a', planId: 'pro', status: 'TRIALING' },
    });

    const a = await prisma.organization.findUniqueOrThrow({
      where: { id: 'tenant-a' },
      include: { settings: true, quota: true, subscription: true },
    });
    const b = await prisma.organization.findUniqueOrThrow({
      where: { id: 'tenant-b' },
      include: { settings: true, quota: true, subscription: true },
    });
    expect(a).toMatchObject({
      status: 'ACTIVE',
      updatedAt: expect.any(Date),
      settings: { requireMfa: true, sessionMaxAgeSeconds: 3600 },
      quota: { maxMembers: 10, maxStorageBytes: 10_000_000_000n },
      subscription: { planId: 'pro', status: 'TRIALING' },
    });
    expect(b).toMatchObject({
      settings: { requireMfa: false, sessionMaxAgeSeconds: null, auditRetentionDays: null },
      quota: null,
      subscription: null,
    });
  });

  it('rejects orphans and duplicate tenant settings', async () => {
    await expect(
      prisma.organizationSettings.create({ data: { organizationId: 'missing' } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.tenantQuota.create({ data: { organizationId: 'missing' } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.tenantSubscription.create({ data: { organizationId: 'missing', planId: 'pro' } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await prisma.organizationSettings.create({ data: { organizationId: 'tenant-a' } });
    await expect(
      prisma.organizationSettings.create({ data: { organizationId: 'tenant-a' } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('enforces valid statuses, nonnegative quotas, positive durations and nonempty plans', async () => {
    await expect(
      prisma.organization.update({ where: { id: 'tenant-a' }, data: { status: 'INVALID' } }),
    ).rejects.toThrow();
    for (const field of ['maxMembers', 'maxAgents', 'maxAssessments'] as const) {
      await expect(
        prisma.tenantQuota.create({ data: { organizationId: 'tenant-a', [field]: -1 } }),
      ).rejects.toThrow();
    }
    await expect(
      prisma.tenantQuota.create({ data: { organizationId: 'tenant-a', maxStorageBytes: -1n } }),
    ).rejects.toThrow();
    for (const field of ['sessionMaxAgeSeconds', 'auditRetentionDays'] as const) {
      await expect(
        prisma.organizationSettings.create({ data: { organizationId: 'tenant-a', [field]: 0 } }),
      ).rejects.toThrow();
    }
    await expect(
      prisma.tenantSubscription.create({ data: { organizationId: 'tenant-a', planId: '  ' } }),
    ).rejects.toThrow();
  });

  it('deletes tenant configuration with its organization without affecting another tenant', async () => {
    for (const organizationId of ['tenant-a', 'tenant-b']) {
      await prisma.organizationSettings.create({ data: { organizationId } });
      await prisma.tenantQuota.create({ data: { organizationId } });
      await prisma.tenantSubscription.create({ data: { organizationId, planId: 'pro' } });
    }
    await prisma.organization.delete({ where: { id: 'tenant-a' } });
    for (const [organizationId, expected] of [
      ['tenant-a', 0],
      ['tenant-b', 1],
    ] as const) {
      const where = { organizationId };
      expect(
        await Promise.all([
          prisma.organizationSettings.count({ where }),
          prisma.tenantQuota.count({ where }),
          prisma.tenantSubscription.count({ where }),
        ]),
      ).toEqual([expected, expected, expected]);
    }
  });
});
