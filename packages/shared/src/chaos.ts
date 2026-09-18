/**
 * Enterprise Phase 18 — SMS circuit breaker + chaos helpers.
 */

export interface SmsProviderHealth {
  name: string;
  failures: number;
  openUntil: number;
}

export class SmsCircuitBreaker {
  private providers: Array<{ name: string; send: (to: string, text: string) => Promise<void> }> = [];
  private health = new Map();
  private readonly threshold;
  private readonly cooldownMs;

  constructor(opts?: { threshold?: number; cooldownMs?: number }) {
    this.threshold = opts?.threshold ?? 3;
    this.cooldownMs = opts?.cooldownMs ?? 2000;
  }

  register(name: string, send: (to: string, text: string) => Promise<void>): void {
    this.providers.push({ name, send });
    if (!this.health.has(name)) {
      this.health.set(name, { name, failures: 0, openUntil: 0 });
    }
  }

  private isOpen(name: string, now = Date.now()): boolean {
    const h = this.health.get(name);
    return h && h.openUntil > now;
  }

  async sendOtp(to: string, text: string): Promise<{ provider: string; switched: boolean }> {
    const now = Date.now();
    let switched = false;
    let lastErr = null;
    for (let i = 0; i < this.providers.length; i++) {
      const p = this.providers[i];
      if (this.isOpen(p.name, now)) {
        switched = true;
        continue;
      }
      // Using a non-first provider means we switched away from primary
      if (i > 0) switched = true;
      try {
        await p.send(to, text);
        const h = this.health.get(p.name);
        h.failures = 0;
        h.openUntil = 0;
        return { provider: p.name, switched };
      } catch (e) {
        lastErr = e;
        const h = this.health.get(p.name);
        h.failures += 1;
        if (h.failures >= this.threshold) {
          h.openUntil = now + this.cooldownMs;
        }
        switched = true;
      }
    }
    throw lastErr || new Error('ALL_SMS_PROVIDERS_DOWN');
  }

  snapshot(): SmsProviderHealth[] {
    return Array.from(this.health.values());
  }
}

/** Simple Redis outage circuit breaker for geo/cache reads */
export class CacheCircuitBreaker {
  private failures = 0;
  private openUntil = 0;
  constructor(private threshold = 5, private cooldownMs = 3000) {}

  async execute<T>(redisFn: () => Promise<T>, fallbackFn: () => Promise<T> | T): Promise<T> {
    if (Date.now() < this.openUntil) {
      return await fallbackFn();
    }
    try {
      const out = await redisFn();
      this.failures = 0;
      return out;
    } catch {
      this.failures += 1;
      if (this.failures >= this.threshold) {
        this.openUntil = Date.now() + this.cooldownMs;
      }
      return await fallbackFn();
    }
  }

  get isOpen(): boolean {
    return Date.now() < this.openUntil;
  }
}

export interface LoadTestReport {
  rps: number;
  p50: number;
  p95: number;
  p99: number;
  errors: number;
  samples: number;
}

export function summarizeLatencies(samples: number[], errors = 0, durationMs = 1000): LoadTestReport {
  const sorted = samples.slice().sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] || 0;
  return {
    rps: Math.round((samples.length / durationMs) * 1000),
    p50: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    errors,
    samples: samples.length,
  };
}

export const PRODUCTION_CHAOS_PHASE = 18;
