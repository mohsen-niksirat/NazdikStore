import { RedisService } from '../src/redis/redis.service';

describe('RedisService sliding-window rate limit', () => {
  let redis: RedisService;

  beforeEach(() => {
    process.env.REDIS_URL = '';
    redis = new RedisService();
    redis.clearMemory();
  });

  afterEach(async () => {
    await redis.onModuleDestroy();
  });

  it('allows requests under the limit', async () => {
    const opts = { key: 'test:a', limit: 3, windowSeconds: 60 };
    const r1 = await redis.slidingWindowRateLimit(opts);
    expect(r1.allowed).toBe(true);
    expect(r1.count).toBe(1);
    expect(r1.remaining).toBe(2);
  });

  it('blocks the 4th request when limit is 3', async () => {
    const opts = { key: 'test:b', limit: 3, windowSeconds: 60 };
    await redis.slidingWindowRateLimit(opts);
    await redis.slidingWindowRateLimit(opts);
    await redis.slidingWindowRateLimit(opts);
    const fourth = await redis.slidingWindowRateLimit(opts);
    expect(fourth.allowed).toBe(false);
    expect(fourth.count).toBe(3);
    expect(fourth.remaining).toBe(0);
    expect(fourth.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('uses separate buckets per key', async () => {
    const opts = { limit: 2, windowSeconds: 60 };
    await redis.slidingWindowRateLimit({ ...opts, key: 'phone:0912' });
    await redis.slidingWindowRateLimit({ ...opts, key: 'phone:0912' });
    const other = await redis.slidingWindowRateLimit({ ...opts, key: 'phone:0935' });
    expect(other.allowed).toBe(true);
  });

  it('TTL / set / get / del roundtrip', async () => {
    await redis.set('k', 'v', 30);
    expect(await redis.get('k')).toBe('v');
    expect(await redis.ttl('k')).toBeGreaterThan(0);
    await redis.del('k');
    expect(await redis.get('k')).toBeNull();
  });

  it('incr works in memory mode', async () => {
    expect(await redis.incr('counter')).toBe(1);
    expect(await redis.incr('counter')).toBe(2);
  });
});
