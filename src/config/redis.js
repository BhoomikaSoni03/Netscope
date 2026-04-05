const Redis = require('ioredis');

let redisClient;

const connectRedis = () => {
  redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    retryStrategy: (times) => {
      if (times > 5) {
        console.warn('⚠️  Redis not available. Caching disabled.');
        return null;
      }
      return Math.min(times * 200, 2000);
    },
    lazyConnect: true,
  });

  redisClient.on('connect', () => console.log('✅ Redis Connected'));
  redisClient.on('error', (err) => {
    if (!err.message.includes('ECONNREFUSED')) {
      console.error('❌ Redis Error:', err.message);
    }
  });

  redisClient.connect().catch(() => {
    console.warn('⚠️  Redis unavailable — caching disabled');
  });

  return redisClient;
};

const getRedis = () => redisClient;

module.exports = { connectRedis, getRedis };
