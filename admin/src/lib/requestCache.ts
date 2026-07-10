/**
 * Short-lived, per-tab cache for the admin panel's own list views (Files,
 * Buyers) - sessionStorage only, so it clears when the tab closes. Purely a
 * perf optimization to avoid redundant R2/Firestore reads on a quick page
 * reload; every actual mutating action (upload, delete, grant, remove)
 * still goes straight to its own function and clears the relevant key here
 * immediately after, so the admin never sees stale data after an action
 * they just took.
 *
 * DISABLED (2026-07-11, owner request) - the owner needs Files/VirusTotal
 * results to always be current, not up to 2 minutes stale. getCachedResponse
 * always returns null and setCachedResponse is a no-op while this is false.
 * Do not flip back to true unless explicitly asked.
 */
const CACHE_ENABLED = false;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const PREFIX = 'admin-request-cache:';

export const getCachedResponse = <T>(key: string): T | null => {
  if (!CACHE_ENABLED) return null;

  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;

    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (entry.expiresAt <= Date.now()) {
      sessionStorage.removeItem(PREFIX + key);
      return null;
    }

    return entry.value;
  } catch {
    return null;
  }
};

export const setCachedResponse = <T>(key: string, value: T, ttlMs: number): void => {
  if (!CACHE_ENABLED) return;

  try {
    const entry: CacheEntry<T> = { value, expiresAt: Date.now() + ttlMs };
    sessionStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    // Ignored on purpose - this is just a perf optimization.
  }
};

export const clearCachedResponse = (key: string): void => {
  try {
    sessionStorage.removeItem(PREFIX + key);
  } catch {
    // Ignored on purpose - see above.
  }
};
