import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { mkdtemp, readdir, rmdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { LocalAvatarStorage } from '../../../src/storage/adapters/local-avatar-storage';
import { avatarKey } from '../../../src/storage/avatar-storage';

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
});
