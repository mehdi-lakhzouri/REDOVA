import type { PrismaClient } from '@redova/db';
import type { AvatarStorage } from './avatar-storage';
import { imageIdFromKey } from './image-object';

/** Dry run by default; protect uploads in flight with a 24-hour grace period. */
export async function pruneOrganizationLogos(
  storage: AvatarStorage,
  prisma: PrismaClient,
  { apply = false, now = Date.now() }: { apply?: boolean; now?: number } = {},
) {
  let candidates = 0;
  let deleted = 0;
  for await (const object of storage.list()) {
    if (object.modifiedAt.getTime() > now - 86_400_000) continue;
    const id = imageIdFromKey(object.key, 'organization-logos');
    const current = await prisma.organization.findFirst({
      where: { logo: { endsWith: `/logo/${id}` } },
      select: { id: true },
    });
    if (current) continue;
    candidates++;
    if (apply) {
      await storage.delete(object.key);
      deleted++;
    }
  }
  return { candidates, deleted };
}
