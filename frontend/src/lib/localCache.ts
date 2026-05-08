type CacheKey = 'players' | 'items' | 'openTabs';

const DB_NAME = 'playkou';
const DB_VERSION = 2;
const STORE = 'kv';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
      // outbox store is created in v1 by offlineOutbox.ts
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function cacheSet<T>(key: CacheKey, value: T) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    const s = t.objectStore(STORE);
    const r = s.put({ key, value, updatedAt: Date.now() });
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

export async function cacheGet<T>(key: CacheKey): Promise<T | null> {
  const db = await openDb();
  return await new Promise<T | null>((resolve, reject) => {
    const t = db.transaction(STORE, 'readonly');
    const s = t.objectStore(STORE);
    const r = s.get(key) as IDBRequest<{ key: CacheKey; value: T } | undefined>;
    r.onsuccess = () => resolve(r.result?.value ?? null);
    r.onerror = () => reject(r.error);
  });
}

