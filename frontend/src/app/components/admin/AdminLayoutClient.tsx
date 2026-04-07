'use client';
import { useState, useEffect, useCallback } from 'react';
import { Toaster } from 'sileo';
import { APP_NAME } from '@/lib/config';
import AdminSidebar from './AdminSidebar';

interface Props {
  children: React.ReactNode;
  user: { name: string; email: string; image: string }
}

export default function AdminLayoutClient({ children, user }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fsSupported, setFsSupported] = useState(false);
  
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  /**
   * @desc Check if fullscreen is supported (iOS Safari not supported)
   */
  useEffect(() => {
    if (typeof document !== 'undefined') {
      setFsSupported(!!document.documentElement.requestFullscreen);
    }
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Auto-enter fullscreen when admin layout mounts
  useEffect(() => {
    if (typeof document === 'undefined' || !document.documentElement.requestFullscreen) return;
    
    const timer = setTimeout(() => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {
          // Browser may block auto-fullscreen without user gesture
        });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (typeof document === 'undefined') return;
    
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(console.warn);
    } else {
      document.exitFullscreen();
    }
  }, []);

  return (
    <>
      <Toaster
        position={isMobile ? 'bottom-center' : 'top-right'}
        options={{
          fill: "#171717",
          styles: {
            title: "text-white!",
            description: "text-white/75!",
            badge: "bg-white/10!",
          },
        }}
      />

      {/* Mobile top bar */}
      <div className="mobile-topbar">
        <button
          onClick={() => setSidebarOpen(o => !o)}
          aria-label="Toggle menu"
          className="flex flex-col gap-1 p-1.5 rounded-md border-none bg-transparent cursor-pointer"
        >
          <span className={`block w-[18px] h-[2px] bg-gray-700 rounded-sm transition-all duration-200 ${sidebarOpen ? 'rotate-45 translate-x-1 translate-y-1' : ''}`} />
          <span className={`block w-[18px] h-[2px] bg-gray-700 rounded-sm transition-all duration-200 ${sidebarOpen ? 'opacity-0' : 'opacity-100'}`} />
          <span className={`block w-[18px] h-[2px] bg-gray-700 rounded-sm transition-all duration-200 ${sidebarOpen ? '-rotate-45 translate-x-1 -translate-y-1' : ''}`} />
        </button>
        <span className="font-bold text-sm text-gray-900 tracking-tight">
          {APP_NAME}
        </span>

        {/* Fullscreen toggle */}
        {fsSupported && (
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            className="ml-auto w-8 h-8 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 transition-colors"
          >
            {isFullscreen ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 0 2-2h3M3 16h3a2 2 0 0 0 2 2v3"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
              </svg>
            )}
          </button>
        )}
      </div>

      {/* Backdrop */}
      {sidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      <div className="flex min-h-screen bg-gray-100 font-sans">
        {/* Pass session to AdminSidebar */}
        <AdminSidebar 
          isOpen={sidebarOpen} 
          onClose={() => setSidebarOpen(false)}
          user={user}
        />
        <main className="admin-main flex-1 px-[clamp(1rem,3vw,2rem)] pb-[clamp(1rem,3vw,2rem)] pt-[clamp(1rem,3vw,2rem)] md:pt-[clamp(1rem,3vw,2rem)]">
          {children}
        </main>
      </div>
    </>
  );
}