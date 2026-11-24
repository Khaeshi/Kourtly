import Court from '../../src/models/Court.js';
import TierPricing from '../../src/models/TierPricing.js';

describe('subscription pricing models', () => {
  test('Court subscription amount defaults to unset and custom price defaults false', () => {
    const court = new Court({
      name: 'Pricing Model Court',
      slug: 'pricing-model-court',
      adminEmail: 'pricing-model@example.com',
    });

    expect(court.subscription.amount).toBeNull();
    expect(court.subscription.isCustomPrice).toBe(false);
  });

  test('TierPricing accepts positive integer prices through 10000', () => {
    for (const price of [1, 799, 10000]) {
      const pricing = new TierPricing({ tier: 'basic', price });
      expect(pricing.validateSync()).toBeUndefined();
    }
  });

  test.each([0, -1, 10001, 12.5])('TierPricing rejects price %s', price => {
    const pricing = new TierPricing({ tier: 'basic', price });
    expect(pricing.validateSync()).toBeDefined();
  });

  test('TierPricing limits history to the latest 20 entries', () => {
    const pricing = new TierPricing({
      tier: 'basic',
      price: 799,
      history: Array.from({ length: 21 }, (_, index) => ({
        price: 700 + index,
        changedAt: new Date(),
      })),
    });

    expect(pricing.validateSync()).toBeDefined();
  });
});
