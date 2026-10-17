/**
 * Fixed-window, in-memory rate limiter for API routes.
 *
 * This protects a single server instance from bursts. Durable, cross-instance
 * limits (daily research quota, concurrent jobs) are enforced against the
 * database in research/quota.ts. For multi-instance deployments, replace this
 * with a shared store (e.g. Redis) behind the same interface.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  check(key: string): RateLimitResult {
    const now = this.now();
    if (this.hits.size > 10_000) this.sweep(now);
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, remaining: this.limit - 1, retryAfterSeconds: 0 };
    }
    if (entry.count >= this.limit) {
      return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) };
    }
    entry.count += 1;
    return { allowed: true, remaining: this.limit - entry.count, retryAfterSeconds: 0 };
  }

  private sweep(now: number) {
    for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key);
  }
}

// Shared limiters per route family.
export const researchStartLimiter = new RateLimiter(5, 60_000);
export const aiActionLimiter = new RateLimiter(10, 60_000);
export const mutationLimiter = new RateLimiter(60, 60_000);
export const authLimiter = new RateLimiter(10, 60_000);
