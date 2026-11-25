import express from 'express';
import TierPricing from '../models/TierPricing.js';
import { TIER_DETAILS, TIER_ORDER } from '../lib/moduleEntitlements.js';

const router = express.Router();

router.get('/tiers', async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const pricing = await TierPricing.find({ active: true }).select('tier price').lean();
    pricing.sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));
    res.json({
      tiers: pricing.map(({ tier, price }) => ({
        tier,
        label: TIER_DETAILS[tier].label,
        price,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
