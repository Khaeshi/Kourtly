'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { getOfflineCapabilities, storeOfflineCapabilities } from '@/lib/offlineCache';

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

function isCapabilities(value: unknown): value is Capabilities {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as Record<string, unknown>;
  const modules = data.modules;
  const tiers: TierKey[] = ['basic', 'standard', 'premium', 'elite'];
  if (typeof modules !== 'object' || modules === null) return false;
  const moduleFlags = modules as Record<string, unknown>;
  return tiers.includes(data.tier as TierKey) &&
    tiers.includes(data.currentTier as TierKey) &&
    typeof moduleFlags.booking === 'boolean' &&
    typeof moduleFlags.queue === 'boolean' &&
    typeof moduleFlags.item_tabs === 'boolean';
}

export function CapabilitiesProvider({ children }: { children: React.ReactNode }) {
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const { data: session } = useSession();
  const identity = session?.user?.dbId && session.user.courtId
    ? `${session.user.dbId}:${session.user.courtId}`
    : null;

  useEffect(() => {
    let cancelled = false;
    setCapabilities(null);

    const loadCapabilities = async () => {
      let shouldUseOfflineCapabilities = false;
      try {
        const response = await fetch('/api/proxy/court/me/capabilities');
        if (response.status === 401) return;
        if (response.status === 502) {
          shouldUseOfflineCapabilities = true;
        } else if (response.ok) {
          const data: unknown = await response.json();
          if (!isCapabilities(data)) return;
          if (!cancelled) setCapabilities(data);
          if (identity) {
            const offlineCapabilities: Capabilities = {
              tier: data.tier,
              currentTier: data.currentTier,
              modules: {
                booking: data.modules.booking,
                queue: data.modules.queue,
                item_tabs: data.modules.item_tabs,
              },
            };
            await storeOfflineCapabilities(identity, offlineCapabilities).catch(error => {
              console.error('Could not store offline admin capabilities.', error);
            });
          }
          return;
        } else {
          return;
        }
      } catch {
        shouldUseOfflineCapabilities = true;
      }

      if (shouldUseOfflineCapabilities && identity) {
        try {
          const saved = await getOfflineCapabilities<Capabilities>(identity);
          if (!cancelled && saved && isCapabilities(saved)) setCapabilities(saved);
        } catch (error) {
          console.error('Could not load offline admin capabilities.', error);
        }
      }
    };

    void loadCapabilities();
    return () => {
      cancelled = true;
    };
  }, [identity]);

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