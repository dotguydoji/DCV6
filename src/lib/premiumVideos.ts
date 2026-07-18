import { getCachedResponse, setCachedResponse } from './requestCache';

// Which product ids have bonus videos at all is public, non-sensitive data
// (mirrors the public product catalog) - cached longer and shared across
// every visitor rather than keyed per-buyer.
const VIDEO_PRODUCT_IDS_CACHE_KEY = 'video-product-ids';
const VIDEO_PRODUCT_IDS_CACHE_TTL_MS = 20 * 60 * 1000;

export const fetchVideoProductIds = async (): Promise<Set<string>> => {
  const cached = getCachedResponse<string[]>(VIDEO_PRODUCT_IDS_CACHE_KEY);
  if (cached) return new Set(cached);

  try {
    const response = await fetch('/.netlify/functions/get-video-product-ids', { method: 'POST' });
    if (!response.ok) return new Set();
    const data = await response.json();
    const productIds: string[] = data.productIds ?? [];
    setCachedResponse(VIDEO_PRODUCT_IDS_CACHE_KEY, productIds, VIDEO_PRODUCT_IDS_CACHE_TTL_MS);
    return new Set(productIds);
  } catch {
    return new Set();
  }
};

export interface PremiumVideoSummary {
  id: string;
  title: string;
}

// Titles only, on purpose - see get-product-videos.ts. Cached briefly
// per-product/per-buyer since an admin could add a video while the buyer is
// mid-session; not worth a long TTL like the ownership check.
const PRODUCT_VIDEOS_CACHE_TTL_MS = 5 * 60 * 1000;

export const fetchProductVideos = async (
  idToken: string,
  productId: string
): Promise<PremiumVideoSummary[]> => {
  const cacheKey = `product-videos:${productId}`;
  const cached = getCachedResponse<PremiumVideoSummary[]>(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch('/.netlify/functions/get-product-videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, productId })
    });
    if (!response.ok) return [];
    const data = await response.json();
    const videos: PremiumVideoSummary[] = data.videos ?? [];
    setCachedResponse(cacheKey, videos, PRODUCT_VIDEOS_CACHE_TTL_MS);
    return videos;
  } catch {
    return [];
  }
};

export interface PremiumVideoEmbed {
  youtubeId: string;
  title: string;
}

// Deliberately never cached - re-checks ownership fresh every time a title
// is actually clicked, rather than trusting a stale local copy of the
// unlisted video id.
export const fetchVideoEmbed = async (
  idToken: string,
  productId: string,
  videoId: string
): Promise<PremiumVideoEmbed | null> => {
  try {
    const response = await fetch('/.netlify/functions/get-video-embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, productId, videoId })
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data.authorized) return null;
    return { youtubeId: data.youtubeId, title: data.title };
  } catch {
    return null;
  }
};
