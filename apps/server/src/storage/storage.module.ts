import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import type { Env } from '../config/env';
import { ENV } from '../config/tokens';
import { AVATAR_STORAGE, type AvatarStorage } from './avatar-storage';
import { LocalAvatarStorage } from './adapters/local-avatar-storage';

export const createAvatarStorage = (env: Env): AvatarStorage & { destroy?: () => void } =>
  new LocalAvatarStorage(env.AVATAR_LOCAL_DIR);

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
