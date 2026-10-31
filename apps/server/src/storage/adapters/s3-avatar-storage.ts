import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  AVATAR_MAX_BYTES,
  avatarIdFromKey,
  type AvatarObject,
  type AvatarStorage,
} from '../avatar-storage';

/** Private bucket; reads are proxied through authorization in AvatarService. Compatible with R2. */
export class S3AvatarStorage implements AvatarStorage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}
  async put(key: string, body: Buffer): Promise<void> {
    avatarIdFromKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: 'image/webp',
        CacheControl: 'private, no-store',
        ContentLength: body.length,
        IfNoneMatch: '*',
      }),
    );
  }
  async get(key: string): Promise<Buffer | null> {
    avatarIdFromKey(key);
    try {
      const object = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if ((object.ContentLength ?? 0) > AVATAR_MAX_BYTES) {
        (object.Body as { destroy?: () => void } | undefined)?.destroy?.();
        throw new Error('Invalid stored avatar');
      }
      return object.Body ? Buffer.from(await object.Body.transformToByteArray()) : null;
    } catch (error) {
      if ((error as { name?: string }).name === 'NoSuchKey') return null;
      throw error;
    }
  }
  async delete(key: string): Promise<void> {
    avatarIdFromKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
  async *list(): AsyncIterable<AvatarObject> {
    let token: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: 'avatars/',
          ContinuationToken: token,
        }),
      );
      for (const object of page.Contents ?? []) {
        if (!object.Key || !object.LastModified) continue;
        try {
          avatarIdFromKey(object.Key);
        } catch {
          continue;
        }
        yield { key: object.Key, modifiedAt: object.LastModified };
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  }
}
