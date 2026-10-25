import Redis from 'ioredis';
import CONSTANTS from './constant';

/**
 * Redis holds two things: cached platform search results and minted platform sessions. Both are
 * disposable — losing them costs latency and a browser launch, never correctness.
 *
 * Host and port come from the environment because the previous version hardcoded `localhost:6379`,
 * which meant the Docker Compose stack could never reach a Redis service by name.
 */
const redis = new Redis({
  host: CONSTANTS.REDIS_HOST,
  port: CONSTANTS.REDIS_PORT,
  // Fail a command rather than queue it forever when Redis is down; the caller treats a cache miss
  // as normal and goes to the platform, so the app degrades instead of hanging.
  maxRetriesPerRequest: 2,
  enableOfflineQueue: false,
  lazyConnect: false,
});

redis.on('connect', () => {
  console.log(`Redis connected at ${CONSTANTS.REDIS_HOST}:${CONSTANTS.REDIS_PORT}`);
});

redis.on('error', (error: Error) => {
  // Logged and swallowed on purpose: every caller already treats Redis failure as a cache miss.
  console.error('Redis error:', error.message);
});

export default redis;
