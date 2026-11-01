import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { parseMediaKey } from '../media-key';
import type { MediaStorage, StoredObject } from '../media-storage';

/**
 * Production storage on a private AWS S3 or Cloudflare R2 bucket (S3 API). Objects are written
 * once (`If-None-Match: *`) and only ever read back through the API's authorization checks.
 */
export class S3MediaStorage implements MediaStorage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  async put(key: string, body: Buffer, { contentType }: { contentType: string }): Promise<void> {
    parseMediaKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: 'private, no-store',
        ContentLength: body.length,
        IfNoneMatch: '*',
      }),
    );
  }

  async get(key: string, { maxBytes }: { maxBytes: number }): Promise<Buffer | null> {
    parseMediaKey(key);
    try {
      const object = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if ((object.ContentLength ?? 0) > maxBytes) {
        (object.Body as { destroy?: () => void } | undefined)?.destroy?.();
        throw new Error('Invalid stored media');
      }
      return object.Body ? Buffer.from(await object.Body.transformToByteArray()) : null;
    } catch (error) {
      if ((error as { name?: string }).name === 'NoSuchKey') return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    parseMediaKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async *list(prefix: string): AsyncIterable<StoredObject> {
    let token: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }),
      );
      for (const object of page.Contents ?? []) {
        if (!object.Key || !object.LastModified) continue;
        try {
          parseMediaKey(object.Key);
        } catch {
          continue;
        }
        yield { key: object.Key, modifiedAt: object.LastModified };
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  }

  close(): void {
    this.client.destroy();
  }
}
