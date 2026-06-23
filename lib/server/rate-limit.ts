import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { getServerEnv } from "@/lib/server/env";
import { requestIpHash } from "@/lib/server/request";

/**
 * Distributed rate limiting backed by Upstash Redis (Vercel-native).
 *
 * Fail-open by design: if Upstash is not configured, or the call errors, we
 * allow the request and log a warning. Abuse protection should never take the
 * whole app down — but absence of config is surfaced loudly in logs so it is
 * not silently relied upon in production.
 */

export interface RateLimitWindow {
  /** Max requests permitted within the window. */
  limit: number;
  /** Window duration, e.g. "60 s", "1 m", "1 h". */
  window: `${number} ${"ms" | "s" | "m" | "h" | "d"}`;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

let redis: Redis | null | undefined;
const limiters = new Map<string, Ratelimit>();
let warnedMissing = false;

function getRedis(): Redis | null {
  if (redis !== undefined) {
    return redis;
  }
  const { upstash } = getServerEnv();
  redis = upstash ? new Redis({ url: upstash.url, token: upstash.token }) : null;
  return redis;
}

function getLimiter(namespace: string, window: RateLimitWindow): Ratelimit | null {
  const client = getRedis();
  if (!client) {
    return null;
  }
  const cacheKey = `${namespace}:${window.limit}:${window.window}`;
  let limiter = limiters.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: client,
      limiter: Ratelimit.slidingWindow(window.limit, window.window),
      prefix: `footyrush:rl:${namespace}`,
      analytics: false
    });
    limiters.set(cacheKey, limiter);
  }
  return limiter;
}

/**
 * Apply a rate limit for `namespace`, keyed by the hashed client IP (or an
 * explicit identifier). Returns success=true and full headroom when Upstash is
 * unconfigured or unreachable (fail-open).
 */
export async function rateLimit(
  request: Request,
  namespace: string,
  window: RateLimitWindow,
  identifier?: string
): Promise<RateLimitResult> {
  const limiter = getLimiter(namespace, window);
  if (!limiter) {
    if (!warnedMissing && getServerEnv().isProduction) {
      warnedMissing = true;
      console.warn("[rate-limit] Upstash Redis is not configured; rate limiting is disabled (fail-open).");
    }
    return { success: true, limit: window.limit, remaining: window.limit, reset: 0 };
  }

  const key = identifier ?? requestIpHash(request);
  try {
    const result = await limiter.limit(key);
    return { success: result.success, limit: result.limit, remaining: result.remaining, reset: result.reset };
  } catch (error) {
    console.warn("[rate-limit] limiter error; failing open:", error);
    return { success: true, limit: window.limit, remaining: window.limit, reset: 0 };
  }
}

/** Standard 429 response with rate-limit headers. */
export function tooManyRequests(result: RateLimitResult): Response {
  const retryAfter = result.reset ? Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)) : 60;
  return new Response(JSON.stringify({ error: "Too many requests. Please slow down." }), {
    status: 429,
    headers: {
      "content-type": "application/json",
      "retry-after": String(retryAfter),
      "x-ratelimit-limit": String(result.limit),
      "x-ratelimit-remaining": String(result.remaining)
    }
  });
}
