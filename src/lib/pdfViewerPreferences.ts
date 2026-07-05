/**
 * Per-PDF reading preferences (bookmarks, last page read) - localStorage
 * only, same privacy-conscious pattern as libraryPreferences.ts: only
 * product ids, page numbers, and timestamps are ever stored, never
 * anything identity-linked, and nothing is ever sent to any server.
 */

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
}

const BOOKMARKS_KEY_PREFIX = 'pdf-bookmarks:';
const PROGRESS_KEY_PREFIX = 'pdf-progress:';
const VIEWER_PREFS_KEY_PREFIX = 'pdf-viewer-prefs:';

const DEFAULT_VIEWER_PREFS: ViewerPrefs = { rotation: 0, scrollMode: 'continuous' };

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

export const getBookmarks = (productId: string): Bookmark[] =>
  readJson<Bookmark[]>(BOOKMARKS_KEY_PREFIX + productId, []).sort((a, b) => a.page - b.page);

export const addBookmark = (productId: string, page: number): Bookmark[] => {
  const current = getBookmarks(productId);
  if (current.some((bookmark) => bookmark.page === page)) return current;

  const next = [...current, { id: `${page}-${Date.now()}`, page, createdAt: Date.now() }];
  writeJson(BOOKMARKS_KEY_PREFIX + productId, next);
  return getBookmarks(productId);
};

export const removeBookmark = (productId: string, id: string): Bookmark[] => {
  const next = getBookmarks(productId).filter((bookmark) => bookmark.id !== id);
  writeJson(BOOKMARKS_KEY_PREFIX + productId, next);
  return next;
};

export const isPageBookmarked = (productId: string, page: number): boolean =>
  getBookmarks(productId).some((bookmark) => bookmark.page === page);

export const getReadingProgress = (productId: string): ReadingProgress | null =>
  readJson<ReadingProgress | null>(PROGRESS_KEY_PREFIX + productId, null);

export const saveReadingProgress = (productId: string, lastPage: number, pageCount: number): void => {
  const progress: ReadingProgress = { lastPage, pageCount, updatedAt: Date.now() };
  writeJson(PROGRESS_KEY_PREFIX + productId, progress);
};

// Rotation and scroll-mode were previously session-only (reset every time a
// PDF was reopened) while bookmarks/reading-progress persisted - an
// inconsistent experience with no real reason behind it. Persisting these
// too, per product, keeps all viewer preferences behaving the same way.
export const getViewerPrefs = (productId: string): ViewerPrefs =>
  readJson<ViewerPrefs>(VIEWER_PREFS_KEY_PREFIX + productId, DEFAULT_VIEWER_PREFS);

export const saveViewerPrefs = (productId: string, prefs: ViewerPrefs): void => {
  writeJson(VIEWER_PREFS_KEY_PREFIX + productId, prefs);
};
