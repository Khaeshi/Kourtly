const DATABASE_NAME = 'kourtly-snapshots';
const DATABASE_VERSION = 1;
const SNAPSHOT_STORE = 'snapshots';
const META_STORE = 'meta';
export const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;

export interface Snapshot<T = unknown> {
  id: string;
  identity: string;
  endpoint: string;
  data: T;
  source: 'network';
  fetchedAt: number;
  reservationWindow?: { dateFrom: string; dateTo: string };
}

export interface SnapshotMetadata {
  source: 'snapshot';
  fetchedAt: number;
}

const openConnections = new Set<IDBDatabase>();

function openSnapshotDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SNAPSHOT_STORE)) {
        database.createObjectStore(SNAPSHOT_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(META_STORE)) {
        database.createObjectStore(META_STORE);
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      openConnections.add(database);
      database.onversionchange = () => {
        database.close();
        openConnections.delete(database);
      };
      resolve(database);
    };
    request.onerror = () => reject(request.error ?? new Error('Could not open snapshot storage.'));
  });
}

function closeDatabase(database: IDBDatabase): void {
  database.close();
  openConnections.delete(database);
}

function transactionRequest<T>(request: IDBRequest<T>, errorMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error(errorMessage));
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function project(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(fields
    .filter(field => Object.prototype.hasOwnProperty.call(value, field))
    .map(field => [field, value[field]]));
}

function projectPlayer(value: unknown): unknown {
  if (typeof value === 'string') return value;
  return project(value, ['_id', 'name', 'level', 'gender', 'age', 'matchCount', 'isActive', 'createdAt']);
}

function projectMatch(value: unknown): unknown {
  if (!isRecord(value)) return {};
  return {
    ...project(value, ['_id', 'matchType', 'court', 'status', 'createdAt', 'updatedAt']),
    team1: Array.isArray(value.team1) ? value.team1.map(projectPlayer) : [],
    team2: Array.isArray(value.team2) ? value.team2.map(projectPlayer) : [],
  };
}

function projectBillingItems(value: unknown): unknown {
  if (!Array.isArray(value)) return [];
  return value.map(item => project(item, ['_id', 'item', 'name', 'price', 'quantity', 'addedAt']));
}

function projectTab(value: unknown): unknown {
  if (!isRecord(value)) return {};
  const player = typeof value.player === 'string'
    ? value.player
    : isRecord(value.player)
      ? project(value.player, ['_id', 'name', 'level'])
      : undefined;
  return {
    ...project(value, ['_id', 'total', 'status', 'sessionDate', 'createdAt', 'updatedAt']),
    ...(player !== undefined ? { player } : {}),
    items: projectBillingItems(value.items),
  };
}

function projectReservationTab(value: unknown): unknown {
  if (!isRecord(value)) return {};
  const paymentSummary = isRecord(value.paymentSummary)
    ? project(value.paymentSummary, ['reservationFee', 'paidOnline', 'remainingBalance', 'source'])
    : undefined;
  return {
    ...project(value, [
      '_id', 'reservation', 'guestName', 'court', 'date', 'timeSlot', 'duration',
      'total', 'status', 'createdAt', 'updatedAt',
    ]),
    items: projectBillingItems(value.items),
    ...(paymentSummary ? { paymentSummary } : {}),
  };
}

function projectPaginated(
  value: unknown,
  projectRow: (row: unknown) => unknown
): unknown {
  if (!isRecord(value) || !Array.isArray(value.tabs)) return undefined;
  return {
    tabs: value.tabs.map(projectRow),
    pagination: project(value.pagination, [
      'page', 'limit', 'total', 'totalPages', 'hasNext', 'hasPrev',
    ]),
  };
}

function projectCapabilities(value: unknown): unknown {
  if (!isRecord(value)) return undefined;
  const modules = isRecord(value.modules)
    ? project(value.modules, ['booking', 'queue', 'item_tabs'])
    : {};
  const tierDetails = isRecord(value.tierDetails)
    ? project(value.tierDetails, ['label', 'description', 'price'])
    : undefined;
  return {
    ...project(value, [
      'tier', 'currentTier', 'pendingTier', 'pendingTierEffectiveAt',
    ]),
    modules,
    ...(tierDetails ? { tierDetails } : {}),
  };
}

function projectAnalytics(value: unknown): unknown {
  if (!isRecord(value)) return undefined;
  const projectRows = (rows: unknown, fields: readonly string[]) =>
    Array.isArray(rows) ? rows.map(row => project(row, fields)) : [];
  const reservations = project(value.reservations, [
    'total', 'confirmed', 'pending', 'cancelled', 'completed',
  ]);
  const billing = project(value.billing, [
    'totalRevenue', 'reservationRevenue', 'combinedRevenue', 'paidTabs', 'avgPerTab',
  ]);
  const players = project(value.players, ['total', 'active']);
  const queue = project(value.queue, ['matchesPlayed']);
  return {
    ...project(value, ['period']),
    dateRange: project(value.dateRange, ['start', 'end']),
    reservations,
    billing,
    players,
    queue,
    revenueByDay: projectRows(value.revenueByDay, [
      'date', 'reservationRevenue', 'billingRevenue', 'total',
    ]),
    courtUtilization: projectRows(value.courtUtilization, ['court', 'bookings', 'hours']),
    topItems: projectRows(value.topItems, ['name', 'quantity', 'revenue']),
    peakHours: projectRows(value.peakHours, ['hour', 'label', 'count']),
    statusBreakdown: projectRows(value.statusBreakdown, ['status', 'count']),
  };
}

function projectReservations(value: unknown): unknown {
  const fields = [
    '_id', 'name', 'court', 'date', 'timeSlot', 'duration', 'playerCount', 'status',
    'paymentOption', 'reservationFeeAmount', 'downpaymentAmount', 'maintenanceFeeAmount',
    'amountPaidOnline', 'remainingBalanceAmount', 'paymentStatus', 'paymentExpiresAt',
    'createdAt', 'updatedAt',
  ] as const;
  return Array.isArray(value) ? value.map(row => project(row, fields)) : undefined;
}

export function snapshotEndpoint(path: string): string {
  const url = new URL(path, 'https://snapshot.invalid');
  const entries = [...url.searchParams.entries()].sort(([aKey, aValue], [bKey, bValue]) =>
    aKey.localeCompare(bKey) || aValue.localeCompare(bValue));
  const query = new URLSearchParams(entries).toString();
  return `${url.pathname}${query ? `?${query}` : ''}`;
}

export function sanitizeSnapshot(path: string, value: unknown): unknown | undefined {
  const endpoint = snapshotEndpoint(path);
  const pathname = endpoint.split('?')[0];
  if (pathname === '/players' || pathname === '/items' ||
      pathname === '/items/all' || pathname === '/items/splittable' ||
      pathname === '/queue' || pathname === '/queue/history' ||
      pathname === '/tabs/open') {
    if (!Array.isArray(value)) return undefined;
    if (pathname === '/queue' || pathname === '/queue/history') return value.map(projectMatch);
    if (pathname === '/tabs/open') return value.map(projectTab);
    if (pathname === '/players') {
      return value.map(row => project(row, [
        '_id', 'name', 'level', 'gender', 'age', 'matchCount', 'isActive', 'createdAt',
      ]));
    }
    return value.map(row => project(row, [
      '_id', 'name', 'price', 'category', 'isActive', 'isSplittable',
    ]));
  }
  if (pathname === '/tabs/history') return projectPaginated(value, projectTab);
  if (pathname === '/reservation-tabs/today') {
    return Array.isArray(value) ? value.map(projectReservationTab) : undefined;
  }
  if (pathname === '/reservation-tabs/history') {
    return projectPaginated(value, projectReservationTab);
  }
  if (pathname === '/reservations' || pathname === '/reservations/window') return projectReservations(value);
  if (pathname === '/analytics/summary') return projectAnalytics(value);
  if (pathname === '/court/me/capabilities') return projectCapabilities(value);
  if (pathname === '/court/me' && isRecord(value)) {
    const subscription = isRecord(value.subscription)
      ? project(value.subscription, ['tier'])
      : undefined;
    return {
      ...project(value, ['name', 'courtCount']),
      ...(subscription ? { subscription } : {}),
    };
  }
  return undefined;
}

export function isSnapshotFresh(snapshot: Pick<Snapshot, 'fetchedAt'>, now = Date.now()): boolean {
  const age = now - snapshot.fetchedAt;
  return Number.isFinite(snapshot.fetchedAt) && age >= 0 && age < SNAPSHOT_TTL_MS;
}

function snapshotId(identity: string, endpoint: string): string {
  return `${identity}:${endpoint}`;
}

export async function storeSnapshot(
  identity: string,
  endpoint: string,
  value: unknown,
  fetchedAt = Date.now(),
  reservationWindow?: { dateFrom: string; dateTo: string }
): Promise<boolean> {
  const data = sanitizeSnapshot(endpoint, value);
  if (data === undefined) return false;
  const snapshot: Snapshot = {
    id: snapshotId(identity, endpoint),
    identity,
    endpoint,
    data,
    source: 'network',
    fetchedAt,
    ...(reservationWindow ? { reservationWindow } : {}),
  };
  const database = await openSnapshotDatabase();
  try {
    await transactionRequest(
      database.transaction(SNAPSHOT_STORE, 'readwrite').objectStore(SNAPSHOT_STORE).put(snapshot),
      'Could not save snapshot.'
    );
  } finally {
    closeDatabase(database);
  }
  return true;
}

export async function readReservationWindow(
  identity: string,
  requestedWindow?: { dateFrom: string; dateTo: string },
  now = Date.now()
): Promise<{ data: unknown[]; fetchedAt: number; reservationWindow: { dateFrom: string; dateTo: string } } | undefined> {
  const database = await openSnapshotDatabase();
  try {
    const endpoint = '/reservations/window';
    const id = snapshotId(identity, endpoint);
    const snapshot = await transactionRequest(
      database.transaction(SNAPSHOT_STORE, 'readonly').objectStore(SNAPSHOT_STORE)
        .get(id) as IDBRequest<Snapshot<unknown[]> | undefined>,
      'Could not read reservation window snapshot.'
    );
    if (!snapshot) return undefined;
    const inWindow = snapshot.reservationWindow && (
      !requestedWindow ||
      (snapshot.reservationWindow.dateFrom <= requestedWindow.dateFrom &&
        snapshot.reservationWindow.dateTo >= requestedWindow.dateTo)
    );
    if (!isSnapshotFresh(snapshot, now) || !inWindow) {
      if (!isSnapshotFresh(snapshot, now)) {
        await transactionRequest(
          database.transaction(SNAPSHOT_STORE, 'readwrite').objectStore(SNAPSHOT_STORE).delete(id),
          'Could not expire reservation window snapshot.'
        );
      }
      return undefined;
    }
    return {
      data: snapshot.data,
      fetchedAt: snapshot.fetchedAt,
      reservationWindow: snapshot.reservationWindow!,
    };
  } finally {
    closeDatabase(database);
  }
}

export async function readSnapshot<T = unknown>(
  identity: string,
  endpoint: string,
  now = Date.now()
): Promise<{ data: T; source: 'snapshot'; fetchedAt: number } | undefined> {
  const database = await openSnapshotDatabase();
  try {
    const snapshot = await transactionRequest(
      database.transaction(SNAPSHOT_STORE, 'readonly').objectStore(SNAPSHOT_STORE)
        .get(snapshotId(identity, endpoint)) as IDBRequest<Snapshot<T> | undefined>,
      'Could not read snapshot.'
    );
    if (!snapshot) return undefined;
    if (!isSnapshotFresh(snapshot, now)) {
      await transactionRequest(
        database.transaction(SNAPSHOT_STORE, 'readwrite').objectStore(SNAPSHOT_STORE).delete(snapshot.id),
        'Could not expire snapshot.'
      );
      return undefined;
    }
    return { data: snapshot.data, source: 'snapshot', fetchedAt: snapshot.fetchedAt };
  } finally {
    closeDatabase(database);
  }
}

export async function recordLastOnlineAt(identity: string, timestamp = Date.now()): Promise<void> {
  const database = await openSnapshotDatabase();
  try {
    await transactionRequest(
      database.transaction(META_STORE, 'readwrite').objectStore(META_STORE)
        .put(timestamp, `lastOnlineAt:${identity}`),
      'Could not record the last successful connection.'
    );
  } finally {
    closeDatabase(database);
  }
}

export async function readLastOnlineAt(identity: string): Promise<number | undefined> {
  const database = await openSnapshotDatabase();
  try {
    const value = await transactionRequest(
      database.transaction(META_STORE, 'readonly').objectStore(META_STORE)
        .get(`lastOnlineAt:${identity}`) as IDBRequest<number | undefined>,
      'Could not read the last successful connection.'
    );
    return typeof value === 'number' ? value : undefined;
  } finally {
    closeDatabase(database);
  }
}

export async function getOldestSnapshotMetadata(
  identity: string,
  endpointPrefixes: readonly string[],
  now = Date.now()
): Promise<SnapshotMetadata | undefined> {
  const database = await openSnapshotDatabase();
  try {
    const snapshots = await transactionRequest(
      database.transaction(SNAPSHOT_STORE, 'readonly').objectStore(SNAPSHOT_STORE)
        .getAll() as IDBRequest<Snapshot[]>,
      'Could not read snapshot timestamps.'
    );
    const matching = snapshots.filter(snapshot =>
      snapshot.identity === identity &&
      endpointPrefixes.some(prefix => snapshot.endpoint.startsWith(prefix)));
    const expired = matching.filter(snapshot => !isSnapshotFresh(snapshot, now));
    if (expired.length > 0) {
      const store = database.transaction(SNAPSHOT_STORE, 'readwrite').objectStore(SNAPSHOT_STORE);
      await Promise.all(expired.map(snapshot =>
        transactionRequest(store.delete(snapshot.id), 'Could not expire snapshot metadata.')
      ));
    }
    const pageSnapshots = matching.filter(snapshot => isSnapshotFresh(snapshot, now));
    const oldest = pageSnapshots.reduce<Snapshot | undefined>(
      (current, snapshot) => !current || snapshot.fetchedAt < current.fetchedAt ? snapshot : current,
      undefined
    );
    return oldest ? { source: 'snapshot', fetchedAt: oldest.fetchedAt } : undefined;
  } finally {
    closeDatabase(database);
  }
}

export async function wipeSnapshots(): Promise<void> {
  for (const database of openConnections) closeDatabase(database);
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME);
    let blockedTimer: ReturnType<typeof setTimeout> | undefined;
    request.onsuccess = () => {
      if (blockedTimer) clearTimeout(blockedTimer);
      resolve();
    };
    request.onerror = () => reject(request.error ?? new Error('Could not clear snapshot storage.'));
    request.onblocked = () => {
      for (const database of openConnections) closeDatabase(database);
      if (!blockedTimer) {
        blockedTimer = setTimeout(() => {
          reject(new Error('Snapshot storage deletion remained blocked for 3 seconds.'));
        }, 3_000);
      }
    };
  });
}
