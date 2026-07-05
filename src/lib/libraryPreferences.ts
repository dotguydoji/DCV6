/**
 * Buyer library preferences (favorites, recently opened) - stored ONLY in
 * this browser's localStorage, never sent to any server. No personal
 * information is stored here: just product ids and timestamps, never an
 * email, name, or anything tied to a specific Google account. Because of
 * that, it's intentionally NOT namespaced per signed-in account - it's a
 * per-device convenience, not a per-user record.
 */

const FAVORITES_KEY = 'library-favorites';
const RECENTLY_OPENED_KEY = 'library-recently-opened';
const MAX_RECENTLY_OPENED = 10;

export interface RecentlyOpenedEntry {
  productId: string;
  openedAt: number;
}

const readJson = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    // JSON.parse only guarantees valid JSON, not the expected shape - if the
    // caller expects an array (fallback is one) but stored data isn't
    // actually an array, callers immediately chain array methods like
    // .sort()/.filter()/.includes() onto this return value, which throws
    // outside this try/catch and crashes the whole page (caught by the
    // app's top-level ErrorBoundary). Falling back here keeps that impossible.
    if (Array.isArray(fallback) && !Array.isArray(parsed)) {
      return fallback;
    }
    return parsed as T;
  } catch {
    return fallback;
  }
};

/**
 * localStorage.setItem can throw (Safari Private Browsing historically
 * blocks writes entirely; quota limits can also trigger this on any
 * browser). Failing to save a favorite/recently-opened entry should never
 * be allowed to crash the page - silently skipping the save is the right
 * fallback here.
 */
const writeJson = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignored on purpose - see comment above.
  }
};

export const getFavoriteIds = (): string[] => readJson<string[]>(FAVORITES_KEY, []);

export const isFavorite = (productId: string): boolean => getFavoriteIds().includes(productId);

export const toggleFavorite = (productId: string): string[] => {
  const current = getFavoriteIds();
  const next = current.includes(productId)
    ? current.filter((id) => id !== productId)
    : [...current, productId];

  writeJson(FAVORITES_KEY, next);
  return next;
};

export const getRecentlyOpened = (): RecentlyOpenedEntry[] =>
  readJson<RecentlyOpenedEntry[]>(RECENTLY_OPENED_KEY, []).sort((a, b) => b.openedAt - a.openedAt);

/** Called once a buyer is actually authorized to view a PDF - not on every click, just successful opens. */
export const recordOpened = (productId: string): void => {
  const current = getRecentlyOpened().filter((entry) => entry.productId !== productId);
  const next = [{ productId, openedAt: Date.now() }, ...current].slice(0, MAX_RECENTLY_OPENED);
  writeJson(RECENTLY_OPENED_KEY, next);
};
