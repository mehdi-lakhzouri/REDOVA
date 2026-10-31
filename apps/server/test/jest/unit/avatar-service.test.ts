import { describe, expect, it, jest } from '@jest/globals';
import { Logger, type ExecutionContext } from '@nestjs/common';
import type { PrismaClient } from '@redova/db';
import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import type { AuditService } from '../../../src/audit/audit.service';
import type { Env } from '../../../src/config/env';
import type { AvatarStorage } from '../../../src/storage/avatar-storage';
import { AvatarService } from '../../../src/profile/avatar.service';
import type { AvatarImageService } from '../../../src/profile/avatar-image.service';
import { AvatarMutationGuard } from '../../../src/profile/avatar-mutation.guard';

const fixture = () => {
  const oldId = randomUUID();
  const previous = `http://localhost:3001/api/v1/avatars/${oldId}`;
  const put = jest.fn<AvatarStorage['put']>().mockResolvedValue(undefined);
  const remove = jest.fn<AvatarStorage['delete']>().mockResolvedValue(undefined);
  const update = jest.fn<(input: unknown) => Promise<unknown>>().mockResolvedValue({});
  const transaction = jest
    .fn<(callback: (tx: unknown) => Promise<unknown>) => Promise<unknown>>()
    .mockImplementation(async (callback) =>
      callback({
        $queryRaw: jest.fn<() => Promise<unknown>>().mockResolvedValue([]),
        user: { findUniqueOrThrow: () => Promise.resolve({ image: previous }), update },
      }),
    );
  const prisma = { $transaction: transaction } as unknown as PrismaClient;
  const record = jest.fn<AuditService['record']>().mockResolvedValue(undefined);
  const normalize = jest
    .fn<AvatarImageService['normalize']>()
    .mockResolvedValue(Buffer.from('normalized'));
  const service = new AvatarService(
    prisma,
    { BETTER_AUTH_URL: 'http://localhost:3001' } as Env,
    { put, delete: remove } as unknown as AvatarStorage,
    { normalize },
    { record } as unknown as AuditService,
  );
  return { service, put, remove, transaction, update, normalize, record, oldId };
};

describe('avatar replacement failure guarantees', () => {
  it('never changes the database when image validation fails', async () => {
    const f = fixture();
    f.normalize.mockRejectedValue(new Error('invalid image'));
    await expect(f.service.upload('user', Buffer.from('input'))).rejects.toThrow('invalid image');
    expect(f.put).not.toHaveBeenCalled();
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it('never changes the database when storage fails', async () => {
    const f = fixture();
    f.put.mockRejectedValue(new Error('storage unavailable'));
    await expect(f.service.upload('user', Buffer.from('input'))).rejects.toThrow(
      'storage unavailable',
    );
    expect(f.transaction).not.toHaveBeenCalled();
    expect(f.remove).not.toHaveBeenCalled();
  });
  it('compensates the new object if the database write fails, preserving the old object', async () => {
    const f = fixture();
    f.transaction.mockRejectedValue(new Error('database unavailable'));
    await expect(f.service.upload('user', Buffer.from('input'))).rejects.toThrow(
      'database unavailable',
    );
    expect(f.remove).toHaveBeenCalledWith(f.put.mock.calls[0][0]);
    expect(f.remove).not.toHaveBeenCalledWith(`avatars/${f.oldId}.webp`);
    expect(f.record).not.toHaveBeenCalled();
  });
  it('cleans the old object after commit and audits the update', async () => {
    const f = fixture();
    const result = await f.service.upload('user', Buffer.from('input'));
    expect(f.update).toHaveBeenCalledWith({ where: { id: 'user' }, data: { image: result.image } });
    expect(f.remove).toHaveBeenCalledWith(`avatars/${f.oldId}.webp`);
    expect(f.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'profile.avatar.updated' }),
    );
  });
  it('preserves a committed update if old-object cleanup fails and records recovery information', async () => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const f = fixture();
    f.remove.mockRejectedValue(new Error('delete unavailable'));
    await expect(f.service.upload('user', Buffer.from('input'))).resolves.toHaveProperty('image');
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ key: `avatars/${f.oldId}.webp` }),
      expect.stringContaining('avatars:prune'),
    );
  });
});

describe('avatar upload rate guard', () => {
  const req = { session: { user: { id: 'user', emailVerified: true } } };
  const context = (setHeader = jest.fn()) =>
    ({
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({ setHeader }) }),
    }) as unknown as ExecutionContext;
  it('allows requests below the shared per-account limit', async () => {
    const evalRedis = jest.fn<() => Promise<number>>().mockResolvedValue(10);
    const guard = new AvatarMutationGuard(
      { eval: evalRedis } as unknown as Redis,
      { RATE_LIMIT_ENABLED: true } as Env,
    );
    expect(await guard.canActivate(context())).toBe(true);
    expect(evalRedis).toHaveBeenCalledTimes(1);
  });
  it('rejects the eleventh request and returns Retry-After', async () => {
    const setHeader = jest.fn();
    const guard = new AvatarMutationGuard(
      { eval: () => Promise.resolve(11) } as unknown as Redis,
      { RATE_LIMIT_ENABLED: true } as Env,
    );
    await expect(guard.canActivate(context(setHeader))).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '600');
  });
});

describe('private avatar reads', () => {
  it.each([
    ['owner', 'USER', false, true],
    ['colleague', 'USER', false, true],
    ['outsider', 'USER', false, false],
    ['admin', 'PLATFORM_ADMIN', true, true],
    ['admin', 'PLATFORM_ADMIN', false, false],
  ] as const)('checks viewer %s / %s / MFA=%s', async (id, role, twoFactorEnabled, allowed) => {
    const avatarId = randomUUID();
    const membership = jest
      .fn<(input: unknown) => Promise<unknown>>()
      .mockResolvedValue(id === 'colleague' ? { id: 'membership' } : null);
    const get = jest.fn<AvatarStorage['get']>().mockResolvedValue(Buffer.from('pixels'));
    const prisma = {
      user: { findFirst: () => Promise.resolve({ id: 'owner' }) },
      member: { findFirst: membership },
    } as unknown as PrismaClient;
    const service = new AvatarService(
      prisma,
      { BETTER_AUTH_URL: 'http://localhost:3001' } as Env,
      { get } as unknown as AvatarStorage,
      { normalize: jest.fn<AvatarImageService['normalize']>() },
      {} as AuditService,
    );
    const result = service.read(avatarId, {
      id,
      role,
      twoFactorEnabled,
      email: 'viewer@example.test',
      emailVerified: true,
    });
    if (allowed) await expect(result).resolves.toEqual(Buffer.from('pixels'));
    else {
      await expect(result).rejects.toMatchObject({ code: 'AVATAR_NOT_FOUND' });
      expect(get).not.toHaveBeenCalled();
    }
    if (id === 'colleague' || id === 'outsider' || (id === 'admin' && !twoFactorEnabled)) {
      expect(membership).toHaveBeenCalledWith({
        where: {
          userId: id,
          status: 'ACTIVE',
          organization: {
            status: 'ACTIVE',
            members: { some: { userId: 'owner', status: 'ACTIVE' } },
          },
        },
        select: { id: true },
      });
    } else expect(membership).not.toHaveBeenCalled();
  });
});
