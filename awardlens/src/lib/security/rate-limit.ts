import "server-only";

/**
 * In-process fixed-window rate limiting.
 *
 * Sized for the expensive endpoints — upload, extraction and Ask — where the
 * cost of abuse is real model spend rather than CPU. It is per-instance, so a
 * multi-instance deployment gets a proportionally higher effective ceiling;
 * that is an accepted limit of not adding a Redis dependency for the MVP and is
 * documented as such. It is a cost guard, not a security boundary: authorisation
 * is enforced separately on every request.
 */

interface Window {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Window>();

export interface RateLimitPolicy {
  limit: number;
  windowMs: number;
}

export const RATE_LIMITS = {
  upload: { limit: 12, windowMs: 60 * 60 * 1000 },
  extraction: { limit: 20, windowMs: 60 * 60 * 1000 },
  ask: { limit: 40, windowMs: 60 * 60 * 1000 },
  signIn: { limit: 8, windowMs: 15 * 60 * 1000 },
  /**
   * Per-email issuance cap, independent of the IP-derived key.
   *
   * Re-issuing a code resets the five-attempt lock on that address, so an
   * IP-only limit lets an attacker cycle "request code, burn five guesses"
   * indefinitely against a 10^6 code space — and mail-bomb the victim while
   * doing it. This ceiling is what makes the attempt lock meaningful.
   */
  signInEmail: { limit: 3, windowMs: 15 * 60 * 1000 },
  signInEmailDaily: { limit: 10, windowMs: 24 * 60 * 60 * 1000 },
  export: { limit: 60, windowMs: 60 * 60 * 1000 },
} as const satisfies Record<string, RateLimitPolicy>;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function checkRateLimit(
  key: string,
  policy: RateLimitPolicy,
  now = Date.now(),
): RateLimitResult {
  // Opportunistic sweep so the map cannot grow without bound.
  if (buckets.size > 5000) {
    for (const [bucketKey, window] of buckets) {
      if (window.resetAt <= now) buckets.delete(bucketKey);
    }
  }

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + policy.windowMs });
    return { allowed: true, remaining: policy.limit - 1, retryAfterSeconds: 0 };
  }

  if (existing.count >= policy.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: policy.limit - existing.count,
    retryAfterSeconds: 0,
  };
}

/** Test helper. */
export function __resetRateLimits(): void {
  buckets.clear();
}
