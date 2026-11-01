import { S3Client } from '@aws-sdk/client-s3';
import type { Env } from '../config/env';
import { LocalMediaStorage } from './adapters/local-media-storage';
import { S3MediaStorage } from './adapters/s3-media-storage';
import type { MediaStorage } from './media-storage';

/** `MEDIA_STORAGE=local` for development, `s3` for AWS S3 or Cloudflare R2 in production. */
export function createMediaStorage(env: Env): MediaStorage {
  if (env.MEDIA_STORAGE === 'local') return new LocalMediaStorage(env.MEDIA_LOCAL_DIR);
  const client = new S3Client({
    region: env.MEDIA_S3_REGION,
    endpoint: env.MEDIA_S3_ENDPOINT,
    forcePathStyle: env.MEDIA_S3_FORCE_PATH_STYLE,
    maxAttempts: 3,
    requestHandler: { connectionTimeout: 3_000, requestTimeout: 10_000 },
    // R2 does not support every S3 checksum mode; TLS still protects data in transit.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    ...(env.MEDIA_S3_ACCESS_KEY_ID
      ? {
          credentials: {
            accessKeyId: env.MEDIA_S3_ACCESS_KEY_ID,
            secretAccessKey: env.MEDIA_S3_SECRET_ACCESS_KEY!,
          },
        }
      : {}),
  });
  return new S3MediaStorage(client, env.MEDIA_S3_BUCKET!);
}
