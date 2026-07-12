/**
 * The Notebook has no backend - every note is written straight to this
 * browser's localStorage. Since that's a real (if low-stakes) storage
 * decision the buyer hasn't been asked about anywhere else on the site,
 * this tracks whether they've explicitly agreed to it, separately from the
 * notes themselves.
 */

const CONSENT_KEY = 'dcv6-notebook-storage-consent';

export type NotebookConsentStatus = 'unknown' | 'granted' | 'declined';

/** A real read/write capability check, not just a try/catch around the actual save - Safari Private Browsing and some locked-down browser settings block localStorage entirely, in which case asking for "consent" would be moot since Allow would silently fail anyway. */
export const isLocalStorageAvailable = (): boolean => {
  const testKey = '__dcv6_storage_test__';
  try {
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
};

export const getNotebookConsentStatus = (): NotebookConsentStatus => {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    return raw === 'granted' || raw === 'declined' ? raw : 'unknown';
  } catch {
    return 'unknown';
  }
};

export const setNotebookConsentStatus = (status: 'granted' | 'declined'): void => {
  try {
    localStorage.setItem(CONSENT_KEY, status);
  } catch {
    // Ignored on purpose - if storage is blocked, isLocalStorageAvailable()
    // already routes the caller to the "unavailable" state instead.
  }
};
