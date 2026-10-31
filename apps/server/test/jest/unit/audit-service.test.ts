import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import type { AuditEventInput } from '@redova/contracts';
import type { PrismaClient } from '@redova/db';
import { AuditService } from '../../../src/audit/audit.service';

const event: AuditEventInput = {
  action: 'admin.user.banned',
  outcome: 'SUCCESS',
  actorType: 'USER',
  actorUserId: 'actor',
  targetType: 'USER',
  targetId: 'target',
  metadata: { expiresInDays: 7 },
};
const fixture = (production = false) => {
  const create = jest
    .fn<(input: unknown) => Promise<{ id: string }>>()
    .mockResolvedValue({ id: 'event-id' });
  const prisma = { auditEvent: { create } } as unknown as PrismaClient;
  return {
    create,
    service: new AuditService(prisma, { NODE_ENV: production ? 'production' : 'test' }),
  };
};

describe('audit write guarantees', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('persists an allowed event with neutral context outside a request', async () => {
    const { create, service } = fixture();
    await service.record(event);
    expect(create).toHaveBeenCalledWith({
      data: { ...event, ipAddress: null, userAgent: null, requestId: null },
      select: { id: true },
    });
  });
  it('rejects unknown event actions before storage', async () => {
    const { create, service } = fixture();
    await expect(
      service.record({ ...event, action: 'unknown' } as unknown as AuditEventInput),
    ).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
  it('rejects unlisted metadata outside production', async () => {
    const { create, service } = fixture();
    await expect(
      service.record({ ...event, metadata: { expiresInDays: 7, password: 'secret' } }),
    ).rejects.toThrow('Audit metadata keys not allowed');
    expect(create).not.toHaveBeenCalled();
  });
  it('strips unlisted metadata in production and never logs its values', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { create, service } = fixture(true);
    await service.record({ ...event, metadata: { expiresInDays: 7, password: 'private-value' } });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ metadata: { expiresInDays: 7 } }),
      }),
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private-value');
  });
  it('logs storage failures and preserves the caller operation', async () => {
    const error = new Error('storage unavailable');
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { create, service } = fixture();
    create.mockRejectedValue(error);
    await expect(service.record(event)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ err: error, action: event.action }),
      'Audit write failed',
    );
  });
});
