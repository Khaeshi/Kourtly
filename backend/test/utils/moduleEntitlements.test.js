import { hasModule, resolveCapabilities } from '../../src/lib/moduleEntitlements.js';

describe('module entitlements', () => {
  test('defaults an unset tier to Booking', () => {
    const capabilities = resolveCapabilities({ subscription: {} });

    expect(capabilities).toEqual({
      tier: 'basic',
      currentTier: 'basic',
      modules: { booking: true, queue: false, item_tabs: false },
      pendingTier: null,
      pendingTierEffectiveAt: null,
    });
  });

  test('expands higher tiers and applies non-expired overrides', () => {
    const court = {
      subscription: {
        tier: 'standard',
        modules: [
          { key: 'item_tabs', enabled: true },
          { key: 'queue', enabled: false, expiresAt: new Date(Date.now() + 60_000) },
        ],
      },
    };

    expect(hasModule(court, 'booking')).toBe(true);
    expect(hasModule(court, 'queue')).toBe(false);
    expect(hasModule(court, 'item_tabs')).toBe(true);
  });

  test('ignores expired overrides', () => {
    const court = {
      subscription: {
        tier: 'basic',
        modules: [{ key: 'queue', enabled: true, expiresAt: new Date(Date.now() - 60_000) }],
      },
    };

    expect(hasModule(court, 'queue')).toBe(false);
  });

  test('keeps the current tier active until a scheduled downgrade is effective', () => {
    const court = {
      subscription: {
        tier: 'premium',
        pendingTier: 'standard',
        pendingTierEffectiveAt: new Date(Date.now() + 60_000),
      },
    };

    const capabilities = resolveCapabilities(court);
    expect(capabilities.tier).toBe('premium');
    expect(capabilities.pendingTier).toBe('standard');
    expect(capabilities.modules.item_tabs).toBe(true);
  });
});