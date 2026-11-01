import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { mkdtemp, readdir, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { S3Client } from '@aws-sdk/client-s3';
import type { PrismaClient } from '@redova/db';
import { LocalMediaStorage } from '../../../src/media/adapters/local-media-storage';
import { S3MediaStorage } from '../../../src/media/adapters/s3-media-storage';
import { mediaKey, parseMediaKey } from '../../../src/media/media-key';
import { pruneMedia } from '../../../src/media/prune-media';

const webp = { contentType: 'image/webp' };
const limit = { maxBytes: 1024 };
const avatar = (ownerId = 'user1', id = randomUUID()) => mediaKey({ kind: 'avatar', ownerId, id });

describe('media key layout', () => {
  it('groups objects by owner and round-trips', () => {
    const id = randomUUID();
    expect(mediaKey({ kind: 'avatar', ownerId: 'u1', id })).toBe(`users/u1/avatars/${id}.webp`);
    const logo = mediaKey({ kind: 'organizationLogo', ownerId: 'org_1', id });
    expect(logo).toBe(`organizations/org_1/logos/${id}.webp`);
    expect(parseMediaKey(logo)).toEqual({ kind: 'organizationLogo', ownerId: 'org_1', id });
  });
  it.each([
    '../../secret',
    '/etc/passwd',
    'users/../../x.webp',
    'users/u1/avatars/not-a-uuid.webp',
    `users/u1/logos/${randomUUID()}.webp`,
    `users/u.1/avatars/${randomUUID()}.webp`,
    `users/u1/avatars/${randomUUID()}.png`,
    `users/u1/avatars/x/${randomUUID()}.webp`,
  ])('rejects %s', (key) => {
    expect(() => parseMediaKey(key)).toThrow();
  });
  it('refuses owner identifiers that could change the path', () => {
    expect(() => avatar('../x')).toThrow();
    expect(() => avatar('a/b')).toThrow();
  });
});

describe('local media storage', () => {
  let directory: string;
  let storage: LocalMediaStorage;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'redova-media-'));
    storage = new LocalMediaStorage(directory);
  });
  afterEach(() => rm(directory, { recursive: true, force: true }));

  it('writes under the owner folder, never overwrites, deletes idempotently', async () => {
    const key = avatar();
    await storage.put(key, Buffer.from('webp'), webp);
    expect(await readdir(join(directory, 'users', 'user1', 'avatars'))).toHaveLength(1);
    expect(await storage.get(key, limit)).toEqual(Buffer.from('webp'));
    await expect(storage.put(key, Buffer.from('overwrite'), webp)).rejects.toThrow();
    await storage.delete(key);
    await storage.delete(key);
    expect(await storage.get(key, limit)).toBeNull();
    // Empty owner folders are removed with the last object.
    expect(await readdir(directory)).toHaveLength(0);
  });
  it('refuses oversized stored objects', async () => {
    const key = avatar();
    await storage.put(key, Buffer.alloc(10), webp);
    await expect(storage.get(key, { maxBytes: 5 })).rejects.toThrow();
  });
  it.each(['../../secret', '/etc/passwd', 'users/../../x.webp'])(
    'refuses an unsafe key %s',
    async (key) => {
      await expect(storage.put(key, Buffer.from('x'), webp)).rejects.toThrow();
      await expect(storage.get(key, limit)).rejects.toThrow();
      await expect(storage.delete(key)).rejects.toThrow();
    },
  );
  it('lists objects of every owner under a prefix', async () => {
    const keys = [avatar('a'), avatar('b'), avatar('b')];
    for (const key of keys) await storage.put(key, Buffer.from('x'), webp);
    await storage.put(
      mediaKey({ kind: 'organizationLogo', ownerId: 'org', id: randomUUID() }),
      Buffer.from('x'),
      webp,
    );
    const listed = [];
    for await (const object of storage.list('users/')) listed.push(object.key);
    expect(listed.sort()).toEqual([...keys].sort());
  });
});

describe('orphan pruning', () => {
  let directory: string;
  let storage: LocalMediaStorage;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'redova-media-prune-'));
    storage = new LocalMediaStorage(directory);
  });
  afterEach(() => rm(directory, { recursive: true, force: true }));

  it('keeps referenced and recent objects, dry-runs, then deletes old orphans', async () => {
    const [referenced, orphan, recent] = [avatar('a'), avatar('a'), avatar('b')];
    for (const key of [referenced, orphan, recent]) await storage.put(key, Buffer.from('x'), webp);
    const old = new Date(Date.now() - 2 * 86_400_000);
    for (const key of [referenced, orphan]) await utimes(join(directory, key), old, old);
    const findFirst = jest.fn((input: unknown) => {
      const { where } = input as { where: { id: string; image: { endsWith: string } } };
      const { ownerId, id } = parseMediaKey(referenced);
      return Promise.resolve(
        where.id === ownerId && where.image.endsWith === `/api/v1/avatars/${id}` ? { id } : null,
      );
    });
    const prisma = { user: { findFirst } } as unknown as PrismaClient;
    expect(await pruneMedia(storage, prisma, 'avatar')).toEqual({
      kind: 'avatar',
      candidates: 1,
      deleted: 0,
    });
    expect(await storage.get(orphan, limit)).not.toBeNull();
    expect(await pruneMedia(storage, prisma, 'avatar', { apply: true })).toMatchObject({
      deleted: 1,
    });
    expect(await storage.get(orphan, limit)).toBeNull();
    expect(await storage.get(referenced, limit)).not.toBeNull();
    expect(await storage.get(recent, limit)).not.toBeNull();
  });
});

describe('S3 / R2 media storage', () => {
  const fixture = () => {
    const send = jest.fn<(command: unknown) => Promise<Record<string, unknown>>>();
    return { send, storage: new S3MediaStorage({ send } as unknown as S3Client, 'private-media') };
  };
  it('writes private immutable objects with the processed content type', async () => {
    const { send, storage } = fixture();
    send.mockResolvedValue({});
    const key = avatar();
    await storage.put(key, Buffer.from('pixels'), webp);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Bucket: 'private-media',
          Key: key,
          ContentType: 'image/webp',
          CacheControl: 'private, no-store',
          IfNoneMatch: '*',
        }),
      }),
    );
    send.mockClear();
    await expect(storage.delete('avatars/legacy.webp')).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
  it('decodes bodies, enforces the size limit and distinguishes missing objects', async () => {
    const { send, storage } = fixture();
    const key = avatar();
    send.mockResolvedValueOnce({
      Body: { transformToByteArray: () => Promise.resolve(new Uint8Array([1, 2])) },
    });
    expect(await storage.get(key, limit)).toEqual(Buffer.from([1, 2]));
    const destroy = jest.fn();
    send.mockResolvedValueOnce({ ContentLength: 2048, Body: { destroy } });
    await expect(storage.get(key, limit)).rejects.toThrow();
    expect(destroy).toHaveBeenCalledTimes(1);
    send.mockRejectedValueOnce({ name: 'NoSuchKey' });
    expect(await storage.get(key, limit)).toBeNull();
    send.mockRejectedValueOnce(new Error('AccessDenied'));
    await expect(storage.get(key, limit)).rejects.toThrow('AccessDenied');
  });
  it('follows continuation tokens and skips foreign objects', async () => {
    const { send, storage } = fixture();
    const date = new Date();
    const [key1, key2] = [avatar('a'), avatar('b')];
    send
      .mockResolvedValueOnce({
        Contents: [{ Key: key1, LastModified: date }],
        IsTruncated: true,
        NextContinuationToken: 'page-2',
      })
      .mockResolvedValueOnce({
        Contents: [
          { Key: 'users/a/avatars/other.txt', LastModified: date },
          { Key: key2, LastModified: date },
        ],
      });
    const keys = [];
    for await (const object of storage.list('users/')) keys.push(object.key);
    expect(keys).toEqual([key1, key2]);
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ ContinuationToken: 'page-2', Prefix: 'users/' }),
      }),
    );
  });
});
