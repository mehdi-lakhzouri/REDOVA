import type { MediaKind } from '@redova/contracts';

/**
 * Object key layout, identical on disk and in S3/R2:
 *
 *   users/{userId}/avatars/{uuid}.webp
 *   organizations/{organizationId}/logos/{uuid}.webp
 *
 * Grouping by owner keeps one prefix per account or tenant (export, erasure, prune) and the
 * server-generated UUID makes every object immutable and unguessable. Client file names are never
 * used. Keys contain only validated segments, so they cannot escape the storage root.
 */
const LAYOUT: Record<MediaKind, { owner: string; collection: string }> = {
  avatar: { owner: 'users', collection: 'avatars' },
  organizationLogo: { owner: 'organizations', collection: 'logos' },
};

export const MEDIA_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** Better Auth identifiers (and UUIDs) only: no dots, slashes or separators. */
const OWNER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const EXTENSION = '.webp';

export interface MediaObjectRef {
  kind: MediaKind;
  ownerId: string;
  id: string;
}

export const isMediaId = (id: string): boolean => MEDIA_ID_PATTERN.test(id);

export function mediaKey({ kind, ownerId, id }: MediaObjectRef): string {
  if (!OWNER_ID_PATTERN.test(ownerId)) throw new Error('Invalid media owner');
  if (!isMediaId(id)) throw new Error('Invalid media identifier');
  const { owner, collection } = LAYOUT[kind];
  return `${owner}/${ownerId}/${collection}/${id}${EXTENSION}`;
}

/** Inverse of {@link mediaKey}; throws on any key it would not produce. */
export function parseMediaKey(key: string): MediaObjectRef {
  const [owner, ownerId = '', collection, file = '', ...rest] = key.split('/');
  const kind = (Object.keys(LAYOUT) as MediaKind[]).find(
    (candidate) => LAYOUT[candidate].owner === owner && LAYOUT[candidate].collection === collection,
  );
  if (!kind || rest.length || !file.endsWith(EXTENSION)) throw new Error('Invalid media key');
  const ref = { kind, ownerId, id: file.slice(0, -EXTENSION.length) };
  if (mediaKey(ref) !== key) throw new Error('Invalid media key');
  return ref;
}

/** Listing prefix that contains every object of a kind (and possibly other kinds). */
export const mediaListPrefix = (kind: MediaKind): string => `${LAYOUT[kind].owner}/`;
