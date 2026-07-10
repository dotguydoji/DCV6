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
