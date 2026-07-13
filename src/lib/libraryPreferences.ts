/**
 * Buyer library preferences (favorites, recently opened) - stored ONLY in
 * this browser's localStorage, never sent to any server. Namespaced per
 * signed-in account (see accountScope.ts) so a second buyer signing into a
 * shared device never sees or overwrites the first buyer's favorites/
 * recently-opened list.
 */

import { claimLegacyKey, getAccountScope } from './accountScope';

const LEGACY_FAVORITES_KEY = 'library-favorites';
const LEGACY_RECENTLY_OPENED_KEY = 'library-recently-opened';
const getFavoritesKey = () => `library-favorites:${getAccountScope()}`;
const getRecentlyOpenedKey = () => `library-recently-opened:${getAccountScope()}`;
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

export const getFavoriteIds = (): string[] => {
  const key = getFavoritesKey();
  claimLegacyKey(LEGACY_FAVORITES_KEY, key);
  return readJson<string[]>(key, []);
};

export const isFavorite = (productId: string): boolean => getFavoriteIds().includes(productId);

export const toggleFavorite = (productId: string): string[] => {
  const current = getFavoriteIds();
  const next = current.includes(productId)
    ? current.filter((id) => id !== productId)
    : [...current, productId];

  writeJson(getFavoritesKey(), next);
  return next;
};

export const getRecentlyOpened = (): RecentlyOpenedEntry[] => {
  const key = getRecentlyOpenedKey();
  claimLegacyKey(LEGACY_RECENTLY_OPENED_KEY, key);
  return readJson<RecentlyOpenedEntry[]>(key, []).sort((a, b) => b.openedAt - a.openedAt);
};

/** Called once a buyer is actually authorized to view a PDF - not on every click, just successful opens. */
export const recordOpened = (productId: string): void => {
  const current = getRecentlyOpened().filter((entry) => entry.productId !== productId);
  const next = [{ productId, openedAt: Date.now() }, ...current].slice(0, MAX_RECENTLY_OPENED);
  writeJson(getRecentlyOpenedKey(), next);
};
