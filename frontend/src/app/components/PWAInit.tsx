'use client';
import { useEffect, useState } from 'react';
import { wipeOfflineData } from '@/lib/offlineCache';

export default function PWAInit() {
  const [online, setOnline] = useState(true); // assume online for SSR
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setOnline(navigator.onLine);
    const onOnline  = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);
    const onServiceWorkerMessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type === 'OFFLINE_DETECTED') {
        setOnline(false);
      } else if (event.data?.type === 'ONLINE_DETECTED') {
        setOnline(true);
      } else if (event.data?.type === 'CLEAR_OFFLINE_DATA') {
        void wipeOfflineData().catch(error => {
          console.error('Could not clear offline data after an unauthorized response.', error);
        });
      }
    };
    navigator.serviceWorker?.addEventListener('message', onServiceWorkerMessage);
    return () => {
      window.removeEventListener('online',  onOnline);
      window.removeEventListener('offline', onOffline);
      navigator.serviceWorker?.removeEventListener('message', onServiceWorkerMessage);
    };
  }, []);

  // Don't render anything until mounted — prevents SSR/client mismatch
  if (!mounted) return null;
  if (online) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[400] px-4 py-2 rounded-full bg-gray-900 border border-white/10 text-white/70 text-xs shadow-lg">
      Offline mode. Pages without cached content are unavailable.
    </div>
  );
}