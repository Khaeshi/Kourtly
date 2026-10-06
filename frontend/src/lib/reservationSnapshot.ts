import type { Reservation } from '@/lib/api';

export const RESERVATION_WINDOW_SNAPSHOT_KEY = '/reservations/window';

export interface ReservationWindow {
  dateFrom: string;
  dateTo: string;
}

export function reservationWindowCovers(
  cachedWindow: ReservationWindow,
  requestedWindow: ReservationWindow
): boolean {
  return cachedWindow.dateFrom <= requestedWindow.dateFrom &&
    cachedWindow.dateTo >= requestedWindow.dateTo;
}

export function filterReservations(
  reservations: readonly Reservation[],
  filters: { date?: string; status?: string; court?: string | number }
): Reservation[] {
  return reservations.filter(reservation =>
    (!filters.date || reservation.date === filters.date) &&
    (!filters.status || filters.status === 'all' || reservation.status === filters.status) &&
    (filters.court === undefined || filters.court === 'all' ||
      String(reservation.court) === String(filters.court)));
}
