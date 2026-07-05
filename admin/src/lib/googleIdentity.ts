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

const ID_TOKEN_STORAGE_KEY = 'admin-id-token';

const getTokenExpiryMs = (idToken: string): number | null => {
  try {
    const payloadSegment = idToken.split('.')[1];
    const json = atob(payloadSegment.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
};

/**
 * Storage access can throw in some browsers/modes (Safari Private Browsing
 * historically blocks it entirely, and some browsers throw even on getItem
 * when storage is disabled via settings). None of this is a real access-
 * control mechanism (the server always re-verifies), so any failure here
 * should just mean "treat as signed out," never crash - matching the same
 * pattern already used on the main site (src/lib/googleIdentity.ts).
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

const SILENT_SIGN_IN_ATTEMPTED_KEY = 'admin-google-silent-signin-attempted';

/**
 * Explicit sign-out: clears the cached token AND tells Google's own library
 * to stop silently restoring a session next time (disableAutoSelect) - this
 * is what keeps "sign out" meaningful.
 */
export const signOutOfGoogle = (): void => {
  clearCachedIdToken();
  try {
    sessionStorage.removeItem(SILENT_SIGN_IN_ATTEMPTED_KEY);
  } catch {
    // Ignored on purpose - see getCachedIdToken's comment above.
  }
  window.google?.accounts?.id.disableAutoSelect();
};

/**
 * Tries to silently restore a session (no click needed) when the cached
 * token has simply expired. Guarded to at most once per browser tab session
 * (sessionStorage, not an in-memory flag) - calling Google's prompt()
 * repeatedly in a short window triggers a cooldown that suppresses sign-in
 * entirely for several minutes, which matters here since admins reload this
 * panel repeatedly throughout the day.
 */
export const attemptSilentSignIn = (): boolean => {
  try {
    if (sessionStorage.getItem(SILENT_SIGN_IN_ATTEMPTED_KEY)) {
      return false;
    }
    sessionStorage.setItem(SILENT_SIGN_IN_ATTEMPTED_KEY, '1');
  } catch {
    // If sessionStorage is unavailable, fall through and still try once -
    // see getCachedIdToken's comment above.
  }

  if (!window.google?.accounts?.id) {
    return false;
  }

  window.google.accounts.id.prompt();
  return true;
};
