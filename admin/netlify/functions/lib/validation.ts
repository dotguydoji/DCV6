export const PRODUCT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export const isValidProductId = (value: unknown): value is string =>
  typeof value === 'string' && PRODUCT_ID_PATTERN.test(value);

// Real Firestore auto-generated ids (returned by `.doc()` with no argument,
// what every package created through the UI actually gets) are alphanumeric
// only, ~20 characters. This whitelist exists specifically to keep "/" (and
// any other path-separator-like character) out of any client-supplied id
// that's about to be passed to `.doc(id)` - Firestore treats "/" as a path
// separator, so an unvalidated id could otherwise target an unintended
// nested document instead of a real top-level doc in the collection.
const FIRESTORE_DOC_ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

export const isValidFirestoreDocId = (value: unknown): value is string =>
  typeof value === 'string' && FIRESTORE_DOC_ID_PATTERN.test(value);

// Every real YouTube video id is exactly 11 characters from this alphabet -
// used both to validate an id typed in directly and to pull the id back out
// of a pasted full URL (watch?v=, youtu.be/, embed/, shorts/).
const YOUTUBE_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

export const isValidYoutubeId = (value: unknown): value is string =>
  typeof value === 'string' && YOUTUBE_ID_PATTERN.test(value);

/**
 * Accepts either a bare video id or any common full YouTube URL shape and
 * returns just the id, or null if nothing valid could be found - so the
 * admin can paste whatever the unlisted video's share link looks like
 * without first manually trimming it down to the id.
 */
export const extractYoutubeId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (isValidYoutubeId(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      const id = url.pathname.slice(1);
      return isValidYoutubeId(id) ? id : null;
    }

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const vParam = url.searchParams.get('v');
      if (vParam && isValidYoutubeId(vParam)) return vParam;

      const match = url.pathname.match(/^\/(embed|shorts)\/([a-zA-Z0-9_-]{11})/);
      if (match && isValidYoutubeId(match[2])) return match[2];
    }
  } catch {
    return null;
  }

  return null;
};
