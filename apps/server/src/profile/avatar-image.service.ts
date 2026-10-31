import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { ApiException } from '../common/api-exception';
import { AVATAR_MAX_BYTES, AVATAR_MAX_PIXELS } from '../storage/avatar-storage';

@Injectable()
export class AvatarImageService {
  async normalize(input: Buffer): Promise<Buffer> {
    if (input.length > AVATAR_MAX_BYTES) throw new ApiException('AVATAR_TOO_LARGE');
    // Reject unsupported signatures before invoking any decoder (including SVG/XML loaders).
    const jpeg = input.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
    const png = input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const webp =
      input.toString('ascii', 0, 4) === 'RIFF' && input.toString('ascii', 8, 12) === 'WEBP';
    if (!jpeg && !png && !webp) throw new ApiException('AVATAR_INVALID');
    try {
      const image = sharp(input, { limitInputPixels: AVATAR_MAX_PIXELS, failOn: 'warning' });
      const metadata = await image.metadata();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) > 1) {
        throw new Error('Unsupported image');
      }
      // Some PNG decoders expose only the first APNG frame; reject its animation-control chunk.
      if (metadata.format === 'png') {
        for (
          let offset = 8;
          offset + 12 <= input.length;
          offset += input.readUInt32BE(offset) + 12
        ) {
          if (input.toString('ascii', offset + 4, offset + 8) === 'acTL')
            throw new Error('Animated PNG');
        }
      }
      // New pixels only: no original filename, EXIF, GPS, comments or other source metadata.
      return await image
        .rotate()
        .resize(512, 512, { fit: 'cover', withoutEnlargement: true })
        .webp({ quality: 80, effort: 4 })
        .timeout({ seconds: 5 })
        .toBuffer();
    } catch {
      throw new ApiException('AVATAR_INVALID');
    }
  }
}
