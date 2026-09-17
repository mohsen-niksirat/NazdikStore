import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Redis facade with an in-memory fallback for local/dev/test
 * when REDIS_URL is unset or Redis is unreachable.
 * Production must set REDIS_URL to a real Redis instance.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private memory = new Map<string, { value: string; expiresAt: number | null }>();
  private usingMemory = false;

  constructor() {
    const url = process.env.REDIS_URL;
    // Treat empty / placeholder URLs as offline
    if (!url || url === '""' || url === "''" || url.includes('REDIS_URL')) {
      this.usingMemory = true;
      this.logger.warn('REDIS_URL not set — using in-memory store (dev/test only)');
      return;
    }
    // In non-production, missing Redis is non-fatal
    const offlineOk = process.env.ALLOW_OFFLINE === '1' || process.env.NODE_ENV !== 'production';
    try {
      this.client = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: offlineOk ? 0 : 1,
        enableOfflineQueue: false,
        retryStrategy: (times) => {
          if (times > 3) return null; // stop retrying
          return Math.min(times * 200, 1000);
        },
      });
      this.client.on('error', (err) => {
        if (!this.usingMemory && offlineOk) {
          this.usingMemory = true;
          this.logger.warn(`Redis unavailable (${err.message}) — falling back to memory store`);
          this.client?.disconnect();
        }
      });
      void this.client.connect().catch((err: Error) => {
        if (offlineOk) {
          this.usingMemory = true;
          this.logger.warn(`Redis connect failed (${err.message}) — using memory store`);
        } else {
          this.logger.error(`Redis connect failed: ${err.message}`);
        }
      });
    } catch (err) {
      this.usingMemory = true;
      this.logger.warn(`Redis init failed, falling back to memory: ${(err as Error).message}`);
    }
  }

  get isMemoryMode(): boolean {
    return this.usingMemory || !this.client;
  }

  async get(key: string): Promise<string | null> {
    if (this.isMemoryMode) return this.memoryGet(key);
    try {
      return await this.client!.get(key);
    } catch {
      return this.memoryGet(key);
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.isMemoryMode) {
      this.memorySet(key, value, ttlSeconds);
      return;
    }
    try {
      if (ttlSeconds) await this.client!.set(key, value, 'EX', ttlSeconds);
      else await this.client!.set(key, value);
    } catch {
      this.memorySet(key, value, ttlSeconds);
    }
  }

  async del(key: string): Promise<void> {
    if (this.isMemoryMode) {
      this.memory.delete(key);
      return;
    }
    try {
      await this.client!.del(key);
    } catch {
      this.memory.delete(key);
    }
  }

  async incr(key: string): Promise<number> {
    if (this.isMemoryMode) {
      const current = Number(this.memoryGet(key) ?? '0') + 1;
      const entry = this.memory.get(key);
      this.memory.set(key, {
        value: String(current),
        expiresAt: entry?.expiresAt ?? null,
      });
      return current;
    }
    try {
      return await this.client!.incr(key);
    } catch {
      const current = Number(this.memoryGet(key) ?? '0') + 1;
      this.memorySet(key, String(current));
      return current;
    }
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    if (this.isMemoryMode) {
      const entry = this.memory.get(key);
      if (entry) {
        this.memory.set(key, {
          value: entry.value,
          expiresAt: Date.now() + ttlSeconds * 1000,
        });
      }
      return;
    }
    try {
      await this.client!.expire(key, ttlSeconds);
    } catch {
      /* ignore */
    }
  }

  async ttl(key: string): Promise<number> {
    if (this.isMemoryMode) {
      const entry = this.memory.get(key);
      if (!entry) return -2;
      if (entry.expiresAt === null) return -1;
      const remaining = Math.ceil((entry.expiresAt - Date.now()) / 1000);
      return remaining > 0 ? remaining : -2;
    }
    try {
      return await this.client!.ttl(key);
    } catch {
      return -2;
    }
  }

  /**
   * Sliding-window rate limit.
   * Returns { allowed, remaining, retryAfterSeconds, count }
   */
  async slidingWindowRateLimit(opts: {
    key: string;
    limit: number;
    windowSeconds: number;
  }): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number; count: number }> {
    const bucketKey = `rl:${opts.key}`;
    const now = Date.now();
    const windowStart = now - opts.windowSeconds * 1000;

    // We store timestamps as a Redis list via zset-like memory simulation
    // For production Redis use a ZSET; memory mode uses a simple list key
    const raw = await this.get(bucketKey);
    let stamps: number[] = [];
    if (raw) {
      try {
        stamps = JSON.parse(raw) as number[];
      } catch {
        stamps = [];
      }
    }
    stamps = stamps.filter((t) => t > windowStart);

    if (stamps.length >= opts.limit) {
      const oldest = Math.min(...stamps);
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + opts.windowSeconds * 1000 - now) / 1000));
      await this.set(bucketKey, JSON.stringify(stamps), opts.windowSeconds);
      return { allowed: false, remaining: 0, retryAfterSeconds, count: stamps.length };
    }

    stamps.push(now);
    await this.set(bucketKey, JSON.stringify(stamps), opts.windowSeconds);
    return {
      allowed: true,
      remaining: opts.limit - stamps.length,
      retryAfterSeconds: 0,
      count: stamps.length,
    };
  }

  private memoryGet(key: string): string | null {
    const entry = this.memory.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return entry.value;
  }

  private memorySet(key: string, value: string, ttlSeconds?: number): void {
    this.memory.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  async onModuleDestroy() {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        this.client.disconnect();
      }
    }
  }

  /** Test helper */
  clearMemory(): void {
    this.memory.clear();
  }
}
