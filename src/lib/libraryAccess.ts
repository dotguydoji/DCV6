import { getCachedResponse, setCachedResponse } from './requestCache';

export const LIBRARY_ACCESS_CACHE_TTL_MS = 20 * 60 * 1000;

export type LibraryAccessResult = { status: 'ok'; productIds: string[] } | { status: 'error' };

/**
 * Lightweight owned-PDF lookup, reusing the same "my-library" cache key as
 * MyLibraryPage.tsx so a recent visit there avoids a second Firestore read.
 * Not a security boundary itself - it only gates the "Join Messenger Group
 * Chat" prompt - so any failure (network error, expired token) is reported
 * as 'error' and callers should treat that as "no access" rather than
 * surfacing a retry flow.
 */
export const fetchOwnedProductIds = async (
  idToken: string,
  email: string | null
): Promise<LibraryAccessResult> => {
  const cacheKey = email ? `my-library:${email}` : null;
  const cached = cacheKey ? getCachedResponse<string[]>(cacheKey) : null;
  if (cached) return { status: 'ok', productIds: cached };

  try {
    const response = await fetch('/.netlify/functions/get-my-library', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    });
    const data = await response.json();

    if (response.ok && data.authorized) {
      const productIds: string[] = data.productIds ?? [];
      if (cacheKey) setCachedResponse(cacheKey, productIds, LIBRARY_ACCESS_CACHE_TTL_MS);
      return { status: 'ok', productIds };
    }

    return { status: 'error' };
  } catch {
    return { status: 'error' };
  }
};
