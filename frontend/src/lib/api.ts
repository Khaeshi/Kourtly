import { API_BASE } from '@/lib/config'

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

/**
 * Helpers
 * @desc The flow becomes: api.ts req() -> /proxy/players -> Next.js proxy readds JWT -> Railway + x-court-id header
 * @returns 
 */

async function getCourtHeaders(): Promise<Record<string, string>> {
  // getSession works on both client and server components
  const { getSession } = await import('next-auth/react');
  const session = await getSession();
  const headers: Record<string, string> = {};
  if (session?.user?.courtId) headers['x-court-id'] = session.user.courtId;
  if (session?.user?.role)    headers['x-user-role'] = session.user.role;
  return headers;
}

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const courtHeaders = await getCourtHeaders();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...courtHeaders },
    ...options,
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
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
  phone: string;
  email: string;
  court: number;
  date: string;        // "YYYY-MM-DD"
  timeSlot: string;    // "08:00-09:00"
  duration: number;
  playerCount: number;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  notes: string;
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
  return req<Reservation[]>(`/reservations?${q}`);
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

export async function deleteReservation(id: string): Promise<void> {
  await fetch(`${API_BASE}/reservations/${id}`, { method: 'DELETE' });
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
 
export interface ResTabHistoryParams {
  status?: 'paid' | 'unpaid' | 'all';
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
 