'use client';
import { useEffect, useState } from 'react';

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
    return () => {
      window.removeEventListener('online',  onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  // Don't render anything until mounted — prevents SSR/client mismatch
  if (!mounted) return null;
  if (online) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[400] px-4 py-2 rounded-full bg-gray-900 border border-white/10 text-white/70 text-xs shadow-lg">
      Offline mode: showing cached data
    </div>
  );
}