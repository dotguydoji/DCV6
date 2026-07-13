import { getCachedIdToken, getIdTokenEmail } from './googleIdentity';

/**
 * Namespaces per-account local data (favorites, recently opened, bookmarks,
 * reading progress, viewer prefs, notebook notes) by the signed-in buyer's
 * email. Previously each of these lived under one global-to-the-browser
 * key, so on a shared/public device, whoever signed in second would see
 * (and could overwrite) the first buyer's favorites, reading progress,
 * bookmarks, and notebook content - notebook content especially, since
 * that's free-typed text, not just an opaque product id. Scoping by
 * account is what actually closes that, rather than just clearing on
 * sign-out (which wouldn't help someone who closes the tab without
 * explicitly signing out - a second person opening the same browser later
 * would still land in the first buyer's data with a "clear on sign-out"
 * approach, but not with per-account keys).
 *
 * Falls back to a fixed 'guest' bucket if called without a signed-in
 * session - none of the features that use this are actually reachable
 * while signed out (all gated behind sign-in), so this is only ever a
 * defensive fallback, not an expected path.
 */
const GUEST_SCOPE = 'guest';

export const getAccountScope = (): string => {
  const token = getCachedIdToken();
  if (!token) return GUEST_SCOPE;
  return getIdTokenEmail(token) ?? GUEST_SCOPE;
};

/**
 * One-time "claim" migration for a single pre-account-scoping legacy key:
 * if the new per-account key has no data yet but the old global key does,
 * the data is moved to whichever account is first to access it afterward,
 * and the legacy key is deleted immediately in the same step.
 *
 * This can't perfectly retroactively fix a device that was already shared
 * between two buyers before this scoping existed (there's no record of who
 * actually wrote the legacy data), but it does two things well: it
 * preserves the common case - one person per device - losslessly instead
 * of appearing to wipe their favorites/bookmarks/notes, and it permanently
 * closes the leak going forward, since once claimed the legacy key is gone
 * and can never be read or re-claimed by a different account again.
 */
export const claimLegacyKey = (legacyKey: string, scopedKey: string): void => {
  try {
    if (localStorage.getItem(scopedKey) !== null) return;
    const legacyValue = localStorage.getItem(legacyKey);
    if (legacyValue === null) return;
    localStorage.setItem(scopedKey, legacyValue);
    localStorage.removeItem(legacyKey);
  } catch {
    // Ignored on purpose - worst case the legacy key just lingers unclaimed
    // and this account starts fresh, same as any other storage failure
    // elsewhere in this app.
  }
};
