/**
 * "New Videos Uploaded" / "New PDF Releases" (My Library, top of page).
 *
 * Deliberately fetched directly from the PUBLIC R2 bucket
 * (VITE_IMAGE_BASE_URL - the same one product thumbnails already load from)
 * instead of a Netlify Function - this content is public, non-sensitive
 * marketing data (see admin/netlify/functions/lib/newReleases.ts, which
 * writes it to a bucket entirely separate from the private PDF one), so
 * there's no ownership check to perform and nothing gained by proxying it
 * through a Netlify Function invocation. That's also the whole point of the
 * once-daily cache below: keep buyer traffic off Netlify's request/bandwidth
 * limits entirely for this feature.
 *
 * The cache is intentionally NOT a fixed "N minutes since last fetch" TTL
 * (see requestCache.ts for that pattern elsewhere) - it always expires at
 * the next 8:15 PM Philippine Time, because new content is normally
 * published around 8:00 PM PHT and a fixed rolling TTL would show it at a
 * different time to every visitor depending on when they last loaded the
 * page. localStorage (not sessionStorage) on purpose too, so the "once a
 * day" promise holds across tabs/visits, not just within one.
 */

const IMAGE_BASE_URL = import.meta.env?.VITE_IMAGE_BASE_URL ?? '';

export interface NewReleaseVideo {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  youtubeId: string;
}

export interface NewReleasePdf {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  productId: string;
}

// The Philippines has used a single fixed UTC+8 offset (no DST) since 1978,
// so this simple arithmetic is exact - no timezone library needed.
const PH_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
const REFRESH_HOUR_PH = 20;
const REFRESH_MINUTE_PH = 15;

/** The next moment it's 8:15 PM Philippine Time, at or after `fromMs`. */
const nextRefreshTimestamp = (fromMs: number): number => {
  const phShifted = new Date(fromMs + PH_UTC_OFFSET_MS);
  const candidateUtc =
    Date.UTC(
      phShifted.getUTCFullYear(),
      phShifted.getUTCMonth(),
      phShifted.getUTCDate(),
      REFRESH_HOUR_PH,
      REFRESH_MINUTE_PH,
      0,
      0
    ) - PH_UTC_OFFSET_MS;

  return candidateUtc > fromMs ? candidateUtc : candidateUtc + 24 * 60 * 60 * 1000;
};

const CACHE_PREFIX = 'new-releases-cache:';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const readCache = <T>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (entry.expiresAt <= Date.now()) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return entry.value;
  } catch {
    return null;
  }
};

const writeCache = <T>(key: string, value: T): void => {
  try {
    const entry: CacheEntry<T> = { value, expiresAt: nextRefreshTimestamp(Date.now()) };
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // Ignored on purpose - this is a perf optimization, not a correctness
    // requirement (Safari Private Browsing / storage-full can throw here).
  }
};

// Mirror the exact formats admin-upsert-new-release.ts already enforces on
// write (see admin/netlify/functions/lib/newReleases.ts and validation.ts) -
// duplicated here rather than imported, matching this codebase's existing
// pattern of small cross-boundary constants (e.g. PRODUCTIVITY_SUBSCRIPTION_
// PERIOD_MS) since the admin functions aren't reachable from Vite code.
// Belt-and-suspenders: this bucket is only ever written by the admin
// function that already validates these shapes, so this isn't closing a
// reachable exploit - it's making sure a malformed/unexpected entry (a
// manual bucket edit, a future bug) degrades to "this one card doesn't
// render" instead of silently producing a broken link or image.
const THUMBNAIL_KEY_PATTERN =
  /^new-releases\/thumbnails\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|png|jpe?g)$/;
const YOUTUBE_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;
const PRODUCT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const thumbnailUrl = (thumbnailKey: unknown): string =>
  typeof thumbnailKey === 'string' && THUMBNAIL_KEY_PATTERN.test(thumbnailKey) ? `${IMAGE_BASE_URL}/${thumbnailKey}` : '';

const sanitizeVideo = (raw: unknown): NewReleaseVideo | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const { id, title, description, thumbnailKey, youtubeId } = raw as Record<string, unknown>;
  if (
    typeof id !== 'string' ||
    typeof title !== 'string' ||
    typeof description !== 'string' ||
    typeof thumbnailKey !== 'string' ||
    !THUMBNAIL_KEY_PATTERN.test(thumbnailKey) ||
    typeof youtubeId !== 'string' ||
    !YOUTUBE_ID_PATTERN.test(youtubeId)
  ) {
    return null;
  }
  return { id, title, description, thumbnailUrl: thumbnailUrl(thumbnailKey), youtubeId };
};

const sanitizePdf = (raw: unknown): NewReleasePdf | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const { id, title, description, thumbnailKey, productId } = raw as Record<string, unknown>;
  if (
    typeof id !== 'string' ||
    typeof title !== 'string' ||
    typeof description !== 'string' ||
    typeof thumbnailKey !== 'string' ||
    !THUMBNAIL_KEY_PATTERN.test(thumbnailKey) ||
    typeof productId !== 'string' ||
    !PRODUCT_ID_PATTERN.test(productId)
  ) {
    return null;
  }
  return { id, title, description, thumbnailUrl: thumbnailUrl(thumbnailKey), productId };
};

const fetchManifest = async <T>(fileName: string, cacheKey: string, sanitize: (raw: unknown) => T | null): Promise<T[]> => {
  const cached = readCache<T[]>(cacheKey);
  if (cached) return cached;

  if (!IMAGE_BASE_URL) return [];

  try {
    const response = await fetch(`${IMAGE_BASE_URL}/new-releases/${fileName}`);
    if (!response.ok) return [];
    const data = await response.json();
    const rawItems = Array.isArray(data?.items) ? data.items : [];
    const items = rawItems.map(sanitize).filter((item: T | null): item is T => item !== null);
    writeCache(cacheKey, items);
    return items;
  } catch {
    return [];
  }
};

export const fetchNewVideos = (): Promise<NewReleaseVideo[]> =>
  fetchManifest('videos.json', 'videos', sanitizeVideo);

export const fetchNewPdfReleases = (): Promise<NewReleasePdf[]> =>
  fetchManifest('pdfs.json', 'pdfs', sanitizePdf);
