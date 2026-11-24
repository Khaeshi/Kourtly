'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminHeader } from '@/app/components/ui/AdminHeader';
import { Button } from '@/app/components/ui/Button';

type Tier = 'basic' | 'standard' | 'premium' | 'elite';

interface TierPricing {
  tier: Tier;
  price: number;
  active: boolean;
  updatedAt?: string;
  history: { price: number; changedBy?: string | null; changedAt: string }[];
}

const TIERS: { tier: Tier; label: string }[] = [
  { tier: 'basic', label: 'Basic' },
  { tier: 'standard', label: 'Standard' },
  { tier: 'premium', label: 'Premium' },
  { tier: 'elite', label: 'Elite' },
];

export default function TierPricingPage() {
  const [pricing, setPricing] = useState<Partial<Record<Tier, TierPricing>>>({});
  const [prices, setPrices] = useState<Partial<Record<Tier, string>>>({});
  const [active, setActive] = useState<Partial<Record<Tier, boolean>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Tier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/proxy/superadmin/tier-pricing');
      const data: unknown = await response.json();
      if (!response.ok || !Array.isArray(data)) {
        throw new Error('Failed to load tier prices.');
      }
      const entries = data as TierPricing[];
      const byTier = Object.fromEntries(entries.map(entry => [entry.tier, entry])) as Partial<Record<Tier, TierPricing>>;
      setPricing(byTier);
      setPrices(Object.fromEntries(entries.map(entry => [entry.tier, String(entry.price)])));
      setActive(Object.fromEntries(entries.map(entry => [entry.tier, entry.active])));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load tier prices.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async (tier: Tier) => {
    const rawPrice = prices[tier] ?? '';
    const price = Number(rawPrice);
    if (!rawPrice.trim() || !Number.isInteger(price) || price < 1 || price > 10000) {
      setNotice('Price must be a positive whole number no greater than 10000.');
      return;
    }

    setSaving(tier);
    setNotice(null);
    try {
      const response = await fetch(`/api/proxy/superadmin/tier-pricing/${tier}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price, active: active[tier] ?? true }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to save tier price.');
      setNotice(`${TIERS.find(item => item.tier === tier)?.label} price saved.`);
      await load();
    } catch (saveError) {
      setNotice(saveError instanceof Error ? saveError.message : 'Failed to save tier price.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="max-w-[900px]">
      <AdminHeader
        eyebrow="Platform"
        title="Tier pricing"
        right={<Button v="ghost" onClick={() => void load()}>Refresh</Button>}
      />

      <p className="ad-muted text-sm mb-5">
        Prices are in PHP per month. Changes apply to invoices created after the update.
      </p>

      {error && <p role="alert" className="mb-4 text-sm text-[#B8431F]">{error}</p>}
      {notice && <p role="status" className="mb-4 text-sm">{notice}</p>}

      {loading ? (
        <p className="py-12 text-center ad-muted text-sm">Loading tier prices...</p>
      ) : (
        <div className="border-t-2 border-[#0E2420]">
          {TIERS.map(({ tier, label }) => {
            const entry = pricing[tier];
            return (
              <section key={tier} className="grid gap-4 border-b border-[#C9C3B3] py-5 sm:grid-cols-[1fr_180px_140px_auto] sm:items-end">
                <div>
                  <h2 className="font-bold">{label}</h2>
                  <p className="ad-muted text-xs">
                    {entry?.history.length ? `${entry.history.length} price history entr${entry.history.length === 1 ? 'y' : 'ies'}` : 'No price history'}
                  </p>
                </div>
                <label className="ad-label">
                  Monthly price (PHP)
                  <input
                    className="ad-input mt-1"
                    type="number"
                    min="1"
                    max="10000"
                    step="1"
                    value={prices[tier] ?? ''}
                    onChange={event => setPrices(current => ({ ...current, [tier]: event.target.value }))}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={active[tier] ?? true}
                    onChange={event => setActive(current => ({ ...current, [tier]: event.target.checked }))}
                  />
                  Available
                </label>
                <Button v="primary" loading={saving === tier} disabled={loading || saving !== null} onClick={() => void save(tier)}>
                  Save
                </Button>
                {entry?.history.length ? (
                  <div className="sm:col-span-4">
                    <p className="ad-eyebrow mb-2">Recent price changes</p>
                    <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-1 p-0 text-xs ad-muted">
                      {[...entry.history].reverse().map((change, index) => (
                        <li key={`${change.changedAt}-${index}`}>
                          ₱{change.price.toLocaleString()} · {new Date(change.changedAt).toLocaleString()}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
