'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export type ModuleKey = 'booking' | 'queue' | 'item_tabs';
export type TierKey = 'basic' | 'standard' | 'premium' | 'elite';

export interface Capabilities {
  tier: TierKey;
  currentTier: TierKey;
  modules: Record<ModuleKey, boolean>;
  tierDetails?: { label: string; description: string; price: number | null };
  pendingTier?: TierKey | null;
  pendingTierEffectiveAt?: string | null;
}

const DEFAULT_CAPABILITIES: Capabilities = {
  tier: 'basic',
  currentTier: 'basic',
  modules: { booking: true, queue: false, item_tabs: false },
};

const CapabilitiesContext = createContext<Capabilities | null>(null);

export function CapabilitiesProvider({ children }: { children: React.ReactNode }) {
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);

  useEffect(() => {
    fetch('/api/proxy/court/me/capabilities')
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (data?.tier && data?.modules) setCapabilities(data);
      })
      .catch(() => {});
  }, []);

  return (
    <CapabilitiesContext.Provider value={capabilities ?? DEFAULT_CAPABILITIES}>
      {children}
    </CapabilitiesContext.Provider>
  );
}

export function useCapabilities() {
  return useContext(CapabilitiesContext) ?? DEFAULT_CAPABILITIES;
}

export function CapabilityGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const capabilities = useCapabilities();
  const requiredModule = pathname.startsWith('/admin/queue') || pathname.startsWith('/admin/players')
    ? 'queue'
    : pathname.startsWith('/admin/items') || pathname.startsWith('/admin/billing')
      ? 'item_tabs'
      : pathname.startsWith('/admin/reservation') || pathname.startsWith('/admin/schedule')
        ? 'booking'
        : null;

  if (requiredModule && !capabilities.modules[requiredModule]) {
    return (
      <div className="max-w-[680px] py-12">
        <p className="text-[0.68rem] font-semibold tracking-[0.12em] uppercase text-gray-400 mb-2">Module unavailable</p>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">This tool is not in your current tier.</h1>
        <p className="text-sm text-gray-500">Ask your account owner or superadmin to upgrade this court&apos;s subscription.</p>
      </div>
    );
  }

  return <>{children}</>;
}