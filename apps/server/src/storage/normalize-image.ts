import sharp from 'sharp';
import type { ErrorCode } from '@redova/contracts';
import { ApiException } from '../common/api-exception';

export async function normalizeImage(
  input: Buffer,
  options: {
    maxBytes: number;
    maxPixels: number;
    fit: 'cover' | 'inside';
    invalid: ErrorCode;
    tooLarge: ErrorCode;
  },
): Promise<Buffer> {
  if (input.length > options.maxBytes) throw new ApiException(options.tooLarge);
  const jpeg = input.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  const png = input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp =
    input.toString('ascii', 0, 4) === 'RIFF' && input.toString('ascii', 8, 12) === 'WEBP';
  if (!jpeg && !png && !webp) throw new ApiException(options.invalid);
  try {
    const image = sharp(input, { limitInputPixels: options.maxPixels, failOn: 'warning' });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) > 1)
      throw new Error('Unsupported image');
    if (metadata.format === 'png') {
      for (let offset = 8; offset + 12 <= input.length; offset += input.readUInt32BE(offset) + 12) {
        if (input.toString('ascii', offset + 4, offset + 8) === 'acTL')
          throw new Error('Animated PNG');
      }
    }
    return await image
      .rotate()
      .resize(512, 512, { fit: options.fit, withoutEnlargement: true })
      .webp({ quality: 80, effort: 4 })
      .timeout({ seconds: 5 })
      .toBuffer();
  } catch {
    throw new ApiException(options.invalid);
  }
}
