/** Organization field rules applied on create and update (README §13, UM-005). */
export const ORG_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/;

/** Slugs that would collide with future frontend routes. */
export const RESERVED_ORG_SLUGS: ReadonlySet<string> = new Set([
  'admin',
  'api',
  'settings',
  'new',
  'orgs',
  'invitations',
]);

export const ORG_NAME_MIN_LENGTH = 2;
export const ORG_NAME_MAX_LENGTH = 64;
export const ORG_LOGO_MAX_LENGTH = 2048;

export type OrgFieldIssue =
  | 'ORG_SLUG_INVALID'
  | 'ORG_SLUG_RESERVED'
  | 'ORG_SLUG_IMMUTABLE'
  | 'ORG_NAME_INVALID'
  | 'ORG_LOGO_INVALID';

const isValidName = (name: unknown): boolean => {
  if (typeof name !== 'string') return false;
  const length = name.trim().length;
  return length >= ORG_NAME_MIN_LENGTH && length <= ORG_NAME_MAX_LENGTH;
};

/** Native organization mutations accept optional HTTPS URLs; managed uploads use the media API. */
const isValidLogo = (logo: unknown): boolean => {
  if (logo === undefined || logo === null) return true;
  if (typeof logo !== 'string' || logo.length > ORG_LOGO_MAX_LENGTH) return false;
  try {
    return new URL(logo).protocol === 'https:';
  } catch {
    return false;
  }
};

export const validateOrgSlug = (slug: unknown): OrgFieldIssue | null => {
  if (typeof slug !== 'string' || !ORG_SLUG_PATTERN.test(slug)) return 'ORG_SLUG_INVALID';
  if (RESERVED_ORG_SLUGS.has(slug)) return 'ORG_SLUG_RESERVED';
  return null;
};

export const validateOrgCreation = (data: {
  name?: unknown;
  slug?: unknown;
  logo?: unknown;
}): OrgFieldIssue | null => {
  const slugIssue = validateOrgSlug(data.slug);
  if (slugIssue) return slugIssue;
  if (!isValidName(data.name)) return 'ORG_NAME_INVALID';
  if (!isValidLogo(data.logo)) return 'ORG_LOGO_INVALID';
  return null;
};

/** Only fields present in the update are checked; sending the current slug back is not a change. */
export const validateOrgUpdate = (
  currentSlug: string,
  data: { name?: unknown; slug?: unknown; logo?: unknown },
): OrgFieldIssue | null => {
  if (data.slug !== undefined && data.slug !== currentSlug) return 'ORG_SLUG_IMMUTABLE';
  if (data.name !== undefined && !isValidName(data.name)) return 'ORG_NAME_INVALID';
  if (!isValidLogo(data.logo)) return 'ORG_LOGO_INVALID';
  return null;
};
