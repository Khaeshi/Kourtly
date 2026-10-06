'use client';

import { useEffect } from 'react';
import { useCapabilityState } from '@/lib/entitlements';
import {
  getItems,
  getAllItems,
  getHistory,
  getOpenTabs,
  getPlayers,
  getQueue,
  getReservationTabHistoryPaged,
  getReservationsRange,
  getSplittableItems,
  getTabHistoryPaged,
  getTodayReservationTabs,
  OfflineUnavailableError,
  proxyFetch,
  ApiError,
} from '@/lib/api';

const PREFETCH_INTERVAL_MS = 5 * 60_000;
const REQUEST_GAP_MS = 300;
const ANALYTICS_PERIODS = ['today', 'week', 'month', 'year'] as const;
const QUEUE_HISTORY_STATUSES = ['all', 'paid', 'unpaid'] as const;
const RESERVATION_HISTORY_STATUSES = ['all', 'paid', 'unpaid', 'open'] as const;
const MIN_RUN_INTERVAL_MS = 2 * 60_000;
let lastRunStartedAt = Number.NEGATIVE_INFINITY;
let waitForScheduledInterval = false;

function dateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getReservationPrefetchWindow(now = new Date()): { dateFrom: string; dateTo: string } {
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  const start = new Date(Date.UTC(year, month, day - 7));
  const end = new Date(Date.UTC(year, month, day + 30));
  return { dateFrom: dateString(start), dateTo: dateString(end) };
}

async function waitUntilNextRequest(): Promise<void> {
  await new Promise<void>(resolve => window.setTimeout(resolve, REQUEST_GAP_MS));
}

export interface AdminPrefetchCapabilities {
  queue: boolean;
  itemTabs: boolean;
  booking: boolean;
}

export interface AdminPrefetchRequest {
  url: string;
  run: () => Promise<unknown>;
}

export function buildAdminPrefetchRequests(
  capabilities: AdminPrefetchCapabilities,
  now: Date
): AdminPrefetchRequest[] {
  const requests: AdminPrefetchRequest[] = [];
  const add = (url: string, run: () => Promise<unknown>) => requests.push({ url, run });

  add('/court/me', () => proxyFetch('/court/me'));
  for (const period of ANALYTICS_PERIODS) {
    add(`/analytics/summary?period=${period}`, () => proxyFetch(`/analytics/summary?period=${period}`));
  }
  if (capabilities.booking) {
    const windowRange = getReservationPrefetchWindow(now);
    const query = new URLSearchParams(windowRange).toString();
    add(`/reservations?${query}`, () => getReservationsRange(windowRange.dateFrom, windowRange.dateTo));
  }
  if (capabilities.queue || capabilities.itemTabs) add('/players', getPlayers);
  if (capabilities.queue) {
    add('/queue', getQueue);
    add('/queue/history', getHistory);
    add('/items/splittable', getSplittableItems);
  }
  if (capabilities.itemTabs) {
    add('/items', getItems);
    add('/items/all', getAllItems);
    add('/tabs/open', getOpenTabs);
    add('/reservation-tabs/today', getTodayReservationTabs);
    for (const status of QUEUE_HISTORY_STATUSES) {
      const query = new URLSearchParams({ status, page: '1' }).toString();
      add(`/tabs/history?${query}`, () => getTabHistoryPaged({ status, page: 1 }));
    }
    for (const status of RESERVATION_HISTORY_STATUSES) {
      const query = new URLSearchParams({ status, page: '1' }).toString();
      add(`/reservation-tabs/history?${query}`, () =>
        getReservationTabHistoryPaged({ status, page: 1 }));
    }
    add('/payout-transfers?limit=10&status=all', () =>
      proxyFetch('/payout-transfers?limit=10&status=all', undefined, { allowSnapshotFallback: false }));
  }
  return requests;
}

async function runPrefetch(capabilities: AdminPrefetchCapabilities, now = new Date()): Promise<boolean> {
  const requests = buildAdminPrefetchRequests(capabilities, now);

  for (const request of requests) {
    if (!navigator.onLine || document.visibilityState !== 'visible') return false;
    try {
      await request.run();
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        return true;
      }
      if (error instanceof ApiError && [403, 413].includes(error.status ?? 0)) {
        await waitUntilNextRequest();
        continue;
      }
      if (!navigator.onLine || error instanceof OfflineUnavailableError) return false;
      console.error('Could not prefetch admin data.', error);
    }
    await waitUntilNextRequest();
  }
  return false;
}

export default function AdminPrefetchRunner() {
  const { status, capabilities } = useCapabilityState();

  useEffect(() => {
    if (status !== 'known' || !capabilities) return;
    let running = false;
    const run = async (source: 'event' | 'interval') => {
      if (running || !navigator.onLine || document.visibilityState !== 'visible') return;
      if (waitForScheduledInterval && source !== 'interval') return;
      if (source === 'interval') waitForScheduledInterval = false;
      const now = Date.now();
      if (now - lastRunStartedAt < MIN_RUN_INTERVAL_MS) return;
      lastRunStartedAt = now;
      running = true;
      try {
        waitForScheduledInterval = await runPrefetch({
          queue: capabilities.modules.queue,
          itemTabs: capabilities.modules.item_tabs,
          booking: capabilities.modules.booking,
        });
      } finally {
        running = false;
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void run('event');
    };
    void run('event');
    const interval = window.setInterval(() => void run('interval'), PREFETCH_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibilityChange);
    const onOnline = () => void run('event');
    window.addEventListener('online', onOnline);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('online', onOnline);
    };
  }, [capabilities, status]);

  return null;
}
