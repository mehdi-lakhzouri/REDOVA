import { Injectable } from '@nestjs/common';
import { AVATAR_MAX_BYTES, AVATAR_MAX_PIXELS } from '../storage/avatar-storage';
import { normalizeImage } from '../storage/normalize-image';

@Injectable()
export class AvatarImageService {
  normalize(input: Buffer): Promise<Buffer> {
    return normalizeImage(input, {
      maxBytes: AVATAR_MAX_BYTES,
      maxPixels: AVATAR_MAX_PIXELS,
      fit: 'cover',
      invalid: 'AVATAR_INVALID',
      tooLarge: 'AVATAR_TOO_LARGE',
    });
  }
}
