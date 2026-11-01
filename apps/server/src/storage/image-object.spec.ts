import { describe, expect, it } from 'vitest';
import { imageIdFromKey, imageKey } from './image-object';
const id = '9d104101-2a00-4000-8000-000000000001';
describe('image namespaces', () => {
  it('keeps avatars and organization logos isolated', () => {
    expect(imageIdFromKey(imageKey(id, 'organization-logos'), 'organization-logos')).toBe(id);
    expect(() => imageIdFromKey(imageKey(id, 'avatars'), 'organization-logos')).toThrow();
  });
  it.each(['../secret', `${id}/../secret`, `avatars/${id}.webp`, `${id}.png`])(
    'rejects unsafe keys: %s',
    (key) => {
      expect(() => imageIdFromKey(key, 'organization-logos')).toThrow();
    },
  );
});
