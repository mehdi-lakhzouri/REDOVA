import type { PrismaClient } from '@redova/db';
import { avatarIdFromKey, type AvatarStorage } from './avatar-storage';

/** Recover failed deletes, process crashes and deleted-user objects. Dry run by default. */
export const pruneAvatars = async (
  storage: AvatarStorage,
  prisma: PrismaClient,
  { apply = false, now = Date.now() }: { apply?: boolean; now?: number } = {},
): Promise<{ candidates: number; deleted: number }> => {
  let candidates = 0;
  let deleted = 0;
  for await (const object of storage.list()) {
    // A just-uploaded object may not have been committed to the database yet.
    if (object.modifiedAt.getTime() > now - 86_400_000) continue;
    const id = avatarIdFromKey(object.key);
    const current = await prisma.user.findFirst({
      where: { image: { endsWith: `/api/v1/avatars/${id}` } },
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
};
