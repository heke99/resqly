export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

interface Bucket {
  count: number;
  windowStart: number;
}

/**
 * Simple fixed-window in-memory rate limiter. In production this is backed by a
 * shared store (Postgres/Redis); the interface stays identical. Used per tenant
 * + route to protect sensitive Google Maps / BankID calls.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  check(key: string): RateLimitResult {
    const current = this.now();
    const bucket = this.buckets.get(key);
    if (!bucket || current - bucket.windowStart >= this.windowMs) {
      this.buckets.set(key, { count: 1, windowStart: current });
      return { allowed: true, remaining: this.limit - 1, resetAt: current + this.windowMs };
    }
    if (bucket.count >= this.limit) {
      return { allowed: false, remaining: 0, resetAt: bucket.windowStart + this.windowMs };
    }
    bucket.count += 1;
    return {
      allowed: true,
      remaining: this.limit - bucket.count,
      resetAt: bucket.windowStart + this.windowMs,
    };
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }
}
