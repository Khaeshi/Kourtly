import mongoose from 'mongoose';
import dotenv from 'dotenv';
import TierPricing from '../src/models/TierPricing.js';

dotenv.config();

const tiers = [
  { tier: 'basic', price: 799 },
  { tier: 'standard', price: 1499 },
  { tier: 'premium', price: 2399 },
  { tier: 'elite', price: 3999 },
];

const args = new Set(process.argv.slice(2));
const isDryRun = args.has('--dry-run');
const isApply = args.has('--apply');

if (args.size !== 1 || isDryRun === isApply) {
  console.error('Choose exactly one mode: --dry-run or --apply.');
  process.exitCode = 1;
} else if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is required.');
  process.exitCode = 1;
} else {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    for (const entry of tiers) {
      const existing = await TierPricing.findOne({ tier: entry.tier }).select('_id').lean();
      if (existing) {
        console.log(`exists: ${entry.tier}`);
        continue;
      }

      if (isDryRun) {
        console.log(`would insert: ${entry.tier} at ${entry.price} PHP/month`);
        continue;
      }

      await TierPricing.updateOne(
        { tier: entry.tier },
        {
          $setOnInsert: {
            ...entry,
            active: true,
            updatedAt: new Date(),
            history: [],
          },
        },
        { upsert: true },
      );
      console.log(`inserted if missing: ${entry.tier}`);
    }
  } catch {
    console.error('Tier pricing seed failed.');
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
