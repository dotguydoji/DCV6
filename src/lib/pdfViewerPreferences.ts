/**
 * Per-PDF reading preferences (bookmarks, last page read) - localStorage
 * only, nothing ever sent to any server. Namespaced per signed-in account
 * (see accountScope.ts) so a second buyer signing into a shared device
 * never sees or overwrites the first buyer's bookmarks/reading progress/
 * viewer settings for a PDF.
 */

import { claimLegacyKey, getAccountScope } from './accountScope';

export interface Bookmark {
  id: string;
  page: number;
  createdAt: number;
}

interface ReadingProgress {
  lastPage: number;
  pageCount: number;
  updatedAt: number;
}

export interface ViewerPrefs {
  rotation: 0 | 90 | 180 | 270;
  scrollMode: 'continuous' | 'single';
  // Whatever PDF.js's own `currentScaleValue` was last set to - either a
  // keyword ('page-width', 'page-fit') or a plain number as a string (a
  // manual zoom level from the +/- controls). Stored as-is so restoring it
  // is just handing the same string back to PDF.js, no translation needed.
  scaleValue: string;
}

const LEGACY_BOOKMARKS_PREFIX = 'pdf-bookmarks:';
const LEGACY_PROGRESS_PREFIX = 'pdf-progress:';
const LEGACY_VIEWER_PREFS_PREFIX = 'pdf-viewer-prefs:';

const bookmarksKey = (productId: string) => `pdf-bookmarks:${getAccountScope()}:${productId}`;
const progressKey = (productId: string) => `pdf-progress:${getAccountScope()}:${productId}`;
const viewerPrefsKey = (productId: string) => `pdf-viewer-prefs:${getAccountScope()}:${productId}`;

const DEFAULT_VIEWER_PREFS: ViewerPrefs = { rotation: 0, scrollMode: 'continuous', scaleValue: 'page-width' };

const readJson = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    // JSON.parse only guarantees valid JSON, not the expected shape - if the
    // caller expects an array (fallback is one) but stored data isn't
    // actually an array (e.g. left over from an earlier version of this
    // code, or corrupted), callers immediately chain array methods like
    // .sort()/.filter() onto this return value. That throws outside this
    // try/catch and crashes the whole page (caught by the app's top-level
    // ErrorBoundary) - falling back here instead keeps that impossible.
    if (Array.isArray(fallback) && !Array.isArray(parsed)) {
      return fallback;
    }
    return parsed;
  } catch {
    return fallback;
  }
};

/**
 * localStorage.setItem can throw (Safari Private Browsing historically
 * blocks writes entirely; quota limits can also trigger this on any
 * browser). These writes happen inside PDF.js's own event callbacks, not
 * inside a React render, so an uncaught throw here bypasses the app's
 * ErrorBoundary entirely and can interrupt PDF.js's own rendering -
 * exactly the "intermittent blank/black screen" pattern. Bookmarking/
 * progress-saving failing silently is a much better outcome than that.
 */
const writeJson = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignored on purpose - see comment above.
  }
};

export const getBookmarks = (productId: string): Bookmark[] => {
  const key = bookmarksKey(productId);
  claimLegacyKey(LEGACY_BOOKMARKS_PREFIX + productId, key);
  return readJson<Bookmark[]>(key, []).sort((a, b) => a.page - b.page);
};

export const addBookmark = (productId: string, page: number): Bookmark[] => {
  const current = getBookmarks(productId);
  if (current.some((bookmark) => bookmark.page === page)) return current;

  const next = [...current, { id: `${page}-${Date.now()}`, page, createdAt: Date.now() }];
  writeJson(bookmarksKey(productId), next);
  return getBookmarks(productId);
};

export const removeBookmark = (productId: string, id: string): Bookmark[] => {
  const next = getBookmarks(productId).filter((bookmark) => bookmark.id !== id);
  writeJson(bookmarksKey(productId), next);
  return next;
};

export const isPageBookmarked = (productId: string, page: number): boolean =>
  getBookmarks(productId).some((bookmark) => bookmark.page === page);

// Unlike the array-shaped data above (already guarded by readJson's
// array-shape check), a corrupted-but-valid-JSON object would otherwise
// pass straight through into PDF.js/CSS logic (e.g. lastPage: "abc" or
// rotation: 999) - these two checks catch that instead of trusting the
// stored shape.
const isValidReadingProgress = (value: unknown): value is ReadingProgress =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as ReadingProgress).lastPage === 'number' &&
  typeof (value as ReadingProgress).pageCount === 'number';

const isValidRotation = (value: unknown): value is ViewerPrefs['rotation'] =>
  value === 0 || value === 90 || value === 180 || value === 270;

const isValidScrollMode = (value: unknown): value is ViewerPrefs['scrollMode'] =>
  value === 'continuous' || value === 'single';

export const getReadingProgress = (productId: string): ReadingProgress | null => {
  const key = progressKey(productId);
  claimLegacyKey(LEGACY_PROGRESS_PREFIX + productId, key);
  const parsed = readJson<ReadingProgress | null>(key, null);
  return isValidReadingProgress(parsed) ? parsed : null;
};

export const saveReadingProgress = (productId: string, lastPage: number, pageCount: number): void => {
  const progress: ReadingProgress = { lastPage, pageCount, updatedAt: Date.now() };
  writeJson(progressKey(productId), progress);
};

// Rotation and scroll-mode were previously session-only (reset every time a
// PDF was reopened) while bookmarks/reading-progress persisted - an
// inconsistent experience with no real reason behind it. Persisting these
// too, per product, keeps all viewer preferences behaving the same way.
// Spread over the defaults (rather than returned as-is) so a prefs object
// saved before `scaleValue` existed still comes back with a valid value
// instead of `undefined`, and each field is independently shape-checked so
// a corrupted single field falls back to its own default rather than
// invalidating the whole object.
export const getViewerPrefs = (productId: string): ViewerPrefs => {
  const key = viewerPrefsKey(productId);
  claimLegacyKey(LEGACY_VIEWER_PREFS_PREFIX + productId, key);
  const stored = readJson<Partial<ViewerPrefs>>(key, {});
  return {
    rotation: isValidRotation(stored.rotation) ? stored.rotation : DEFAULT_VIEWER_PREFS.rotation,
    scrollMode: isValidScrollMode(stored.scrollMode) ? stored.scrollMode : DEFAULT_VIEWER_PREFS.scrollMode,
    scaleValue: typeof stored.scaleValue === 'string' ? stored.scaleValue : DEFAULT_VIEWER_PREFS.scaleValue
  };
};

export const saveViewerPrefs = (productId: string, prefs: ViewerPrefs): void => {
  writeJson(viewerPrefsKey(productId), prefs);
};
