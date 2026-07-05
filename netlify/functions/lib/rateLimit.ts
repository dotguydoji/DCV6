/**
 * Best-effort per-IP rate limiting for Netlify Functions.
 *
 * Important limitation: this uses in-memory state, which only persists for
 * the lifetime of one warm function instance - it does NOT coordinate across
 * multiple concurrent instances or survive a cold start. It still meaningfully
 * slows down a single script hammering the endpoint (the common abuse case),
 * at zero cost and no extra external requests, but it is not a hard guarantee.
 * For a stronger guarantee, also enable Netlify's own rate limiting / traffic
 * rules for this site in the Netlify dashboard (Site configuration -> Traffic
 * rules), which enforces limits at the edge, before requests even reach here.
 */

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

// Nothing ever deleted an entry from `buckets` once its window passed - on a
// long-lived warm function instance, distinct IPs would accumulate here
// forever. Every window used across both sites is well under a minute, so a
// bucket untouched for 10x that long is safely expired; sweeping
// occasionally (not on every call, to keep this cheap) bounds memory growth
// without changing any actual rate-limit decision.
const MAX_BUCKET_AGE_MS = 10 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

const cleanupExpiredBuckets = (now: number): void => {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > MAX_BUCKET_AGE_MS) {
      buckets.delete(key);
    }
  }
};

const getClientIp = (headers: Record<string, string | undefined>): string =>
  headers['x-nf-client-connection-ip'] ?? headers['client-ip'] ?? 'unknown';

export interface RateLimitResult {
  limited: boolean;
  retryAfterSeconds: number;
}

/**
 * @param key - identifies which limit bucket to use (usually the function name)
 * @param maxRequests - max requests allowed per windowMs for one IP
 * @param windowMs - window size in milliseconds
 */
export const checkRateLimit = (
  headers: Record<string, string | undefined>,
  key: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult => {
  const ip = getClientIp(headers);
  const bucketKey = `${key}:${ip}`;
  const now = Date.now();

  cleanupExpiredBuckets(now);

  const existing = buckets.get(bucketKey);

  if (!existing || now - existing.windowStart >= windowMs) {
    buckets.set(bucketKey, { count: 1, windowStart: now });
    return { limited: false, retryAfterSeconds: 0 };
  }

  existing.count += 1;

  if (existing.count > maxRequests) {
    const retryAfterSeconds = Math.ceil((existing.windowStart + windowMs - now) / 1000);
    return { limited: true, retryAfterSeconds };
  }

  return { limited: false, retryAfterSeconds: 0 };
};

export const rateLimitedResponse = (retryAfterSeconds: number) => ({
  statusCode: 429,
  headers: {
    'Content-Type': 'application/json',
    'Retry-After': String(retryAfterSeconds)
  },
  body: JSON.stringify({ error: 'Too many requests. Please try again shortly.' })
});
