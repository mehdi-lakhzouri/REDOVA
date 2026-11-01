import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { MEDIA_POLICIES, type MediaKind } from '@redova/contracts';
import { ApiException } from '../common/api-exception';
import { ImageProcessor } from './image-processor';
import { isMediaId, mediaKey } from './media-key';
import { MEDIA_STORAGE, type MediaStorage } from './media-storage';

export interface StoredMedia {
  id: string;
  key: string;
}

/**
 * Single entry point for image uploads of every kind. Feature services keep the domain rules
 * (who may change or read what, which column references the image); this service owns
 * validation, processing, naming and storage.
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  constructor(
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
    private readonly images: ImageProcessor,
  ) {}

  /** Validates, re-encodes and writes a new immutable object. Nothing is stored on rejection. */
  async store(kind: MediaKind, ownerId: string, input: Buffer): Promise<StoredMedia> {
    const { body, contentType } = await this.images.process(input, MEDIA_POLICIES[kind]);
    const id = randomUUID();
    const key = mediaKey({ kind, ownerId, id });
    await this.storage.put(key, body, { contentType });
    return { id, key };
  }

  /** Bytes of an object the caller has already authorized; unknown ids map to the kind's 404. */
  async read(kind: MediaKind, ownerId: string, id: string): Promise<Buffer> {
    const policy = MEDIA_POLICIES[kind];
    if (!isMediaId(id)) throw new ApiException(policy.errors.notFound);
    const body = await this.storage.get(mediaKey({ kind, ownerId, id }), {
      maxBytes: policy.maxBytes,
    });
    if (!body) throw new ApiException(policy.errors.notFound);
    return body;
  }

  /**
   * Best-effort removal of an object that is no longer referenced. A failure is logged, never
   * thrown: the database change has already committed and `media:prune` recovers the orphan.
   */
  async discard(key: string | null): Promise<void> {
    if (!key) return;
    try {
      await this.storage.delete(key);
    } catch (error) {
      this.logger.error({ err: error, key }, 'Media cleanup failed; run media:prune');
    }
  }
}
