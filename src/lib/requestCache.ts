/**
 * Short-lived, per-tab cache to cut down redundant Netlify Function calls
 * (page reloads, revisiting the same page shortly after) - sessionStorage
 * only, so it clears when the tab closes and never becomes a long-term
 * record of anything. Never stores anything beyond what the function
 * itself already returned (no new data, no personal info).
 *
 * TEMPORARILY DISABLED for active development (2026-07-04) so code changes
 * are always reflected immediately instead of serving a stale cached
 * response - flip CACHE_ENABLED back to true before the final release.
 * See documentation/context-window.md "What to do next" for the reminder.
 */
const CACHE_ENABLED = false;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const PREFIX = 'request-cache:';

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

  // sessionStorage.setItem can throw (Safari Private Browsing, quota
  // limits) - this is just a perf optimization, so failing to cache should
  // never be allowed to crash anything.
  try {
    const entry: CacheEntry<T> = { value, expiresAt: Date.now() + ttlMs };
    sessionStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    // Ignored on purpose - see comment above.
  }
};
