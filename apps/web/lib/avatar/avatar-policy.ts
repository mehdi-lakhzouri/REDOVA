/** Mirrors apps/server avatar limits (multer filter + AVATAR_MAX_BYTES). */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const AVATAR_ACCEPT_ATTRIBUTE = AVATAR_ACCEPTED_TYPES.join(',');

/** Returns an actionable message, or null when the file can be sent to the API. */
export function validateAvatarFile(file: File): string | null {
  if (!(AVATAR_ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
    return 'Use a JPG, PNG or WebP image.';
  }
  if (file.size > AVATAR_MAX_BYTES) return 'The image is larger than 5 MB.';
  if (file.size === 0) return 'The image is empty. Choose another file.';
  return null;
}
