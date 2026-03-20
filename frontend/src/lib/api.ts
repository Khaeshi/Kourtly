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
  status: 'open' | 'paid'; sessionDate: string;
  createdAt: string; updatedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' }, ...options,
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

// ─── Players ──────────────────────────────────────────────────────────────────

export const getPlayers    = ()                                    => req<Player[]>('/api/players');
export const createPlayer  = (body: Omit<Player, '_id'|'matchCount'|'isActive'|'createdAt'>) => req<Player>('/api/players', { method:'POST', body: JSON.stringify(body) });
export const updatePlayer  = (id: string, body: Partial<Player>)  => req<Player>(`/api/players/${id}`, { method:'PATCH', body: JSON.stringify(body) });
export const deletePlayer  = (id: string)                         => req<{success:boolean}>(`/api/players/${id}`, { method:'DELETE' });

// ─── Queue ────────────────────────────────────────────────────────────────────

export const getQueue    = () => req<Match[]>('/api/queue');
export const getHistory  = () => req<Match[]>('/api/queue/history');
export const deleteHistory = () => req(`/api/queue/history`, { method: 'DELETE'});

export const createMatch = (body: {
  team1: string[]; team2: string[]; matchType: MatchType; court: number;
  shuttlecockId?: string; // optional — triggers auto-split
}) => req<Match>('/api/queue', { method:'POST', body: JSON.stringify(body) });

export const updateMatch = (id: string, body: Partial<Pick<Match,'status'|'court'>>) =>
  req<Match>(`/api/queue/${id}`, { method:'PATCH', body: JSON.stringify(body) });

export const deleteMatch = (id: string) =>
  req<{success:boolean}>(`/api/queue/${id}`, { method:'DELETE' });

// ─── Billing (legacy) ─────────────────────────────────────────────────────────

export const getBills    = ()                                          => req<Bill[]>('/api/billing');
export const createBill  = (body: {player:string; items:BillingItem[]}) => req<Bill>('/api/billing', { method:'POST', body: JSON.stringify(body) });
export const updateBill  = (id: string, body:{items:BillingItem[]})   => req<Bill>(`/api/billing/${id}`, { method:'PATCH', body: JSON.stringify(body) });
export const deleteBill  = (id: string)                               => req<{success:boolean}>(`/api/billing/${id}`, { method:'DELETE' });

// ─── Items ────────────────────────────────────────────────────────────────────

export const getItems          = ()                                     => req<CatalogItem[]>('/api/items');
export const getAllItems        = ()                                     => req<CatalogItem[]>('/api/items/all');
export const getSplittableItems = ()                                    => req<CatalogItem[]>('/api/items/splittable');
export const createItem        = (data: Omit<CatalogItem,'_id'>)        => req<CatalogItem>('/api/items', { method:'POST', body: JSON.stringify(data) });
export const updateItem        = (id: string, data: Partial<CatalogItem>) => req<CatalogItem>(`/api/items/${id}`, { method:'PUT', body: JSON.stringify(data) });
export const deleteItem        = (id: string)                           => req<void>(`/api/items/${id}`, { method:'DELETE' });

// ─── Tabs ─────────────────────────────────────────────────────────────────────

export const getOpenTabs   = ()                => req<Tab[]>('/api/tabs/open');
export const getTabHistory = ()                => req<Tab[]>('/api/tabs/history');

export const openTab = (playerId: string) =>
  req<Tab>('/api/tabs', { method:'POST', body: JSON.stringify({ player: playerId }) });

export const addItemToTab = (tabId: string, item: { itemId: string; name: string; price: number; quantity: number }) =>
  req<Tab>(`/api/tabs/${tabId}/items`, { method:'POST', body: JSON.stringify(item) });

export const splitItem = (body: { itemId: string; name: string; price: number; playerIds: string[] }) =>
  req<Tab[]>('/api/tabs/split', { method:'POST', body: JSON.stringify(body) });

export const removeItemFromTab = (tabId: string, itemIndex: number) =>
  req<Tab>(`/api/tabs/${tabId}/items/${itemIndex}`, { method:'DELETE' });

export const payTab   = (tabId: string) => req<Tab>(`/api/tabs/${tabId}/pay`, { method:'PUT' });
export const closeTab = (tabId: string) => req<void>(`/api/tabs/${tabId}`, { method:'DELETE' });


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
  const res = await fetch(`${API_BASE}/api/reservations?${q}`);
  return res.json();
}

export async function getAvailability(
  date: string,
  court?: number
): Promise<{ court: number; timeSlot: string }[]> {
  const q = new URLSearchParams({ date });
  if (court) q.set('court', String(court));
  const res = await fetch(`${API_BASE}/api/reservations/availability?${q}`);
  return res.json();
}

export async function createReservation(data: BookingPayload): Promise<Reservation> {
  const res = await fetch(`${API_BASE}/api/reservations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Booking failed');
  }
  return res.json();
}

export async function updateReservation(
  id: string,
  data: Partial<Reservation>
): Promise<Reservation> {
  const res = await fetch(`${API_BASE}/api/reservations/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteReservation(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/reservations/${id}`, { method: 'DELETE' });
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
  status:      'open' | 'paid';
  createdAt:   string;
  updatedAt:   string;
}
 
export const getTodayReservationTabs = () =>
  req<ReservationTab[]>('/api/reservation-tabs/today');
 
export const getReservationTabHistory = () =>
  req<ReservationTab[]>('/api/reservation-tabs/history');
 
export const addItemToReservationTab = (
  tabId: string,
  item: { itemId: string; name: string; price: number; quantity: number }
) => req<ReservationTab>(`/api/reservation-tabs/${tabId}/items`, {
  method: 'POST', body: JSON.stringify(item),
});
 
export const removeItemFromReservationTab = (tabId: string, itemIndex: number) =>
  req<ReservationTab>(`/api/reservation-tabs/${tabId}/items/${itemIndex}`, { method: 'DELETE' });
 
export const payReservationTab = (tabId: string) =>
  req<ReservationTab>(`/api/reservation-tabs/${tabId}/pay`, { method: 'PUT' });
 
export const clearReservationTab = (tabId: string) =>
  req<void>(`/api/reservation-tabs/${tabId}`, { method: 'DELETE' });