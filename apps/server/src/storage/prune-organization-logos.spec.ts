import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@redova/db';
import type { AvatarStorage } from './avatar-storage';
import { pruneOrganizationLogos } from './prune-organization-logos';
describe('pruneOrganizationLogos', () => {
  it('protects recent and referenced objects, is dry-run by default, and deletes old orphans only on apply', async () => {
    const now = Date.now();
    const referenced = 'organization-logos/9d104101-2a00-4000-8000-000000000001.webp';
    const orphan = 'organization-logos/9d104101-2a00-4000-8000-000000000002.webp';
    const storage = {
      delete: vi.fn(),
      async *list() {
        yield await Promise.resolve({ key: referenced, modifiedAt: new Date(now - 2 * 86400000) });
        yield { key: orphan, modifiedAt: new Date(now - 2 * 86400000) };
        yield { key: 'recent', modifiedAt: new Date(now) };
      },
    };
    const prisma = {
      organization: {
        findFirst: vi.fn(({ where }: { where: { logo: { endsWith: string } } }) =>
          Promise.resolve(where.logo.endsWith.endsWith('000000000001') ? { id: 'org-1' } : null),
        ),
      },
    };
    expect(
      await pruneOrganizationLogos(
        storage as unknown as AvatarStorage,
        prisma as unknown as PrismaClient,
        { now },
      ),
    ).toEqual({ candidates: 1, deleted: 0 });
    expect(storage.delete).not.toHaveBeenCalled();
    expect(
      await pruneOrganizationLogos(
        storage as unknown as AvatarStorage,
        prisma as unknown as PrismaClient,
        { now, apply: true },
      ),
    ).toEqual({ candidates: 1, deleted: 1 });
    expect(storage.delete).toHaveBeenCalledExactlyOnceWith(orphan);
  });
});
