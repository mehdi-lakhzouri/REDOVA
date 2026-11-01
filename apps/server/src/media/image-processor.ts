import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import type { MediaPolicy } from '@redova/contracts';
import { ApiException } from '../common/api-exception';

const isJpeg = (input: Buffer) => input.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
const isPng = (input: Buffer) =>
  input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
const isWebp = (input: Buffer) =>
  input.toString('ascii', 0, 4) === 'RIFF' && input.toString('ascii', 8, 12) === 'WEBP';

const hasPngAnimation = (input: Buffer): boolean => {
  for (let offset = 8; offset + 12 <= input.length; offset += input.readUInt32BE(offset) + 12) {
    if (input.toString('ascii', offset + 4, offset + 8) === 'acTL') return true;
  }
  return false;
};

export interface ProcessedImage {
  body: Buffer;
  contentType: 'image/webp';
}

/**
 * Turns an untrusted upload into a safe, re-encoded image: size check before decoding, magic-byte
 * sniffing, single-frame raster formats only, pixel limit, EXIF orientation applied, metadata
 * stripped, resized to the policy box and encoded as WebP within a time budget.
 */
@Injectable()
export class ImageProcessor {
  async process(input: Buffer, policy: MediaPolicy): Promise<ProcessedImage> {
    const { errors, output } = policy;
    if (input.length > policy.maxBytes) throw new ApiException(errors.tooLarge);
    if (!isJpeg(input) && !isPng(input) && !isWebp(input)) throw new ApiException(errors.invalid);
    try {
      const image = sharp(input, { limitInputPixels: policy.maxInputPixels, failOn: 'warning' });
      const metadata = await image.metadata();
      const format = `image/${metadata.format ?? ''}`;
      if (!(policy.mimeTypes as readonly string[]).includes(format)) throw new Error('Format');
      if ((metadata.pages ?? 1) > 1) throw new Error('Animated image');
      if (metadata.format === 'png' && hasPngAnimation(input)) throw new Error('Animated PNG');
      const body = await image
        .rotate()
        .resize(output.width, output.height, { fit: output.fit, withoutEnlargement: true })
        .webp({ quality: output.quality, effort: 4 })
        .timeout({ seconds: 5 })
        .toBuffer();
      return { body, contentType: 'image/webp' };
    } catch {
      throw new ApiException(errors.invalid);
    }
  }
}
