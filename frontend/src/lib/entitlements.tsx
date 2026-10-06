'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { proxyFetch } from '@/lib/api';

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

interface CapabilityState {
  status: 'unknown' | 'known';
  capabilities: Capabilities | null;
}

const DEFAULT_CAPABILITIES: Capabilities = {
  tier: 'basic',
  currentTier: 'basic',
  modules: { booking: true, queue: false, item_tabs: false },
};

const CapabilitiesContext = createContext<CapabilityState>({
  status: 'unknown',
  capabilities: null,
});

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
  const [state, setState] = useState<CapabilityState>({
    status: 'unknown',
    capabilities: null,
  });

  const loadCapabilities = useCallback(async () => {
    try {
      const data: unknown = await proxyFetch('/court/me/capabilities');
      if (!isCapabilities(data)) {
        setState({ status: 'unknown', capabilities: null });
        return;
      }
      setState({ status: 'known', capabilities: data });
    } catch (error) {
      console.error('Could not load admin capabilities.', error);
      setState(current => current.status === 'known'
        ? current
        : { status: 'unknown', capabilities: null });
    }
  }, []);

  useEffect(() => {
    void loadCapabilities();
    window.addEventListener('online', loadCapabilities);
    return () => window.removeEventListener('online', loadCapabilities);
  }, [loadCapabilities]);

  return <CapabilitiesContext.Provider value={state}>{children}</CapabilitiesContext.Provider>;
}

export function useCapabilityState(): CapabilityState {
  return useContext(CapabilitiesContext);
}

export function useCapabilities(): Capabilities {
  return useCapabilityState().capabilities ?? DEFAULT_CAPABILITIES;
}

export function CapabilityGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { status, capabilities } = useCapabilityState();
  const requiredModule = pathname.startsWith('/admin/queue') || pathname.startsWith('/admin/players')
    ? 'queue'
    : pathname.startsWith('/admin/items') || pathname.startsWith('/admin/billing')
      ? 'item_tabs'
      : pathname.startsWith('/admin/reservation') || pathname.startsWith('/admin/schedule')
        ? 'booking'
        : null;

  if (status === 'unknown' || !capabilities) {
    return (
      <div className="max-w-[680px] py-12">
        <p className="text-sm text-gray-500">Access status is unavailable. Reconnect to verify your current tier.</p>
      </div>
    );
  }

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
