/**
 * Holds the picture chosen at sign-up until the user has a verified session: the avatar API
 * requires one, and sign-up deliberately returns none. Stored in IndexedDB (Blobs survive the
 * round-trip through the verification email) and bound to the normalized email address.
 */
const DB_NAME = 'redova';
const STORE = 'pending-avatar';
const KEY = 'current';
/** Matches EMAIL_VERIFICATION_EXPIRES_IN_SECONDS (one day) in packages/auth. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

type PendingAvatar = { email: string; file: Blob; filename: string; createdAt: number };

const normalizeEmail = (email: string) => email.trim().toLowerCase();

function openStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result.transaction(STORE, mode).objectStore(STORE));
  });
}

function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  return openStore(mode).then(
    (store) =>
      new Promise<T>((resolve, reject) => {
        const request = action(store);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

/** Best effort: a browser without IndexedDB simply skips the deferred upload. */
export async function savePendingAvatar(email: string, file: File): Promise<void> {
  const value: PendingAvatar = {
    email: normalizeEmail(email),
    file,
    filename: file.name,
    createdAt: Date.now(),
  };
  await run('readwrite', (store) => store.put(value, KEY)).catch(() => undefined);
}

export async function takePendingAvatar(email: string): Promise<PendingAvatar | null> {
  const value = await run<PendingAvatar | undefined>('readonly', (store) => store.get(KEY)).catch(
    () => undefined,
  );
  if (!value) return null;
  const expired = Date.now() - value.createdAt > MAX_AGE_MS;
  if (expired || value.email !== normalizeEmail(email)) {
    if (expired) await clearPendingAvatar();
    return null;
  }
  return value;
}

export async function clearPendingAvatar(): Promise<void> {
  await run('readwrite', (store) => store.delete(KEY)).catch(() => undefined);
}
