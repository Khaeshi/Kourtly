'use client';
import { useState } from 'react';
import { Toaster } from 'sileo';
import { APP_NAME } from '@/lib/config'
import AdminSidebar from './AdminSidebar';

interface Props {
  children: React.ReactNode;
  user: { name: string; email: string; image: string };
}

export default function AdminLayoutClient({ children, user }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

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
      </div>

      {/* Backdrop */}
      {sidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      <div className="flex min-h-screen bg-gray-100 font-sans">
        <AdminSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} />
        <main className="admin-main flex-1 px-[clamp(1rem,3vw,2rem)] pb-[clamp(1rem,3vw,2rem)] pt-[clamp(1rem,3vw,2rem)] md:pt-[clamp(1rem,3vw,2rem)]">
          {children}
        </main>
      </div>
    </>
  );
}