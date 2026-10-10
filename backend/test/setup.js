import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

process.env.PUBLIC_COSTLY_RATE_LIMIT_WINDOW_MS = '60000';
process.env.PUBLIC_COSTLY_RATE_LIMIT_MAX = '100000';

let mongoServer;

beforeAll(async () => {
  process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
  mongoServer = await MongoMemoryReplSet.create({
    replSet: { count: 1 }, // single-node replica set, minimum needed for transactions
  });
  await mongoose.connect(mongoServer.getUri());
}, 30000); // replica set election takes longer to spin up than a standalone instance, default 5s timeout may not be enough

beforeEach(async () => {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});