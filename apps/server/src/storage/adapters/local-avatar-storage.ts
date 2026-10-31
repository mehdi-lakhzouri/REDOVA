import { constants } from 'node:fs';
import { mkdir, open, readdir, stat, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  AVATAR_MAX_BYTES,
  avatarIdFromKey,
  type AvatarObject,
  type AvatarStorage,
} from '../avatar-storage';

/** Root must be private and writable only by the service account. Files are never served statically. */
export class LocalAvatarStorage implements AvatarStorage {
  private readonly root: string;
  constructor(directory: string) {
    this.root = resolve(directory);
  }
  private path(key: string): string {
    return join(this.root, `${avatarIdFromKey(key)}.webp`);
  }
  async put(key: string, body: Buffer): Promise<void> {
    const path = this.path(key);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const file = await open(path, 'wx', 0o600);
    try {
      await file.writeFile(body);
    } catch (error) {
      await file.close();
      await unlink(path).catch(() => undefined);
      throw error;
    }
    await file.close();
  }
  async get(key: string): Promise<Buffer | null> {
    try {
      const file = await open(this.path(key), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try {
        const metadata = await file.stat();
        if (!metadata.isFile() || metadata.size > AVATAR_MAX_BYTES)
          throw new Error('Invalid stored avatar');
        return await file.readFile();
      } finally {
        await file.close();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  async delete(key: string): Promise<void> {
    try {
      await unlink(this.path(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  async *list(): AsyncIterable<AvatarObject> {
    let files;
    try {
      files = await readdir(this.root, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    for (const file of files) {
      if (!file.isFile()) continue;
      const key = `avatars/${file.name}`;
      try {
        avatarIdFromKey(key);
      } catch {
        continue;
      }
      try {
        yield { key, modifiedAt: (await stat(this.path(key))).mtime };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
  }
}
