import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ENV } from '../config/tokens';
import { createMediaStorage } from './create-media-storage';
import { ImageProcessor } from './image-processor';
import { MediaMutationGuard } from './media-mutation.guard';
import { MEDIA_STORAGE, type MediaStorage } from './media-storage';
import { MediaService } from './media.service';

/** Upload policy, processing and private storage for every image kind (avatars, logos, …). */
@Module({
  providers: [
    { provide: MEDIA_STORAGE, useFactory: createMediaStorage, inject: [ENV] },
    ImageProcessor,
    MediaService,
    MediaMutationGuard,
  ],
  exports: [MediaService, MediaMutationGuard],
})
export class MediaModule implements OnApplicationShutdown {
  constructor(@Inject(MEDIA_STORAGE) private readonly storage: MediaStorage) {}
  onApplicationShutdown(): void {
    this.storage.close?.();
  }
}
