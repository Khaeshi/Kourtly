'use client';
import { useEffect } from 'react';
import { wipeOfflineData } from '@/lib/offlineCache';

export default function PWAInit() {
  useEffect(() => {
    const onServiceWorkerMessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type === 'OFFLINE_DETECTED') {
        window.dispatchEvent(new CustomEvent('kourtly:connectivity', { detail: { status: 'offline' } }));
      }
      if (event.data?.type === 'CLEAR_OFFLINE_DATA') {
        void wipeOfflineData().catch(error => {
          console.error('Could not clear offline data after an unauthorized response.', error);
        });
      }
    };
    navigator.serviceWorker?.addEventListener('message', onServiceWorkerMessage);
    return () => {
      navigator.serviceWorker?.removeEventListener('message', onServiceWorkerMessage);
    };
  }, []);

  return null;
}