import { readdir } from 'node:fs/promises';

/** Number of stored files under a local media root (owner folders are nested). */
export const countMediaFiles = async (root: string): Promise<number> => {
  const entries = await readdir(root, { recursive: true, withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isFile()).length;
};
