export type ImageNamespace = 'avatars' | 'organization-logos';
export const IMAGE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function imageKey(id: string, namespace: ImageNamespace): string {
  if (!IMAGE_ID_PATTERN.test(id)) throw new Error('Invalid image identifier');
  return `${namespace}/${id}.webp`;
}
export function imageIdFromKey(key: string, namespace: ImageNamespace): string {
  const prefix = `${namespace}/`;
  if (!key.startsWith(prefix) || !key.endsWith('.webp')) throw new Error('Invalid image key');
  const id = key.slice(prefix.length, -5);
  if (imageKey(id, namespace) !== key) throw new Error('Invalid image key');
  return id;
}
