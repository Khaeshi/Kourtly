import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_CONFIGURED = Boolean(process.env.REDIS_URL);

if (!REDIS_CONFIGURED) {
  console.warn(
    '[redis] REDIS_URL is not set, falling back to redis://localhost:6379. ' +
    'This is expected in local dev before Docker Redis is running or REDIS_URL is set. ' +
    'This MUST be set in Railway before deploying, caching and realtime fan-out silently degrade without it.'
  );
}

function createClient(name) {
  const client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    retryStrategy(times) {
      return Math.min(times * 200, 5000);
    },
    lazyConnect: false,
  });

  let hasLoggedError = false;

  client.on('connect', () => {
    hasLoggedError = false;
    console.log(`[redis:${name}] connected`);
  });

  client.on('error', (err) => {
    if (!hasLoggedError) {
      console.error(`[redis:${name}] error (further errors suppressed until reconnect):`, err.message);
      hasLoggedError = true;
    }
  });

  return client;
}

export const redis = createClient('main');

export function duplicateForPubSub(name) {
  const client = redis.duplicate();
  client.on('connect', () => console.log(`[redis:${name}] connected`));
  client.on('error', (err) => console.error(`[redis:${name}] error:`, err.message));
  return client;
}