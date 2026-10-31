import { S3Client } from '@aws-sdk/client-s3';
import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import type { Env } from '../config/env';
import { ENV } from '../config/tokens';
import { AVATAR_STORAGE, type AvatarStorage } from './avatar-storage';
import { LocalAvatarStorage } from './adapters/local-avatar-storage';
import { S3AvatarStorage } from './adapters/s3-avatar-storage';

export const createAvatarStorage = (env: Env): AvatarStorage & { destroy?: () => void } => {
  if (env.AVATAR_STORAGE === 'local') return new LocalAvatarStorage(env.AVATAR_LOCAL_DIR);
  const client = new S3Client({
    region: env.AVATAR_S3_REGION,
    endpoint: env.AVATAR_S3_ENDPOINT,
    forcePathStyle: env.AVATAR_S3_FORCE_PATH_STYLE,
    maxAttempts: 3,
    requestHandler: { connectionTimeout: 3_000, requestTimeout: 10_000 },
    // Match S3/R2 checksum support; TLS still protects data in transit.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    ...(env.AVATAR_S3_ACCESS_KEY_ID
      ? {
          credentials: {
            accessKeyId: env.AVATAR_S3_ACCESS_KEY_ID,
            secretAccessKey: env.AVATAR_S3_SECRET_ACCESS_KEY!,
          },
        }
      : {}),
  });
  const storage = new S3AvatarStorage(client, env.AVATAR_S3_BUCKET!);
  return Object.assign(storage, { destroy: () => client.destroy() });
};

@Module({
  providers: [{ provide: AVATAR_STORAGE, useFactory: createAvatarStorage, inject: [ENV] }],
  exports: [AVATAR_STORAGE],
})
export class StorageModule implements OnApplicationShutdown {
  constructor(
    @Inject(AVATAR_STORAGE) private readonly storage: AvatarStorage & { destroy?: () => void },
  ) {}
  onApplicationShutdown(): void {
    this.storage.destroy?.();
  }
}
