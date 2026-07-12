import { clearAllCachedResponses } from './requestCache';

export interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleIdConfiguration {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
}

interface GoogleButtonOptions {
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  width?: number;
}

interface GoogleAccountsId {
  initialize: (config: GoogleIdConfiguration) => void;
  renderButton: (parent: HTMLElement, options: GoogleButtonOptions) => void;
  disableAutoSelect: () => void;
  prompt: () => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: GoogleAccountsId;
      };
    };
  }
}

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
let scriptPromise: Promise<void> | null = null;

export const loadGoogleIdentityScript = (): Promise<void> => {
  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }

  if (scriptPromise) {
    return scriptPromise;
  }

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity script')));
      return;
    }

    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity script'));
    document.head.appendChild(script);
  });

  return scriptPromise;
};

const ID_TOKEN_STORAGE_KEY = 'pdf-viewer-id-token';

interface IdTokenPayload {
  exp?: number;
  email?: string;
  name?: string;
  given_name?: string;
  picture?: string;
}

/**
 * Google ID tokens are JWTs: three base64url segments joined by dots.
 * The middle segment is the payload - decoding it client-side is purely
 * for UX (cache expiry checks, showing a name/avatar), and is NEVER used
 * for any authorization decision. The server always re-verifies the
 * token's signature, audience, and expiry independently on every request.
 */
const decodeJwtPayload = (idToken: string): IdTokenPayload | null => {
  try {
    const payloadSegment = idToken.split('.')[1];
    const json = atob(payloadSegment.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as IdTokenPayload;
  } catch {
    return null;
  }
};

const getTokenExpiryMs = (idToken: string): number | null => {
  const payload = decodeJwtPayload(idToken);
  return typeof payload?.exp === 'number' ? payload.exp * 1000 : null;
};

export interface IdTokenProfile {
  name: string | null;
  picture: string | null;
}

/** Display-only profile info (name/avatar) - never used for access decisions. */
export const getIdTokenProfile = (idToken: string): IdTokenProfile => {
  const payload = decodeJwtPayload(idToken);
  return {
    name: payload?.given_name ?? payload?.name ?? null,
    picture: payload?.picture ?? null
  };
};

/**
 * Used ONLY to scope short-lived client-side response caches (see
 * requestCache.ts) to the currently signed-in account - never persisted,
 * never sent anywhere, and never used for any authorization decision
 * (the server independently re-verifies identity on every real request).
 * Without this, a cached response could otherwise be reused across a
 * sign-out/sign-in-as-someone-else on a shared device.
 */
export const getIdTokenEmail = (idToken: string): string | null => {
  const payload = decodeJwtPayload(idToken);
  return payload?.email ?? null;
};

/**
 * Storage access can throw in some browsers/modes (Safari Private
 * Browsing historically blocks it entirely, and some browsers throw even
 * on getItem when storage is disabled via settings). None of this is a
 * real access-control mechanism (the server always re-verifies), so any
 * failure here should just mean "treat as signed out," never crash.
 */
export const getCachedIdToken = (): string | null => {
  try {
    const token = localStorage.getItem(ID_TOKEN_STORAGE_KEY);
    if (!token) return null;

    const expiryMs = getTokenExpiryMs(token);
    if (expiryMs === null || expiryMs <= Date.now()) {
      localStorage.removeItem(ID_TOKEN_STORAGE_KEY);
      return null;
    }

    return token;
  } catch {
    return null;
  }
};

export const setCachedIdToken = (idToken: string): void => {
  try {
    localStorage.setItem(ID_TOKEN_STORAGE_KEY, idToken);
  } catch {
    // Ignored on purpose - see comment above.
  }
};

export const clearCachedIdToken = (): void => {
  try {
    localStorage.removeItem(ID_TOKEN_STORAGE_KEY);
  } catch {
    // Ignored on purpose - see comment above.
  }
};

const SILENT_SIGN_IN_LAST_ATTEMPT_KEY = 'google-silent-signin-last-attempt';

// Google's own account session in the browser (a cookie only Google
// controls) is what actually lets a buyer come back for up to about a week
// without clicking "Sign in" again - our own id token is always short-lived
// and gets silently replaced from that session. This cooldown only exists
// to stop us from calling prompt() many times in a few seconds (which
// trips Google's own suppression); it deliberately does NOT block retrying
// on a fresh page load/reload, which is when this actually needs to fire.
const SILENT_SIGN_IN_COOLDOWN_MS = 30 * 1000;

/**
 * Explicit sign-out: clears our cached token AND tells Google's own library
 * to stop silently restoring a session next time (disableAutoSelect) - this
 * is what keeps "sign out" meaningful, instead of the silent re-auth below
 * immediately logging the buyer back in on their next visit. Also purges
 * requestCache.ts's response cache (my-library list, PDF signed URLs) so a
 * second person signing into the same tab can never see a trace of the
 * previous buyer's cached data.
 */
export const signOutOfGoogle = (): void => {
  clearCachedIdToken();
  clearAllCachedResponses();
  try {
    localStorage.removeItem(SILENT_SIGN_IN_LAST_ATTEMPT_KEY);
  } catch {
    // Ignored on purpose - see getCachedIdToken's comment above.
  }
  window.google?.accounts?.id.disableAutoSelect();
};

/**
 * Tries to silently restore a session (no click needed) when the cached
 * token has simply expired - not after an explicit sign-out, since that
 * calls disableAutoSelect() above. Guarded by a short cooldown (not "once
 * ever per tab") so it still retries on every real page load/reload - a
 * buyer reopening the site a day, or a week, later gets a fresh silent
 * attempt every time, which is what actually keeps them signed in across
 * that whole window rather than only on the very first visit to a tab.
 * The cooldown only blocks firing again within the same few seconds (e.g.
 * a fast re-render), not across separate visits.
 */
export const attemptSilentSignIn = (): boolean => {
  try {
    const lastAttempt = Number(localStorage.getItem(SILENT_SIGN_IN_LAST_ATTEMPT_KEY) ?? 0);
    if (Date.now() - lastAttempt < SILENT_SIGN_IN_COOLDOWN_MS) {
      return false;
    }
    localStorage.setItem(SILENT_SIGN_IN_LAST_ATTEMPT_KEY, String(Date.now()));
  } catch {
    // If localStorage is unavailable, fall through and still try once -
    // see getCachedIdToken's comment above.
  }

  if (!window.google?.accounts?.id) {
    return false;
  }

  window.google.accounts.id.prompt();
  return true;
};

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

// Every Google ID token expires exactly 1 hour after it's issued, no matter
// how active the buyer is, and Google doesn't offer a way to mint a
// longer-lived one - before this, nothing renewed it ahead of that, so
// whatever needed the token next (a My Library fetch, a PDF signed-URL
// refresh) would find it already expired and treat that as a sign-out. That
// produced the reported "logged out after ~30-60 minutes" symptom even
// though the buyer never asked to be signed out.
//
// This background renewal silently re-issues a fresh token before each one
// expires, chaining them indefinitely - the maximum session length this
// architecture can offer isn't a bigger number we can configure (there's no
// TTL knob on a Google ID token), it's "however long the buyer's own Google
// browser session stays active," which is exactly the Facebook-style
// "signed in until you sign out or clear your data" behavior being asked
// for here, and exactly Google's own recommended pattern for keeping a
// visitor signed in with google.accounts.id (auto_select + periodic
// prompt()) rather than any kind of custom long-lived session cookie of our
// own (which this app has never had, and doesn't need for that reason).
//
// The renewal itself is scheduled event-driven (a single precisely-timed
// setTimeout for the moment the renewal window opens) rather than polling
// on a fixed interval, so there's zero background work at all for the ~50
// minutes out of every hour a token doesn't need anything done - this is
// what keeps the "reduce unnecessary requests" side of the tradeoff, while
// the generous buffer/grace windows below are what keeps it reliable even
// through a backgrounded tab's timer throttling.
const KEEP_ALIVE_RENEW_BEFORE_EXPIRY_MS = 10 * 60 * 1000;
// Mobile browsers in particular can throttle a backgrounded tab's timers by
// many minutes - this is the outer bound on how late a catch-up renewal
// attempt is still worth trying (e.g. the buyer left the tab open in the
// background and comes back well after the token technically expired).
// Past this, silently retrying stops making sense and the existing
// reactive expiry check (getCachedIdToken returning null) takes back over,
// exactly as it did before this feature existed.
const KEEP_ALIVE_GRACE_AFTER_EXPIRY_MS = 15 * 60 * 1000;
// While inside the renewal window and not yet renewed (e.g. still inside
// attemptSilentSignIn's own 30s anti-spam cooldown from a very recent
// attempt), this is the backoff between retries - deliberately not tight
// polling, since nothing about the token's state changes faster than that.
const KEEP_ALIVE_RETRY_DELAY_MS = 2 * 60 * 1000;

let keepAliveClientInitialized = false;

const ensureKeepAliveClientInitialized = (): boolean => {
  if (keepAliveClientInitialized) return true;
  if (!GOOGLE_CLIENT_ID || !window.google?.accounts?.id) return false;

  window.google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    // Silent renewal only, so it just needs to update the cached token -
    // nothing here needs to react to a fresh sign-in (no page-specific UI
    // transition), unlike GoogleSignInButton's own separate initialize()
    // call/callback for the visible, click-driven sign-in flow.
    callback: (response: GoogleCredentialResponse) => {
      setCachedIdToken(response.credential);
    },
    auto_select: true,
    cancel_on_tap_outside: false
  });
  keepAliveClientInitialized = true;
  return true;
};

const attemptRenewal = async (): Promise<void> => {
  try {
    await loadGoogleIdentityScript();
  } catch {
    return;
  }
  if (!ensureKeepAliveClientInitialized()) return;
  attemptSilentSignIn();
};

let keepAliveTimeoutId: ReturnType<typeof setTimeout> | null = null;

/**
 * The single scheduling decision point - re-reads the cached token fresh
 * every time it runs (on the timer itself, or from one of the event
 * listeners below) rather than trusting any previously-computed state, so
 * it's always reacting to what's actually in storage right now (including
 * a renewal that already landed, an explicit sign-out, or a sign-in/out
 * that happened in a different tab).
 */
const scheduleNextCheck = (): void => {
  if (keepAliveTimeoutId !== null) {
    clearTimeout(keepAliveTimeoutId);
    keepAliveTimeoutId = null;
  }

  let rawToken: string | null;
  try {
    rawToken = localStorage.getItem(ID_TOKEN_STORAGE_KEY);
  } catch {
    return;
  }
  // No token at all means never signed in, or an explicit sign-out
  // (signOutOfGoogle removes it) - stay fully idle, no wakeups scheduled,
  // and never silently prompt someone who hasn't chosen to sign in here.
  if (!rawToken) return;

  const expiryMs = getTokenExpiryMs(rawToken);
  if (expiryMs === null) return;

  const remaining = expiryMs - Date.now();
  if (remaining < -KEEP_ALIVE_GRACE_AFTER_EXPIRY_MS) return;

  if (remaining > KEEP_ALIVE_RENEW_BEFORE_EXPIRY_MS) {
    keepAliveTimeoutId = setTimeout(scheduleNextCheck, remaining - KEEP_ALIVE_RENEW_BEFORE_EXPIRY_MS);
    return;
  }

  void attemptRenewal();
  // Bounded retry loop: each pass either lands a renewal (pushing
  // `remaining` back out ~50 minutes on the next call, so this falls back
  // into the single-precise-wakeup branch above) or the grace deadline
  // eventually passes and the early return above stops it from
  // rescheduling at all.
  keepAliveTimeoutId = setTimeout(scheduleNextCheck, KEEP_ALIVE_RETRY_DELAY_MS);
};

/**
 * Call once, for the lifetime of the app (see App.tsx) - safe to call from
 * multiple mounts since the timer/listeners are module-scoped and
 * de-duplicated, but only one call site is actually needed. Returns a
 * cleanup function for symmetry with a useEffect, though in practice this
 * only ever unmounts when the whole app does.
 */
export const startAuthSessionKeepAlive = (): (() => void) => {
  scheduleNextCheck();

  // The precisely-timed setTimeout above can still land late if the tab was
  // backgrounded (browsers throttle timers there) - visibility/focus fire
  // promptly the moment the buyer actually comes back, so this is the real
  // safety net for that case, re-evaluating fresh rather than waiting for
  // whatever's left of the original delay.
  const onVisible = () => {
    if (document.visibilityState === 'visible') scheduleNextCheck();
  };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);

  // Keeps multiple tabs in sync: a sign-in, sign-out, or renewal in one tab
  // updates this tab's own schedule immediately instead of it acting on a
  // stale plan computed before the change.
  const onStorage = (event: StorageEvent) => {
    if (event.key === ID_TOKEN_STORAGE_KEY || event.key === null) scheduleNextCheck();
  };
  window.addEventListener('storage', onStorage);

  return () => {
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onVisible);
    window.removeEventListener('storage', onStorage);
    if (keepAliveTimeoutId !== null) {
      clearTimeout(keepAliveTimeoutId);
      keepAliveTimeoutId = null;
    }
  };
};
