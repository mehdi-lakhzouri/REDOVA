import type { MediaKind } from '@redova/contracts';
import type { PrismaClient } from '@redova/db';
import { mediaListPrefix, parseMediaKey, type MediaObjectRef } from './media-key';
import type { MediaStorage } from './media-storage';

/** Uploads are written before their reference is committed: never touch recent objects. */
export const PRUNE_GRACE_MS = 24 * 60 * 60 * 1000;

/** Whether the owner's row still points at this object. One rule per kind. */
const REFERENCES: Record<
  MediaKind,
  (prisma: PrismaClient, ref: MediaObjectRef) => Promise<boolean>
> = {
  avatar: async (prisma, { ownerId, id }) =>
    !!(await prisma.user.findFirst({
      where: { id: ownerId, image: { endsWith: `/api/v1/avatars/${id}` } },
      select: { id: true },
    })),
  organizationLogo: async (prisma, { ownerId, id }) =>
    !!(await prisma.organization.findFirst({
      where: { id: ownerId, logo: { endsWith: `/organizations/${ownerId}/logo/${id}` } },
      select: { id: true },
    })),
};

export interface PruneReport {
  kind: MediaKind;
  candidates: number;
  deleted: number;
}

/**
 * Removes orphans left by failed deletes, crashes or deleted accounts. Dry run unless `apply`.
 */
export async function pruneMedia(
  storage: MediaStorage,
  prisma: PrismaClient,
  kind: MediaKind,
  { apply = false, now = Date.now() }: { apply?: boolean; now?: number } = {},
): Promise<PruneReport> {
  const report: PruneReport = { kind, candidates: 0, deleted: 0 };
  for await (const object of storage.list(mediaListPrefix(kind))) {
    const ref = parseMediaKey(object.key);
    if (ref.kind !== kind || object.modifiedAt.getTime() > now - PRUNE_GRACE_MS) continue;
    if (await REFERENCES[kind](prisma, ref)) continue;
    report.candidates++;
    if (apply) {
      await storage.delete(object.key);
      report.deleted++;
    }
  }
  return report;
}
