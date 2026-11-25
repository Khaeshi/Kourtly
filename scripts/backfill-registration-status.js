import { MongoClient } from 'mongodb';

const dryRun = process.argv.includes('--dry-run');
const apply = process.argv.includes('--apply');
if (!dryRun && !apply) {
  throw new Error('Pass --dry-run to preview or --apply after reviewing the preview.');
}
if (dryRun && apply) {
  throw new Error('Choose exactly one of --dry-run or --apply.');
}

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI is required.');

const client = new MongoClient(uri);
await client.connect();
try {
  const courts = client.db().collection('courts');
  const filter = {
    registrationStatus: { $exists: false },
    'subscription.status': { $in: ['trial', 'active', 'expired', 'suspended'] },
  };
  if (dryRun) {
    console.log('Would approve:', await courts.countDocuments(filter), 'legacy courts.');
  } else {
    const result = await courts.updateMany(filter, { $set: { registrationStatus: 'approved' } });
    console.log('Approved legacy courts:', result.modifiedCount);
  }
  const unresolved = await courts.find({ registrationStatus: { $exists: false } })
    .project({ _id: 1, name: 1, 'subscription.status': 1 })
    .toArray();
  console.log('Courts still missing registrationStatus (manual review):', unresolved);
} finally {
  await client.close();
}
