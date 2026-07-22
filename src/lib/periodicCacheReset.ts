const LAST_RESET_KEY = 'periodic-cache-reset:last-run';
const RESET_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Belt-and-suspenders safety net on top of the PWA's normal auto-update
 * pipeline (registerServiceWorker.ts's skipWaiting+clientsClaim+forced
 * reload, and the "/index.html" no-cache header in netlify.toml) - those
 * already pick up a new deploy within about a day for anyone who revisits,
 * but this guarantees a hard reset of the site's own display cache (the
 * service worker's Cache Storage entries - precached JS/CSS/HTML) at least
 * once every 7 days even in an edge case where that pipeline somehow didn't
 * catch a change (e.g. a visitor who keeps one tab open for weeks without a
 * real navigation).
 *
 * Deliberately does NOT touch localStorage, IndexedDB, or sessionStorage -
 * the signed-in Google id token, library/notebook preferences, and the
 * request-cache module all live there, completely untouched by this. Owned
 * PDFs and the Productivity subscription aren't cached client-side at all
 * (every access re-verifies against Firestore server-side) - there is
 * nothing for this to accidentally "reset" on that front even in principle.
 * This only ever clears Cache Storage, which holds nothing but the site's
 * own static display assets.
 */
export const runPeriodicCacheReset = async (): Promise<void> => {
  if (typeof window === 'undefined' || !('caches' in window)) return;

  let lastRun: number | null = null;
  try {
    const stored = localStorage.getItem(LAST_RESET_KEY);
    lastRun = stored ? parseInt(stored, 10) : null;
  } catch {
    // localStorage can throw (Safari Private Browsing, quota) - treat as
    // "never run before" and fall through; the write below is separately
    // guarded and simply no-ops if it also fails.
  }

  const now = Date.now();

  // First time this has ever run on this device: there's nothing stale to
  // reset yet (the site was just loaded fresh), so just record the
  // baseline instead of immediately wiping a brand-new cache for no reason.
  if (lastRun === null || Number.isNaN(lastRun)) {
    try {
      localStorage.setItem(LAST_RESET_KEY, String(now));
    } catch {
      // Ignored - see comment above.
    }
    return;
  }

  if (now - lastRun < RESET_INTERVAL_MS) return;

  // Skip (without updating the timestamp, so this retries on the next load
  // instead of waiting another 7 days) if currently offline - installed-PWA
  // users can open the app with no connection precisely because Cache
  // Storage has their last-known assets; wiping it right now would leave
  // them with nothing to fall back on until they're back online, instead of
  // the intended "fetch a fresh copy immediately" outcome.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  try {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((key) => caches.delete(key)));
  } catch {
    // Best-effort - if this fails, the normal update pipeline (checked
    // below regardless) still runs, and this will simply retry on the
    // visitor's next visit.
  }

  // Forces the browser to re-fetch and byte-compare sw.js right now rather
  // than waiting for its own periodic check - if a newer worker exists,
  // this hands off to the exact same skipWaiting/clientsClaim/onNeedRefresh
  // flow registerServiceWorker.ts already uses for a normal deploy, so the
  // reload behavior here is identical and no separate reload logic is needed.
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    await registration?.update();
  } catch {
    // Best-effort, same reasoning as above.
  }

  try {
    localStorage.setItem(LAST_RESET_KEY, String(now));
  } catch {
    // Ignored - see comment above.
  }
};
