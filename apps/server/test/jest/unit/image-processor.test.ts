import { describe, expect, it } from '@jest/globals';
import sharp from 'sharp';
import { MEDIA_POLICIES } from '@redova/contracts';
import { ImageProcessor } from '../../../src/media/image-processor';

const processor = new ImageProcessor();
const AVATAR_MAX_BYTES = MEDIA_POLICIES.avatar.maxBytes;
const service = {
  normalize: async (input: Buffer) => (await processor.process(input, MEDIA_POLICIES.avatar)).body,
};
describe('organization logo policy', () => {
  it('keeps the aspect ratio inside the 512 px box and uses the logo error codes', async () => {
    const input = await sharp({
      create: { width: 800, height: 400, channels: 4, background: '#ff2d2d' },
    })
      .png()
      .toBuffer();
    const { body, contentType } = await processor.process(input, MEDIA_POLICIES.organizationLogo);
    expect(contentType).toBe('image/webp');
    expect(await sharp(body).metadata()).toMatchObject({ format: 'webp', width: 512, height: 256 });
    await expect(
      processor.process(Buffer.from('<svg/>'), MEDIA_POLICIES.organizationLogo),
    ).rejects.toMatchObject({ code: 'ORG_LOGO_INVALID' });
    await expect(
      processor.process(
        Buffer.alloc(MEDIA_POLICIES.organizationLogo.maxBytes + 1),
        MEDIA_POLICIES.organizationLogo,
      ),
    ).rejects.toMatchObject({ code: 'ORG_LOGO_TOO_LARGE' });
  });
});

describe('avatar image normalization', () => {
  it.each(['jpeg', 'png', 'webp'] as const)(
    'decodes %s pixels, resizes and removes EXIF',
    async (format) => {
      const input = await sharp({
        create: { width: 900, height: 700, channels: 3, background: '#123456' },
      })
        .withMetadata({ exif: { IFD0: { Artist: 'Private identity' } } })
        .toFormat(format)
        .toBuffer();
      const output = await service.normalize(input);
      const metadata = await sharp(output).metadata();
      expect(metadata).toMatchObject({ format: 'webp', width: 512, height: 512 });
      expect(metadata.exif).toBeUndefined();
      expect(metadata.icc).toBeUndefined();
      expect(output.includes(Buffer.from('Private identity'))).toBe(false);
    },
  );
  it.each([
    Buffer.from('<svg><script>alert(1)</script></svg>'),
    Buffer.from('not an image'),
    Buffer.alloc(0),
  ])('rejects non-raster or corrupt content', async (input) => {
    await expect(service.normalize(input)).rejects.toMatchObject({ code: 'AVATAR_INVALID' });
  });
  it('rejects a file larger than 5 MiB before decoding', async () => {
    await expect(service.normalize(Buffer.alloc(AVATAR_MAX_BYTES + 1))).rejects.toMatchObject({
      code: 'AVATAR_TOO_LARGE',
    });
  });
  it('rejects excessive decompressed dimensions', async () => {
    const input = await sharp({
      create: { width: 4100, height: 4000, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer();
    await expect(service.normalize(input)).rejects.toMatchObject({ code: 'AVATAR_INVALID' });
  });
  it('rejects animated WebP', async () => {
    const pixels = Buffer.from([
      ...Array(4).fill([255, 0, 0]).flat(),
      ...Array(4).fill([0, 0, 255]).flat(),
    ]);
    const input = await sharp(pixels, { raw: { width: 2, height: 4, channels: 3, pageHeight: 2 } })
      .webp({ loop: 0, delay: [100, 100] })
      .toBuffer();
    expect((await sharp(input).metadata()).pages).toBe(2);
    await expect(service.normalize(input)).rejects.toMatchObject({ code: 'AVATAR_INVALID' });
  });
  it('rejects PNG animation-control chunks even when a decoder exposes only one page', async () => {
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } })
      .png()
      .toBuffer();
    const chunk = Buffer.alloc(20);
    chunk.writeUInt32BE(8, 0);
    chunk.write('acTL', 4, 'ascii');
    chunk.writeUInt32BE(2, 8);
    // CRC-32 of chunk type and data (PNG's standard polynomial).
    let crc = 0xffffffff;
    for (const byte of chunk.subarray(4, 16)) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 16);
    const input = Buffer.concat([png.subarray(0, 33), chunk, png.subarray(33)]);
    await expect(service.normalize(input)).rejects.toMatchObject({ code: 'AVATAR_INVALID' });
  });
});
