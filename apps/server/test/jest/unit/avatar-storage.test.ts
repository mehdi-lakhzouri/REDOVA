import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { mkdtemp, readdir, rmdir, unlink, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { S3Client } from '@aws-sdk/client-s3';
import type { PrismaClient } from '@redova/db';
import { LocalAvatarStorage } from '../../../src/storage/adapters/local-avatar-storage';
import { S3AvatarStorage } from '../../../src/storage/adapters/s3-avatar-storage';
import { avatarKey } from '../../../src/storage/avatar-storage';
import { pruneAvatars } from '../../../src/storage/prune-avatars';

describe('private local storage and orphan recovery', () => {
  let directory: string;
  let storage: LocalAvatarStorage;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'redova-avatars-'));
    storage = new LocalAvatarStorage(directory);
  });
  afterEach(async () => {
    for (const file of await readdir(directory)) await unlink(join(directory, file));
    await rmdir(directory);
  });
  it('writes, reads and deletes idempotently', async () => {
    const key = avatarKey(randomUUID());
    await storage.put(key, Buffer.from('webp'));
    expect(await storage.get(key)).toEqual(Buffer.from('webp'));
    await expect(storage.put(key, Buffer.from('overwrite'))).rejects.toThrow();
    await storage.delete(key);
    await storage.delete(key);
    expect(await storage.get(key)).toBeNull();
  });
  it.each(['../../secret', '/etc/passwd', 'avatars/../../x.webp', 'avatars/not-a-uuid.webp'])(
    'refuses an unsafe key %s',
    async (key) => {
      await expect(storage.put(key, Buffer.from('x'))).rejects.toThrow();
      await expect(storage.get(key)).rejects.toThrow();
      await expect(storage.delete(key)).rejects.toThrow();
    },
  );
  it('keeps current and recent files, dry-runs then deletes only old orphans', async () => {
    const keys = [avatarKey(randomUUID()), avatarKey(randomUUID()), avatarKey(randomUUID())];
    for (const key of keys) await storage.put(key, Buffer.from('webp'));
    const old = new Date(Date.now() - 2 * 86_400_000);
    for (const key of keys.slice(0, 2))
      await utimes(join(directory, key.slice('avatars/'.length)), old, old);
    const findFirst = jest
      .fn<(input: unknown) => Promise<unknown>>()
      .mockResolvedValueOnce({ id: 'current-user' })
      .mockResolvedValueOnce(null);
    const prisma = { user: { findFirst } } as unknown as PrismaClient;
    // Choose one existing object as retained, independently of directory enumeration order.
    const objects = [];
    for await (const object of storage.list()) objects.push(object);
    const oldObjects = objects.filter(
      (object) => object.modifiedAt.getTime() < Date.now() - 86_400_000,
    );
    findFirst.mockReset().mockImplementation((input) => {
      const query = input as { where: { image: { endsWith: string } } };
      return Promise.resolve(
        query.where.image.endsWith.endsWith(oldObjects[0].key.slice(8, -5))
          ? { id: 'current-user' }
          : null,
      );
    });
    expect(await pruneAvatars(storage, prisma)).toEqual({ candidates: 1, deleted: 0 });
    expect(await readdir(directory)).toHaveLength(3);
    expect(await pruneAvatars(storage, prisma, { apply: true })).toEqual({
      candidates: 1,
      deleted: 1,
    });
    expect(await readdir(directory)).toHaveLength(2);
  });
});

describe('S3 / R2 adapter', () => {
  const fixture = () => {
    const send = jest.fn<(command: unknown) => Promise<Record<string, unknown>>>();
    return {
      send,
      storage: new S3AvatarStorage({ send } as unknown as S3Client, 'private-avatars'),
    };
  };
  it('writes private WebP objects without overwriting', async () => {
    const { send, storage } = fixture();
    send.mockResolvedValue({});
    const key = avatarKey(randomUUID());
    await storage.put(key, Buffer.from('pixels'));
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Bucket: 'private-avatars',
          Key: key,
          ContentType: 'image/webp',
          CacheControl: 'private, no-store',
          IfNoneMatch: '*',
        }),
      }),
    );
  });
  it('decodes an SDK response body and distinguishes missing objects from outages', async () => {
    const { send, storage } = fixture();
    const key = avatarKey(randomUUID());
    send.mockResolvedValueOnce({
      Body: { transformToByteArray: () => Promise.resolve(new Uint8Array([1, 2])) },
    });
    expect(await storage.get(key)).toEqual(Buffer.from([1, 2]));
    send.mockRejectedValueOnce({ name: 'NoSuchKey' });
    expect(await storage.get(key)).toBeNull();
    send.mockRejectedValueOnce(new Error('AccessDenied'));
    await expect(storage.get(key)).rejects.toThrow('AccessDenied');
  });
  it('uses continuation tokens and ignores objects outside its namespace', async () => {
    const { send, storage } = fixture();
    const date = new Date();
    const key1 = avatarKey(randomUUID());
    const key2 = avatarKey(randomUUID());
    send
      .mockResolvedValueOnce({
        Contents: [{ Key: key1, LastModified: date }],
        IsTruncated: true,
        NextContinuationToken: 'page-2',
      })
      .mockResolvedValueOnce({
        Contents: [
          { Key: 'avatars/other.txt', LastModified: date },
          { Key: key2, LastModified: date },
        ],
      });
    const objects = [];
    for await (const object of storage.list()) objects.push(object.key);
    expect(objects).toEqual([key1, key2]);
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ ContinuationToken: 'page-2', Prefix: 'avatars/' }),
      }),
    );
  });
});
