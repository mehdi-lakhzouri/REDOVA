import { constants } from 'node:fs';
import { mkdir, open, readdir, rmdir, stat, unlink } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { parseMediaKey } from '../media-key';
import type { MediaStorage, StoredObject } from '../media-storage';

const isMissing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';

/**
 * Development and single-host storage. The root must be private to the service account and is
 * never served statically: `{root}/users/{userId}/avatars/{uuid}.webp`, directories 0700, files
 * 0600, written exclusively (no overwrite) and read without following symbolic links.
 */
export class LocalMediaStorage implements MediaStorage {
  private readonly root: string;
  constructor(directory: string) {
    this.root = resolve(directory);
  }

  private path(key: string): string {
    parseMediaKey(key);
    const path = join(this.root, ...key.split('/'));
    if (!path.startsWith(this.root + sep)) throw new Error('Invalid media key');
    return path;
  }

  async put(key: string, body: Buffer, _options?: { contentType: string }): Promise<void> {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
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

  async get(key: string, { maxBytes }: { maxBytes: number }): Promise<Buffer | null> {
    try {
      const file = await open(this.path(key), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try {
        const metadata = await file.stat();
        if (!metadata.isFile() || metadata.size > maxBytes) throw new Error('Invalid stored media');
        return await file.readFile();
      } finally {
        await file.close();
      }
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    const path = this.path(key);
    try {
      await unlink(path);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    // Drop now-empty owner directories so deleted accounts leave no trace on disk.
    for (let dir = dirname(path); dir.startsWith(this.root + sep); dir = dirname(dir)) {
      try {
        await rmdir(dir);
      } catch {
        break;
      }
    }
  }

  async *list(prefix: string): AsyncIterable<StoredObject> {
    yield* this.walk(join(this.root, ...prefix.split('/').filter(Boolean)));
  }

  private async *walk(directory: string): AsyncIterable<StoredObject> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        yield* this.walk(path);
        continue;
      }
      if (!entry.isFile()) continue;
      const key = relative(this.root, path).split(sep).join('/');
      try {
        parseMediaKey(key);
      } catch {
        continue; // Not a media object (temporary or foreign file).
      }
      try {
        yield { key, modifiedAt: (await stat(path)).mtime };
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
    }
  }
}
