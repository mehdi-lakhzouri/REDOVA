import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditEventRepository } from './audit-event.repository';
import { createPrismaClient, type PrismaClient } from './client';
import { getTestDatabaseUrl, loadTestEnv, resetDatabase } from './test';

describe('audit_event (IT-001-03, IT-001-10)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    loadTestEnv();
    prisma = createPrismaClient(getTestDatabaseUrl());
  });
  beforeEach(() => resetDatabase(prisma));
  afterAll(() => prisma.$disconnect());

  it('has every table, REDOVA constraint and the immutability trigger after migrations (AC-001-06)', async () => {
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
    expect(tables.map((t) => t.tablename)).toEqual(
      expect.arrayContaining([
        'account',
        'audit_event',
        'invitation',
        'member',
        'organization',
        'session',
        'twoFactor',
        'user',
        'verification',
      ]),
    );
    const indexes = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`;
    const names = indexes.map((i) => i.indexname);
    expect(names).toEqual(
      expect.arrayContaining([
        'member_organizationId_userId_key',
        'user_createdAt_id_idx',
        'invitation_organizationId_status_idx',
      ]),
    );
    const triggers = await prisma.$queryRaw<{ tgname: string }[]>`
      SELECT tgname FROM pg_trigger WHERE tgname = 'audit_event_immutable'`;
    expect(triggers).toHaveLength(1);
  });

  it('persists an audit event with a time-ordered UUIDv7 id', async () => {
    const repository = new AuditEventRepository(prisma);
    const first = await repository.create({
      action: 'auth.sign_out',
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorUserId: 'u1',
    });
    const second = await repository.create({
      action: 'auth.sign_out',
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorUserId: 'u1',
      metadata: { scope: 'one' },
    });
    expect(first.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
    expect(second.id > first.id).toBe(true);
    const stored = await prisma.auditEvent.findUniqueOrThrow({ where: { id: second.id } });
    expect(stored).toMatchObject({ actorUserId: 'u1', metadata: { scope: 'one' } });
  });

  it('rejects UPDATE and DELETE (AC-001-07)', async () => {
    const { id } = await new AuditEventRepository(prisma).create({
      action: 'auth.sign_out',
      outcome: 'SUCCESS',
      actorType: 'USER',
    });
    await expect(
      prisma.auditEvent.update({ where: { id }, data: { action: 'tampered' } }),
    ).rejects.toThrow(/append-only/);
    await expect(prisma.auditEvent.delete({ where: { id } })).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRaw`UPDATE audit_event SET action = 'tampered'`).rejects.toThrow(
      /append-only/,
    );
    const row = await prisma.auditEvent.findUniqueOrThrow({ where: { id } });
    expect(row.action).toBe('auth.sign_out');
  });
});
