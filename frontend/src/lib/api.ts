import { API_BASE } from '@/lib/config'
import { sileo } from 'sileo';
import { wipeOfflineData } from '@/lib/offlineCache';
import {
  readSnapshot,
  readReservationWindow,
  recordLastOnlineAt,
  sanitizeSnapshot,
  snapshotEndpoint,
  storeSnapshot,
} from '@/lib/snapshotStore';
import {
  filterReservations,
  RESERVATION_WINDOW_SNAPSHOT_KEY,
  type ReservationWindow,
} from '@/lib/reservationSnapshot';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Level      = 'A' | 'B' | 'C' | 'D';
export type Gender     = 'Male' | 'Female';
export type MatchType  = 'MD' | 'WD' | 'XD';
export type MatchStatus = 'queued' | 'playing' | 'done';

export interface Player {
  _id: string; name: string; level: Level; gender: Gender;
  age: number; matchCount: number; isActive: boolean; createdAt: string;
}

export interface BillingItem {
  name: string; defaultPrice: number; quantity: number; priceOverride: number | null;
}

export interface Match {
  _id: string; team1: Player[]; team2: Player[];
  matchType: MatchType; court: number; status: MatchStatus;
  createdAt: string; updatedAt: string;
}

export interface Bill {
  _id: string; player: Player; items: BillingItem[]; total: number; createdAt: string;
}

export interface CatalogItem {
  _id: string; name: string; price: number;
  category: string; isActive: boolean; isSplittable: boolean;
}

export interface TabItem {
  _id?: string; item?: string; name: string;
  price: number; quantity: number; addedAt?: string;
}

export interface Tab {
  _id: string;
  player: { _id: string; name: string; level: string };
  items: TabItem[]; total: number;
  status: 'open' | 'paid' | 'unpaid'; sessionDate: string;
  createdAt: string; updatedAt: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly kind: 'http' | 'network'
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class OfflineUnavailableError extends Error {
  constructor(message = 'This data is not available offline.', options?: ErrorOptions) {
    super(message, options);
    this.name = 'OfflineUnavailableError';
  }
}

export class OfflineReadOnlyError extends Error {
  constructor(message = 'Changes cannot be made while offline.') {
    super(message);
    this.name = 'OfflineReadOnlyError';
  }
}

interface ProxyFetchOptions {
  allowSnapshotFallback?: boolean;
  snapshotKey?: string;
  reservationWindow?: ReservationWindow;
}

let configuredIdentity: string | null = null;
let sessionRedirectStarted = false;
const HEARTBEAT_WRITE_INTERVAL_MS = 30_000;
const lastHeartbeatWrite = new Map<string, number>();

export function setProxyIdentity(identity: string | null): void {
  configuredIdentity = identity;
}

function emitConnectivity(status: 'online' | 'offline' | 'degraded'): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kourtly:connectivity', { detail: { status } }));
  }
}

function proxyPath(path: string): string {
  return path.startsWith(`${API_BASE}/`) ? path.slice(API_BASE.length) : path;
}

async function getSnapshotIdentity(): Promise<string | null> {
  if (configuredIdentity) return configuredIdentity;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return null;
  try {
    const { getSession } = await import('next-auth/react');
    const session = await getSession();
    const dbId = session?.user?.dbId;
    const courtId = session?.user?.courtId;
    return dbId && courtId ? `${dbId}:${courtId}` : null;
  } catch (error) {
    console.error('Could not resolve the admin snapshot identity.', error);
    return null;
  }
}

function endSession(): void {
  if (
    typeof window === 'undefined' ||
    sessionRedirectStarted ||
    window.location.pathname === '/auth/signin'
  ) return;
  sessionRedirectStarted = true;
  void (async () => {
    try {
      await wipeOfflineData();
    } catch (error) {
      console.error('Could not wipe offline data after an unauthorized response.', error);
    }
    try {
      const { signOut } = await import('next-auth/react');
      await signOut({ callbackUrl: '/auth/signin' });
    } catch (error) {
      console.error('Could not sign out after an unauthorized response.', error);
      window.location.assign('/auth/signin');
    }
  })();
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const data: unknown = await response.json();
    if (typeof data === 'object' && data !== null &&
        'error' in data && typeof data.error === 'string') return data.error;
  } catch {
    // Non-JSON API errors retain their HTTP status and generic message.
  }
  return `API error ${response.status}`;
}

function recordSuccessfulResponse(identity: string | null): void {
  if (!identity) return;
  const now = Date.now();
  const lastWrite = lastHeartbeatWrite.get(identity);
  if (lastWrite !== undefined && now - lastWrite < HEARTBEAT_WRITE_INTERVAL_MS) return;
  lastHeartbeatWrite.set(identity, now);
  void recordLastOnlineAt(identity, now).catch(error => {
    lastHeartbeatWrite.delete(identity);
    console.error('Could not update the last successful connection time.', error);
  });
}

export async function proxyFetch<T>(
  path: string,
  options?: RequestInit,
  proxyOptions: ProxyFetchOptions = {}
): Promise<T> {
  const endpoint = snapshotEndpoint(proxyPath(path));
  const method = (options?.method ?? 'GET').toUpperCase();
  const isGet = method === 'GET';
  const rejectOfflineWrite = () => {
    sileo.error({ title: 'Read-only offline', description: 'Reconnect to make changes.' });
    return new OfflineReadOnlyError();
  };
  if (!isGet && typeof navigator !== 'undefined' && !navigator.onLine) {
    throw rejectOfflineWrite();
  }

  const identity = await getSnapshotIdentity();
  if (!isGet && typeof navigator !== 'undefined' && !navigator.onLine) {
    throw rejectOfflineWrite();
  }
  const headers = new Headers(options?.headers);
  if (!headers.has('Content-Type') && options?.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      method,
      headers,
    });
  } catch (error) {
    const apiError = new ApiError(
      error instanceof Error ? error.message : 'Network request failed.',
      null,
      'network'
    );
    emitConnectivity(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'degraded');
    if (isGet && proxyOptions.allowSnapshotFallback !== false && identity) {
      try {
        const saved = await readSnapshot<T>(identity, endpoint);
        if (saved) return saved.data;
      } catch (storageError) {
        console.error(`Could not read offline snapshot for ${endpoint}.`, storageError);
      }
    }
    throw new OfflineUnavailableError(undefined, { cause: apiError });
  }

  if (response.status === 401) endSession();
  if (!isGet && response.status === 503) {
    const message = await readErrorMessage(response);
    if (message.toLowerCase() === 'offline') {
      emitConnectivity(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'degraded');
      sileo.error({ title: 'Read-only offline', description: 'Reconnect to make changes.' });
      throw new OfflineReadOnlyError();
    }
    throw new ApiError(message, response.status, 'http');
  }
  if (isGet && [502, 503, 504].includes(response.status)) {
    emitConnectivity(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'degraded');
    const apiError = new ApiError(await readErrorMessage(response), response.status, 'http');
    if (isGet && proxyOptions.allowSnapshotFallback !== false && identity) {
      try {
        const saved = await readSnapshot<T>(identity, endpoint);
        if (saved) return saved.data;
      } catch (storageError) {
        console.error(`Could not read offline snapshot for ${endpoint}.`, storageError);
      }
    }
    throw new OfflineUnavailableError(undefined, { cause: apiError });
  }
  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status, 'http');
  }

  emitConnectivity('online');
  recordSuccessfulResponse(identity);

  let data: T;
  try {
    data = await response.json() as T;
  } catch {
    throw new ApiError(
      'The API returned an invalid response.',
      response.status,
      'http'
    );
  }

  const snapshotKey = proxyOptions.snapshotKey
    ? snapshotEndpoint(proxyOptions.snapshotKey)
    : endpoint;
  if (isGet && identity && sanitizeSnapshot(endpoint, data) !== undefined) {
    void storeSnapshot(identity, snapshotKey, data, Date.now(), proxyOptions.reservationWindow).catch(error => {
      console.error(`Could not save offline snapshot for ${endpoint}.`, error);
    });
  }
  return data;
}

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  return proxyFetch<T>(path, options);
}

// ─── Players ──────────────────────────────────────────────────────────────────

export const getPlayers    = () => req<Player[]>('/players');
export const createPlayer  = (body: Omit<Player, '_id'|'matchCount'|'isActive'|'createdAt'>) => req<Player>('/players', { method:'POST', body: JSON.stringify(body) });
export const updatePlayer  = (id: string, body: Partial<Player>) => req<Player>(`/players/${id}`, { method:'PATCH', body: JSON.stringify(body) });
export const deletePlayer  = (id: string) => req<{success:boolean}>(`/players/${id}`, { method:'DELETE' });

// ─── Queue ────────────────────────────────────────────────────────────────────

export const getQueue    = () => req<Match[]>('/queue');
export const getHistory  = () => req<Match[]>('/queue/history');
export const deleteHistory = () => req(`/queue/history`, { method: 'DELETE'});

export const createMatch = (body: {
  team1: string[]; team2: string[]; matchType: MatchType; court: number;
  shuttlecockId?: string; // optional — triggers auto-split
}) => req<Match>('/queue', { method:'POST', body: JSON.stringify(body) });

export const updateMatch = (id: string, body: Partial<Pick<Match,'status'|'court'>>) =>
  req<Match>(`/queue/${id}`, { method:'PATCH', body: JSON.stringify(body) });

export const deleteMatch = (id: string) =>
  req<{success:boolean}>(`/queue/${id}`, { method:'DELETE' });

export interface QueueProofreadResponse {
  verdict: 'fair' | 'review';
  metrics: {
    teamScoreGap: number;
    internalLevelVariance: number;
  };
  explanation: string;
  aiUsed: boolean;
}

export const proofreadMatch = (body: { team1: string[]; team2: string[]; matchType: MatchType }) =>
  req<QueueProofreadResponse>('/queue/proofread', { method: 'POST', body: JSON.stringify(body) });

// ─── Billing (legacy) ─────────────────────────────────────────────────────────

export const getBills = () => req<Bill[]>('/billing');
export const createBill = (body: {player:string; items:BillingItem[]}) => req<Bill>('/billing', { method:'POST', body: JSON.stringify(body) });
export const updateBill = (id: string, body:{items:BillingItem[]}) => req<Bill>(`/billing/${id}`, { method:'PATCH', body: JSON.stringify(body) });
export const deleteBill = (id: string) => req<{success:boolean}>(`/billing/${id}`, { method:'DELETE' });


/**
 * @desc Item Routes
 * @returns route
 */
export const getItems = () => req<CatalogItem[]>('/items');
export const getAllItems = () => req<CatalogItem[]>('/items/all');
export const getSplittableItems = () => req<CatalogItem[]>('/items/splittable');
export const createItem = (data: Omit<CatalogItem,'_id'>) => req<CatalogItem>('/items', { method:'POST', body: JSON.stringify(data) });
export const updateItem = (id: string, data: Partial<CatalogItem>) => req<CatalogItem>(`/items/${id}`, { method:'PUT', body: JSON.stringify(data) });
export const deleteItem = (id: string) => req<void>(`/items/${id}`, { method:'DELETE' });

// ─── Tabs ─────────────────────────────────────────────────────────────────────

export const getOpenTabs   = () => req<Tab[]>('/tabs/open');
export const getTabHistory = () => req<Tab[]>('/tabs/history');

export const openTab = (playerId: string) =>
  req<Tab>('/tabs', { method:'POST', body: JSON.stringify({ player: playerId }) });

export const addItemToTab = (tabId: string, item: { itemId: string; name: string; price: number; quantity: number }) =>
  req<Tab>(`/tabs/${tabId}/items`, { method:'POST', body: JSON.stringify(item) });

export const splitItem = (body: { itemId: string; name: string; price: number; playerIds: string[] }) =>
  req<Tab[]>('/tabs/split', { method:'POST', body: JSON.stringify(body) });

export const removeItemFromTab = (tabId: string, itemIndex: number) =>
  req<Tab>(`/tabs/${tabId}/items/${itemIndex}`, { method:'DELETE' });

export const payTab = (tabId: string) => req<Tab>(`/tabs/${tabId}/pay`, { method: 'PUT' });
export const markUnpaid = (tabId: string) => req<Tab>(`/tabs/${tabId}/unpaid`, { method: 'PUT'});
export const payUnpaid = (tabId: string) => req<Tab>(`/tabs/${tabId}/pay-unpaid`, { method: 'PUT'})
export const closeTab = (tabId: string) => req<void>(`/tabs/${tabId}`, { method: 'DELETE' });

export interface TabHistoryParams {
  status?: 'paid' | 'unpaid' | 'all';
  date?:   string;
  page?:   number;
  limit?:  number;
}

export interface PaginatedTabs {
  tabs:       Tab[];
  pagination: { page:number; limit:number; total:number; totalPages:number; hasNext:boolean; hasPrev:boolean };
}
export async function getTabHistoryPaged(params: TabHistoryParams = {}): Promise<PaginatedTabs> {
  const q = new URLSearchParams();
  if (params.status) q.set('status', params.status);
  if (params.date)   q.set('date',   params.date);
  if (params.page)   q.set('page',   String(params.page));
  if (params.limit)  q.set('limit',  String(params.limit));
  return req<PaginatedTabs>(`/tabs/history?${q}`);
}


// ── Reservation Types ──────────────────────────────────────────────────────────

export interface Reservation {
  _id: string;
  name: string;
  phone?: string;
  email?: string;
  court: number;
  date: string;        // "YYYY-MM-DD"
  timeSlot: string;    // "08:00-09:00"
  duration: number;
  playerCount: number;
  status:
    | 'pending'
    | 'pending_admin'
    | 'approved_waiting_payment'
    | 'payment_processing'
    | 'payment_received'
    | 'payment_conflict'
    | 'refund_required'
    | 'expired'
    | 'confirmed'
    | 'cancelled'
    | 'completed';
  publicRef?: string;
  paymentOption?: 'downpayment' | 'full';
  reservationFeeAmount?: number;
  downpaymentAmount?: number;
  maintenanceFeeAmount?: number;
  amountPaidOnline?: number;
  remainingBalanceAmount?: number;
  paymentStatus?: 'none' | 'awaiting_payment' | 'paid' | 'expired' | 'failed' | 'cancelled';
  paymentExpiresAt?: string | null;
  paymentUrl?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type BookingPayload = Omit<Reservation, '_id' | 'status' | 'createdAt' | 'updatedAt'>;

// ── Reservation API ────────────────────────────────────────────────────────────

export async function getReservations(params?: {
  date?: string;
  status?: string;
}): Promise<Reservation[]> {
  const q = new URLSearchParams();
  if (params?.date)   q.set('date',   params.date);
  if (params?.status) q.set('status', params.status);
  try {
    return await req<Reservation[]>(`/reservations?${q}`);
  } catch (error) {
    if (!(error instanceof OfflineUnavailableError)) throw error;
    const identity = await getSnapshotIdentity();
    if (!identity) throw new OfflineUnavailableError(
      params?.date ? 'Not cached for this date' : 'Not cached yet',
      { cause: error }
    );
    const saved = await readReservationWindow(
      identity,
      params?.date ? { dateFrom: params.date, dateTo: params.date } : undefined
    );
    if (!saved) throw new OfflineUnavailableError(
      params?.date ? 'Not cached for this date' : 'Not cached yet',
      { cause: error }
    );
    return filterReservations(saved.data as Reservation[], params ?? {});
  }
}

export async function getReservationsRange(
  dateFrom: string,
  dateTo: string
): Promise<Reservation[]> {
  const reservationWindow = { dateFrom, dateTo };
  const q = new URLSearchParams({ dateFrom, dateTo });
  return proxyFetch<Reservation[]>(
    `/reservations?${q}`,
    undefined,
    {
      allowSnapshotFallback: false,
      snapshotKey: RESERVATION_WINDOW_SNAPSHOT_KEY,
      reservationWindow,
    }
  );
}

export async function getAvailability(
  date: string,
  court?: number
): Promise<{ court: number; timeSlot: string }[]> {
  const q = new URLSearchParams({ date });
  if (court) q.set('court', String(court));
  return req<{court:number; timeSlot: string }[]>(`/reservations/availability?${q}`)
}

export async function createReservation(data: BookingPayload): Promise<Reservation> {
  const res = await req<Reservation>('/reservations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res;
}

export async function updateReservation(
  id: string,
  data: Partial<Reservation>
): Promise<Reservation> {
  return req<Reservation>(`/reservations/${id}`, { 
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function approveReservationPayment(id: string): Promise<Reservation> {
  return req<Reservation>(`/reservations/${id}/approve-payment`, { method: 'POST' });
}

export async function cancelReservationPayment(id: string): Promise<Reservation> {
  return req<Reservation>(`/reservations/${id}/cancel-payment`, { method: 'POST' });
}

export async function createReservationBillingTab(id: string): Promise<ReservationTab> {
  return req<ReservationTab>(`/reservation-tabs/from-reservation/${id}`, { method: 'POST' });
}

export async function deleteReservation(id: string): Promise<void> {
  await req<void>(`/reservations/${id}`, { method: 'DELETE' });
}

// ─── Reservation Tabs ─────────────────────────────────────────────────────────
 
export interface ReservationTab {
  _id:         string;
  reservation: string;
  guestName:   string;
  court:       number;
  date:        string;
  timeSlot:    string;
  duration:    number;
  items:       TabItem[];
  total:       number;
  status:      'open' | 'paid' | 'unpaid';
  paymentSummary?: {
    reservationFee: number;
    paidOnline: number;
    remainingBalance: number;
    source: string;
  };
  createdAt:   string;
  updatedAt:   string;
}
 
export const getTodayReservationTabs = () =>
  req<ReservationTab[]>('/reservation-tabs/today');
 
export const getReservationTabHistory = () =>
  req<ReservationTab[]>('/reservation-tabs/history');
 
export const addItemToReservationTab = (
  tabId: string,
  item: { itemId: string; name: string; price: number; quantity: number }
) => req<ReservationTab>(`/reservation-tabs/${tabId}/items`, {
  method: 'POST', body: JSON.stringify(item),
});
 
export const removeItemFromReservationTab = (tabId: string, itemIndex: number) =>
  req<ReservationTab>(`/reservation-tabs/${tabId}/items/${itemIndex}`, { method: 'DELETE' });
 
export const payReservationTab     = (tabId: string) =>
  req<ReservationTab>(`/reservation-tabs/${tabId}/pay`,        { method: 'PUT' });
export const markReservationUnpaid = (tabId: string) =>
  req<ReservationTab>(`/reservation-tabs/${tabId}/unpaid`,     { method: 'PUT' });
export const payReservationUnpaid  = (tabId: string) =>
  req<ReservationTab>(`/reservation-tabs/${tabId}/pay-unpaid`, { method: 'PUT' });
export const clearReservationTab   = (tabId: string) =>
  req<void>(`/reservation-tabs/${tabId}`, { method: 'DELETE' });
export const collectReservationBalance = (tabId: string) =>
  req<ReservationTab>(`/reservation-tabs/${tabId}/collect-balance`, { method: 'PUT' });
 
export interface ResTabHistoryParams {
  status?: 'paid' | 'unpaid' | 'open' | 'all';
  date?:   string;
  page?:   number;
  limit?:  number;
}
export interface PaginatedResTabs {
  tabs:       ReservationTab[];
  pagination: { page:number; limit:number; total:number; totalPages:number; hasNext:boolean; hasPrev:boolean };
}
export async function getReservationTabHistoryPaged(params: ResTabHistoryParams = {}): Promise<PaginatedResTabs> {
  const q = new URLSearchParams();
  if (params.status) q.set('status', params.status);
  if (params.date)   q.set('date',   params.date);
  if (params.page)   q.set('page',   String(params.page));
  if (params.limit)  q.set('limit',  String(params.limit));
  return req<PaginatedResTabs>(`/reservation-tabs/history?${q}`);
}

export interface AnalyticsAskResponse {
  answer: string;
  dataUsed: unknown;
}

export async function askAnalytics(question: string, period: 'today' | 'week' | 'month' | 'year'): Promise<AnalyticsAskResponse> {
  return req<AnalyticsAskResponse>('/analytics/ask', {
    method: 'POST',
    body: JSON.stringify({ question, period }),
  });
}
 