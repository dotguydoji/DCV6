/**
 * Short-lived, per-tab cache to cut down redundant Netlify Function calls
 * (page reloads, revisiting the same page shortly after) - sessionStorage
 * only, so it clears when the tab closes and never becomes a long-term
 * record of anything. Never stores anything beyond what the function
 * itself already returned (no new data, no personal info).
 */
const CACHE_ENABLED = true;

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

/**
 * Wipes every entry this module has written (my-library list, PDF signed
 * URLs, anything else that ever uses this cache) - called on sign-out so a
 * second person signing into the same browser tab can never see traces of
 * the previous buyer's cached email-scoped data.
 */
export const clearAllCachedResponses = (): void => {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(PREFIX)) keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // Ignored on purpose - see comment above.
  }
};
