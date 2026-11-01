import { describe, expect, it, vi } from 'vitest';
import type { S3Client } from '@aws-sdk/client-s3';
import { ORGANIZATION_LOGO_MAX_BYTES } from '@redova/contracts';
import { S3AvatarStorage } from './s3-avatar-storage';

const key = 'organization-logos/9d104101-2a00-4000-8000-000000000001.webp';
const fixture = () => {
  const send = vi.fn();
  return {
    send,
    storage: new S3AvatarStorage(
      { send } as unknown as S3Client,
      'private-media',
      'organization-logos',
      ORGANIZATION_LOGO_MAX_BYTES,
    ),
  };
};
describe('private organization logo S3/R2 namespace', () => {
  it('writes immutable private WebP objects and refuses avatar keys', async () => {
    const { send, storage } = fixture();
    send.mockResolvedValue({});
    await storage.put(key, Buffer.from('pixels'));
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Key: key,
          Bucket: 'private-media',
          IfNoneMatch: '*',
          CacheControl: 'private, no-store',
          ContentType: 'image/webp',
        }),
      }),
    );
    send.mockClear();
    await expect(storage.delete(key.replace('organization-logos/', 'avatars/'))).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
  it('lists only logo objects and enforces the logo read size limit', async () => {
    const { send, storage } = fixture();
    send.mockResolvedValueOnce({
      Contents: [
        { Key: key, LastModified: new Date() },
        { Key: key.replace('organization-logos/', 'avatars/'), LastModified: new Date() },
      ],
    });
    const keys: string[] = [];
    for await (const object of storage.list()) keys.push(object.key);
    expect(keys).toEqual([key]);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ Prefix: 'organization-logos/' }),
      }),
    );
    const destroy = vi.fn();
    send.mockResolvedValueOnce({
      ContentLength: ORGANIZATION_LOGO_MAX_BYTES + 1,
      Body: { destroy },
    });
    await expect(storage.get(key)).rejects.toThrow();
    expect(destroy).toHaveBeenCalledOnce();
  });
});
