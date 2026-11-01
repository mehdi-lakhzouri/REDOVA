export const MEDIA_STORAGE = Symbol('MEDIA_STORAGE');

export interface StoredObject {
  key: string;
  modifiedAt: Date;
}

/**
 * Private object store port. Keys come from `mediaKey()`; adapters re-validate them, never serve
 * objects publicly and never overwrite an existing key.
 */
export interface MediaStorage {
  put(key: string, body: Buffer, options: { contentType: string }): Promise<void>;
  /** `null` when the object does not exist; throws when it is larger than `maxBytes`. */
  get(key: string, options: { maxBytes: number }): Promise<Buffer | null>;
  /** Idempotent. */
  delete(key: string): Promise<void>;
  /** Every valid media object under `prefix`, in no particular order. */
  list(prefix: string): AsyncIterable<StoredObject>;
  /** Releases network clients on shutdown. */
  close?(): void;
}
