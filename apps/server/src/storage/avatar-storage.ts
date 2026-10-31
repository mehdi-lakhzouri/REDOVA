export const AVATAR_STORAGE = Symbol('AVATAR_STORAGE');
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_MAX_PIXELS = 16_000_000;
export const AVATAR_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const avatarKey = (id: string): string => {
  if (!AVATAR_ID_PATTERN.test(id)) throw new Error('Invalid avatar identifier');
  return `avatars/${id}.webp`;
};
export const avatarIdFromKey = (key: string): string => {
  const id = key.replace(/^avatars\//, '').replace(/\.webp$/, '');
  if (avatarKey(id) !== key) throw new Error('Invalid avatar key');
  return id;
};
export interface AvatarObject {
  key: string;
  modifiedAt: Date;
}
export interface AvatarStorage {
  put(key: string, body: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  list(): AsyncIterable<AvatarObject>;
}
