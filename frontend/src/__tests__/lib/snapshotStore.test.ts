import {
  isSnapshotFresh,
  readSnapshot,
  sanitizeSnapshot,
  storeSnapshot,
  SNAPSHOT_TTL_MS,
} from '@/lib/snapshotStore';

function createFakeIndexedDB() {
  type StoreData = Map<IDBValidKey, unknown>;
  interface FakeDatabase {
    stores: Map<string, StoreData>;
    objectStoreNames: { contains(name: string): boolean };
    createObjectStore(name: string, options?: { keyPath?: string }): unknown;
    transaction(name: string, mode?: IDBTransactionMode): {
      objectStore(storeName: string): {
        get(key: IDBValidKey): IDBRequest<unknown>;
        getAll(): IDBRequest<unknown[]>;
        put(value: unknown, key?: IDBValidKey): IDBRequest<IDBValidKey>;
        delete(key: IDBValidKey): IDBRequest<undefined>;
      };
    };
    close(): void;
    onversionchange: (() => void) | null;
  }

  const databases = new Map<string, FakeDatabase>();
  const makeRequest = <T>(result: T, onComplete?: () => void): IDBRequest<T> => {
    const request = {
      result,
      error: null,
      onsuccess: null as ((event: Event) => void) | null,
      onerror: null as ((event: Event) => void) | null,
      onupgradeneeded: null as ((event: IDBVersionChangeEvent) => void) | null,
      onblocked: null as ((event: Event) => void) | null,
    };
    setTimeout(() => {
      onComplete?.();
      request.onsuccess?.(new Event('success'));
    }, 0);
    return request as unknown as IDBRequest<T>;
  };

  const factory = {
    open(name: string): IDBOpenDBRequest {
      let database = databases.get(name);
      const isNew = !database;
      if (!database) {
        database = {
          stores: new Map(),
          objectStoreNames: { contains: storeName => database!.stores.has(storeName) },
          createObjectStore(storeName) {
            this.stores.set(storeName, new Map());
            return {};
          },
          transaction(_storeName, _mode) {
            return {
              objectStore: storeName => {
                const data = database!.stores.get(storeName)!;
                return {
                  get: key => makeRequest(data.get(key)),
                  getAll: () => makeRequest([...data.values()]),
                  put: (value, key) => {
                    const recordKey = key ?? (value as { id: IDBValidKey }).id;
                    return makeRequest(recordKey, () => data.set(recordKey, value));
                  },
                  delete: key => makeRequest(undefined, () => data.delete(key)),
                };
              },
            };
          },
          close() {},
          onversionchange: null,
        };
        databases.set(name, database);
      }
      const request = {
        result: database,
        error: null,
        onsuccess: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        onupgradeneeded: null as ((event: IDBVersionChangeEvent) => void) | null,
      };
      setTimeout(() => {
        if (isNew) request.onupgradeneeded?.(new Event('upgradeneeded') as IDBVersionChangeEvent);
        request.onsuccess?.(new Event('success'));
      }, 0);
      return request as unknown as IDBOpenDBRequest;
    },
    deleteDatabase(name: string): IDBOpenDBRequest {
      return makeRequest(undefined, () => databases.delete(name)) as unknown as IDBOpenDBRequest;
    },
  };
  return {
    factory: factory as unknown as IDBFactory,
    recordCount(name: string, storeName: string) {
      return databases.get(name)?.stores.get(storeName)?.size ?? 0;
    },
  };
}

describe('snapshotStore', () => {
  let originalIndexedDB: PropertyDescriptor | undefined;
  let fakeIndexedDB: ReturnType<typeof createFakeIndexedDB>;

  beforeEach(() => {
    originalIndexedDB = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
    fakeIndexedDB = createFakeIndexedDB();
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: fakeIndexedDB.factory,
    });
  });

  afterEach(() => {
    if (originalIndexedDB) {
      Object.defineProperty(globalThis, 'indexedDB', originalIndexedDB);
    } else {
      Reflect.deleteProperty(globalThis, 'indexedDB');
    }
  });

  test('expires snapshots at 24 hours and rejects future fetch times', () => {
    const now = 1_800_000_000_000;

    expect(isSnapshotFresh({ fetchedAt: now - SNAPSHOT_TTL_MS + 1 }, now)).toBe(true);
    expect(isSnapshotFresh({ fetchedAt: now - SNAPSHOT_TTL_MS }, now)).toBe(false);
    expect(isSnapshotFresh({ fetchedAt: now + 1 }, now)).toBe(false);
  });

  test('rejects a future-dated snapshot fetchedAt', async () => {
    const now = 1_800_000_000_000;
    const future = now + 1;
    await storeSnapshot('user:court', '/players', [], future);

    await expect(readSnapshot('user:court', '/players', now)).resolves.toBeUndefined();
  });

  test('deletes and returns undefined for an expired snapshot', async () => {
    const now = 1_800_000_000_000;
    await storeSnapshot('user:court', '/players', [], now - SNAPSHOT_TTL_MS);

    await expect(readSnapshot('user:court', '/players', now)).resolves.toBeUndefined();
    expect(fakeIndexedDB.recordCount('kourtly-snapshots', 'snapshots')).toBe(0);
  });

  test('projects match players and drops unknown nested fields', () => {
    expect(sanitizeSnapshot('/queue', [{
      _id: 'match-1',
      matchType: 'XD',
      court: 1,
      status: 'queued',
      createdAt: '2026-10-05T02:00:00.000Z',
      updatedAt: '2026-10-05T02:00:00.000Z',
      privateMatchField: 'remove',
      team1: [{
        _id: 'player-1',
        name: 'Player One',
        level: 'A',
        gender: 'Female',
        age: 25,
        matchCount: 5,
        isActive: true,
        createdAt: '2026-10-01T02:00:00.000Z',
        privatePlayerField: 'remove',
      }],
      team2: [],
    }])).toEqual([{
      _id: 'match-1',
      matchType: 'XD',
      court: 1,
      status: 'queued',
      createdAt: '2026-10-05T02:00:00.000Z',
      updatedAt: '2026-10-05T02:00:00.000Z',
      team1: [{
        _id: 'player-1',
        name: 'Player One',
        level: 'A',
        gender: 'Female',
        age: 25,
        matchCount: 5,
        isActive: true,
        createdAt: '2026-10-01T02:00:00.000Z',
      }],
      team2: [],
    }]);
  });

  test('returns undefined for an endpoint without a snapshot whitelist', () => {
    expect(sanitizeSnapshot('/payout-transfers', [{ accountNumber: 'private' }])).toBeUndefined();
  });

  test('whitelists reservation fields and strips personal contact and payment-link data', () => {
    const sanitized = sanitizeSnapshot('/reservations', [{
      _id: 'reservation-1',
      name: 'Guest',
      phone: '09170000000',
      email: 'guest@example.test',
      court: 2,
      date: '2026-10-05',
      timeSlot: '10:00-11:00',
      duration: 1,
      playerCount: 2,
      status: 'confirmed',
      paymentOption: 'full',
      reservationFeeAmount: 210,
      downpaymentAmount: 0,
      maintenanceFeeAmount: 10,
      amountPaidOnline: 220,
      remainingBalanceAmount: 0,
      paymentStatus: 'paid',
      paymentExpiresAt: null,
      paymentUrl: 'https://payments.example.test/pay',
      publicRef: 'public-ref',
      notes: 'Sensitive guest note',
      createdAt: '2026-10-05T02:00:00.000Z',
      updatedAt: '2026-10-05T02:00:00.000Z',
    }]);

    expect(sanitized).toEqual([{
      _id: 'reservation-1',
      name: 'Guest',
      court: 2,
      date: '2026-10-05',
      timeSlot: '10:00-11:00',
      duration: 1,
      playerCount: 2,
      status: 'confirmed',
      paymentOption: 'full',
      reservationFeeAmount: 210,
      downpaymentAmount: 0,
      maintenanceFeeAmount: 10,
      amountPaidOnline: 220,
      remainingBalanceAmount: 0,
      paymentStatus: 'paid',
      paymentExpiresAt: null,
      createdAt: '2026-10-05T02:00:00.000Z',
      updatedAt: '2026-10-05T02:00:00.000Z',
    }]);

    expect(sanitizeSnapshot('/court/me', {
      name: 'Court Name',
      courtCount: 6,
      logoUrl: 'https://images.example.test/logo.png',
      subscription: {
        tier: 'premium',
        amount: 9999,
        paymentRef: 'private-payment-reference',
      },
      payout: { accountNumberLast4: '1234' },
    })).toEqual({
      name: 'Court Name',
      courtCount: 6,
      subscription: { tier: 'premium' },
    });

    expect(sanitizeSnapshot('/court/me/capabilities', {
      tier: 'premium',
      currentTier: 'standard',
      modules: { booking: true, queue: true, item_tabs: false, secret: true },
      tierDetails: {
        label: 'Premium',
        description: 'Plan catalog entry',
        price: 5000,
        paymentId: 'must-not-be-retained',
      },
      payout: { accountNumberLast4: '1234' },
    })).toEqual({
      tier: 'premium',
      currentTier: 'standard',
      modules: { booking: true, queue: true, item_tabs: false },
      tierDetails: {
        label: 'Premium',
        description: 'Plan catalog entry',
        price: 5000,
      },
    });
  });
});
