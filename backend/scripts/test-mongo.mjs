import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is not set');
  process.exit(1);
}

console.log('Testing connection...');
console.log('URI scheme:', uri.split('://')[0]);
console.log('URI host part:', uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@').split('?')[0]);

try {
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 20000,
    connectTimeoutMS: 20000,
  });
  const count = await mongoose.connection.db.collection('courts').countDocuments();
  console.log('SUCCESS: connected');
  console.log('Database:', mongoose.connection.name);
  console.log('Courts count:', count);
  await mongoose.disconnect();
  process.exit(0);
} catch (err) {
  console.error('FAILED:', err.name, '-', err.message);
  if (err.reason?.servers) {
    for (const [addr, desc] of err.reason.servers) {
      console.error(`  ${addr}: type=${desc.type}, error=${desc.error?.message || desc.lastErrorMessage || 'none'}`);
    }
  }
  process.exit(1);
}
