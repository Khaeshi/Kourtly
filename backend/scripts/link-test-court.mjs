import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);
const courts = mongoose.connection.db.collection('courts');

const count = await courts.countDocuments({ slug: 'scbc' });
if (count !== 1) {
  console.log('Expected exactly 1 court with slug scbc, found', count);
} else {
  const result = await courts.updateOne({ slug: 'scbc' }, { $set: {
    'xendit.subAccountId': '6ac8ca39d876e38cc55159d0',
    'xendit.status': 'REGISTERED',
    'xendit.webhookConfigured': true,
    'xendit.callbackTokenHash': '0c650f7029c6ac0c67efa251b2c8a7e787f78f7d9f069856fbdc0e194f803928',
  } });
  console.log('matched', result.matchedCount, 'modified', result.modifiedCount);
}
await mongoose.disconnect();