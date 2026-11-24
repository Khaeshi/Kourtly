'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import CountUp from './CountUp';
import type { PlanId } from '@/lib/plans';

interface TierPrice {
  tier: PlanId;
  label: string;
  price: number;
}

type PricingState =
  | { status: 'loading'; prices: Partial<Record<PlanId, TierPrice>> }
  | { status: 'ready'; prices: Partial<Record<PlanId, TierPrice>> }
  | { status: 'unavailable'; prices: Partial<Record<PlanId, TierPrice>> };

const initialPricingState: PricingState = { status: 'loading', prices: {} };
const PublicPricingContext = createContext<PricingState>(initialPricingState);

function isTierPrice(value: unknown): value is TierPrice {
  if (!value || typeof value !== 'object') return false;
  const tierPrice = value as Record<string, unknown>;
  return (
    ['basic', 'standard', 'premium', 'elite'].includes(String(tierPrice.tier))
    && typeof tierPrice.label === 'string'
    && typeof tierPrice.price === 'number'
    && Number.isInteger(tierPrice.price)
    && tierPrice.price > 0
  );
}

export function PublicPricingProvider({ children }: { children: React.ReactNode }) {
  const [pricing, setPricing] = useState<PricingState>(initialPricingState);

  useEffect(() => {
    let active = true;
    fetch('/api/pricing/tiers', { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('Pricing request failed.');
        const data: unknown = await response.json();
        if (
          !data
          || typeof data !== 'object'
          || !Array.isArray((data as { tiers?: unknown }).tiers)
          || !(data as { tiers: unknown[] }).tiers.every(isTierPrice)
        ) {
          throw new Error('Pricing response is invalid.');
        }
        const prices = Object.fromEntries(
          (data as { tiers: TierPrice[] }).tiers.map(item => [item.tier, item]),
        ) as Partial<Record<PlanId, TierPrice>>;
        if (active) setPricing({ status: 'ready', prices });
      })
      .catch(() => {
        if (active) setPricing({ status: 'unavailable', prices: {} });
      });

    return () => {
      active = false;
    };
  }, []);

  return <PublicPricingContext.Provider value={pricing}>{children}</PublicPricingContext.Provider>;
}

export function TierPrice({
  tier,
  suffix,
  className,
}: {
  tier: PlanId;
  suffix?: string;
  className?: string;
}) {
  const pricing = useContext(PublicPricingContext);

  if (pricing.status === 'loading') {
    return (
      <span className="inline-flex items-center gap-2" aria-label="Loading pricing" role="status">
        <span className="inline-block h-8 w-24 animate-pulse rounded bg-current/10" />
      </span>
    );
  }
  if (pricing.status === 'unavailable' || !pricing.prices[tier]) {
    return <span role="status">Pricing unavailable, contact us</span>;
  }

  return (
    <>
      <CountUp value={pricing.prices[tier].price} className={className} />
      {suffix && <span className="font-sans normal-case text-[0.75rem] text-[var(--line-dim)] ml-1.5">{suffix}</span>}
    </>
  );
}
