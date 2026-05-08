type OutboxRequest = {
  path: string; // API path relative to API_BASE e.g. "/queue"
  method: string; // POST/PATCH/PUT/DELETE
  headers: Record<string, string>;
  body?: string | null;
};

export type OutboxItem = {
  id: number;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  request: OutboxRequest;
};

export class OfflineQueuedError extends Error {
  readonly queued = true;
  readonly outboxId: number;
  readonly request: OutboxRequest;
  constructor(message: string, outboxId: number, request: OutboxRequest) {
    super(message);
    this.name = 'OfflineQueuedError';
    this.outboxId = outboxId;
    this.request = request;
  }
}

const DB_NAME = 'playkou';
const DB_VERSION = 1;
const STORE = 'outbox';

let flushInFlight: Promise<{ flushed: number; remaining: number }> | null = null;
let listeners: Array<(count: number) => void> = [];

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('nextAttemptAt', 'nextAttemptAt', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllItems(): Promise<OutboxItem[]> {
  const db = await openDb();
  return await new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readonly');
    const store = t.objectStore(STORE);
    const r = store.getAll() as IDBRequest<OutboxItem[]>;
    r.onsuccess = () => resolve(r.result ?? []);
    r.onerror = () => reject(r.error);
  });
}

async function countItems(): Promise<number> {
  const db = await openDb();
  return await new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readonly');
    const store = t.objectStore(STORE);
    const r = store.count();
    r.onsuccess = () => resolve(r.result ?? 0);
    r.onerror = () => reject(r.error);
  });
}

async function notifyCount() {
  try {
    const c = await countItems();
    listeners.forEach((l) => l(c));
  } catch {
    // ignore
  }
}

export function subscribeOutboxCount(cb: (count: number) => void) {
  listeners.push(cb);
  notifyCount();
  return () => {
    listeners = listeners.filter((x) => x !== cb);
  };
}

function backoffMs(attempts: number) {
  // 2s, 4s, 8s ... max 60s
  const ms = Math.min(60_000, 2_000 * Math.pow(2, Math.max(0, attempts)));
  // Add a little jitter to avoid thundering herd
  return Math.floor(ms * (0.85 + Math.random() * 0.3));
}

export async function enqueueOutbox(request: OutboxRequest): Promise<number> {
  const now = Date.now();
  const item = {
    createdAt: now,
    attempts: 0,
    nextAttemptAt: now,
    request,
  } as Omit<OutboxItem, 'id'>;

  const db = await openDb();
  const id = await new Promise<number>((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    const store = t.objectStore(STORE);
    const r = store.add(item);
    r.onsuccess = () => resolve(Number(r.result));
    r.onerror = () => reject(r.error);
  });

  await notifyCount();
  return id;
}

export async function peekOutbox(): Promise<OutboxItem[]> {
  const items = await getAllItems();
  return items.sort((a, b) => a.createdAt - b.createdAt);
}

export async function flushOutbox(fetcher: (req: OutboxRequest) => Promise<Response>) {
  if (flushInFlight) return flushInFlight;

  flushInFlight = (async () => {
    let flushed = 0;
    const now = Date.now();

    const items = (await peekOutbox()).filter((x) => x.nextAttemptAt <= now);
    for (const item of items) {
      // If we go offline mid-loop, stop and retry later.
      if (typeof navigator !== 'undefined' && !navigator.onLine) break;

      try {
        const res = await fetcher(item.request);
        if (!res.ok) {
          // Treat 4xx as permanent (likely validation); 5xx retry.
          if (res.status >= 400 && res.status < 500) {
            await removeOutbox(item.id);
          } else {
            await bumpAttempt(item);
          }
          continue;
        }
        await removeOutbox(item.id);
        flushed++;
      } catch {
        await bumpAttempt(item);
      }
    }

    const remaining = await countItems();
    await notifyCount();
    return { flushed, remaining };
  })().finally(() => {
    flushInFlight = null;
  });

  return flushInFlight;
}

async function removeOutbox(id: number) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    const store = t.objectStore(STORE);
    const r = store.delete(id);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

async function bumpAttempt(item: OutboxItem) {
  const db = await openDb();
  const next = {
    ...item,
    attempts: item.attempts + 1,
    nextAttemptAt: Date.now() + backoffMs(item.attempts + 1),
  };
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    const store = t.objectStore(STORE);
    const r = store.put(next);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

