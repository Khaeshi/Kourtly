'use client';
import { useEffect, useState } from 'react';
import { subscribeOutboxCount } from '@/lib/offlineOutbox';
import { flushQueuedActions } from '@/lib/api';
import { emitLocalEvent } from '@/lib/localEvents';

export default function PWAInit() {
  const [online, setOnline] = useState(true); // assume online for SSR
  const [mounted, setMounted] = useState(false);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setMounted(true);
    setOnline(navigator.onLine);
    const onOnline  = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online',  onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    return subscribeOutboxCount(setPending);
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  // Auto-sync: flush queued actions when back online, plus periodic retry.
  useEffect(() => {
    if (!mounted) return;
    if (!online) return;
    let cancelled = false;

    const run = async () => {
      if (cancelled) return;
      if (pending <= 0) return;
      setSyncing(true);
      try {
        const res = await flushQueuedActions();
        if (res?.flushed) emitLocalEvent('data:sync');
      } finally {
        if (!cancelled) setSyncing(false);
      }
    };

    // Immediate flush on reconnect
    run();

    // Background retry loop (in case of flakey network)
    const t = window.setInterval(run, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [mounted, online, pending]);

  // Don't render anything until mounted — prevents SSR/client mismatch
  if (!mounted) return null;
  if (online && pending === 0) return null;

  const text = !online
    ? `Offline mode: ${pending ? `${pending} action(s) pending sync` : 'showing cached data'}`
    : syncing
    ? `Syncing ${pending} pending action(s)...`
    : `${pending} action(s) pending sync`;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[400] px-4 py-2 rounded-full bg-gray-900 border border-white/10 text-white/70 text-xs shadow-lg">
      {text}
    </div>
  );
}