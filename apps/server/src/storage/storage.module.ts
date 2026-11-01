import { S3Client } from '@aws-sdk/client-s3';
import { join } from 'node:path';
import { ORGANIZATION_LOGO_MAX_BYTES } from '@redova/contracts';
import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import type { Env } from '../config/env';
import { ENV } from '../config/tokens';
import { AVATAR_STORAGE, type AvatarStorage } from './avatar-storage';
import { LocalAvatarStorage } from './adapters/local-avatar-storage';
import { S3AvatarStorage } from './adapters/s3-avatar-storage';
import { type ImageNamespace } from './image-object';
import { AVATAR_MAX_BYTES } from './avatar-storage';

export const ORGANIZATION_LOGO_STORAGE = Symbol('ORGANIZATION_LOGO_STORAGE');

const createImageStorage = (
  env: Env,
  namespace: ImageNamespace,
  maxBytes: number,
  directory: string,
): AvatarStorage & { destroy?: () => void } => {
  if (env.AVATAR_STORAGE === 'local') return new LocalAvatarStorage(directory, namespace, maxBytes);
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
  const storage = new S3AvatarStorage(client, env.AVATAR_S3_BUCKET!, namespace, maxBytes);
  return Object.assign(storage, { destroy: () => client.destroy() });
};
export const createAvatarStorage = (env: Env) =>
  createImageStorage(env, 'avatars', AVATAR_MAX_BYTES, env.AVATAR_LOCAL_DIR);
export const createOrganizationLogoStorage = (env: Env) =>
  createImageStorage(
    env,
    'organization-logos',
    ORGANIZATION_LOGO_MAX_BYTES,
    join(env.AVATAR_LOCAL_DIR, 'organization-logos'),
  );

@Module({
  providers: [
    { provide: AVATAR_STORAGE, useFactory: createAvatarStorage, inject: [ENV] },
    {
      provide: ORGANIZATION_LOGO_STORAGE,
      useFactory: createOrganizationLogoStorage,
      inject: [ENV],
    },
  ],
  exports: [AVATAR_STORAGE, ORGANIZATION_LOGO_STORAGE],
})
export class StorageModule implements OnApplicationShutdown {
  constructor(
    @Inject(AVATAR_STORAGE) private readonly storage: AvatarStorage & { destroy?: () => void },
    @Inject(ORGANIZATION_LOGO_STORAGE)
    private readonly logos: AvatarStorage & { destroy?: () => void },
  ) {}
  onApplicationShutdown(): void {
    this.storage.destroy?.();
    this.logos.destroy?.();
  }
}
