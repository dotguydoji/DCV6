// Length-capped to match netlify/functions/lib/validation.ts - defense in
// depth, kept in sync by hand for the same reason noted in
// productivityFeatures.ts (this file can't import across the two apps).
export const PRODUCT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,99}$/;

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

// A real email can never contain "/" (Firestore path separator), can't have
// whitespace, and has exactly one "@". Used to guard any email about to be
// passed to `.doc(email)` (buyers/{email}) - defense in depth, even though
// the value already came from a verified Google token upstream.
const EMAIL_PATTERN = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;

export const isValidEmail = (value: unknown): value is string =>
  typeof value === 'string' && EMAIL_PATTERN.test(value.trim());

// A payment-proof screenshot's R2 object key: the payment-proofs/ prefix,
// a server-generated UUID (never client-chosen), and an image extension.
// Re-validated before this key is ever fed into an R2 command, so a value
// from Firestore can never be coerced into targeting another prefix (e.g.
// pdfs/) even in the impossible case it were tampered with.
const PAYMENT_PROOF_KEY_PATTERN =
  /^payment-proofs\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpe?g|png|webp)$/;

export const isValidPaymentProofKey = (value: unknown): value is string =>
  typeof value === 'string' && PAYMENT_PROOF_KEY_PATTERN.test(value);

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
