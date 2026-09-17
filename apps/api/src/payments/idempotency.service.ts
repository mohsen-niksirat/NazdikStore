import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

export interface IdempotencyRecord<T = unknown> {
  key: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  response?: T;
  createdAt: number;
}

/**
 * Idempotency-Key layer for financial transactions.
 * First request with a key wins; replays return the stored response.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly redis: RedisService) {}

  private key(k: string): string {
    return `idem:${k}`;
  }

  async begin<T>(key: string): Promise<{ proceed: true } | { proceed: false; record: IdempotencyRecord<T> }> {
    if (!key) return { proceed: true };
    const raw = await this.redis.get(this.key(key));
    if (raw) {
      const record = JSON.parse(raw) as IdempotencyRecord<T>;
      return { proceed: false, record };
    }
    const record: IdempotencyRecord<never> = {
      key,
      status: 'IN_PROGRESS',
      createdAt: Date.now(),
    };
    await this.redis.set(this.key(key), JSON.stringify(record), 3600);
    return { proceed: true };
  }

  async complete<T>(key: string, response: T): Promise<void> {
    if (!key) return;
    const record: IdempotencyRecord<T> = {
      key,
      status: 'COMPLETED',
      response,
      createdAt: Date.now(),
    };
    await this.redis.set(this.key(key), JSON.stringify(record), 3600);
  }

  async fail(key: string): Promise<void> {
    if (!key) return;
    await this.redis.del(this.key(key));
  }

  async get<T>(key: string): Promise<IdempotencyRecord<T> | null> {
    if (!key) return null;
    const raw = await this.redis.get(this.key(key));
    return raw ? (JSON.parse(raw) as IdempotencyRecord<T>) : null;
  }

  clearMemory(): void {
    this.redis.clearMemory?.();
  }
}
