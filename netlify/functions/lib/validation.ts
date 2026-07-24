// Length-capped (real ids are short slugs, the longest today is ~25 chars) -
// this pattern is reachable from submit-order.ts with up to 20 ids per
// request from an authenticated-but-untrusted buyer, so an attacker
// couldn't use it to smuggle an arbitrarily large string into a Firestore
// write just because it happens to match [a-z0-9-].
export const PRODUCT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,99}$/;

export const isValidProductId = (value: unknown): value is string =>
  typeof value === 'string' && PRODUCT_ID_PATTERN.test(value);

// A payment-proof screenshot's R2 object key: the fixed payment-proofs/
// prefix, a server-generated UUID (never client-chosen - see
// get-order-upload-url.ts), and an image extension. Enforcing this exact
// shape is what keeps a client-supplied key from ever pointing outside the
// payment-proofs/ folder (e.g. at pdfs/), regardless of how it got here.
const PAYMENT_PROOF_KEY_PATTERN =
  /^payment-proofs\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpe?g|png|webp)$/;

export const isValidPaymentProofKey = (value: unknown): value is string =>
  typeof value === 'string' && PAYMENT_PROOF_KEY_PATTERN.test(value);

// Matches the shape of a crypto.randomUUID() output (see
// src/lib/chatbotSession.ts) - not a security boundary itself, just bounds
// what can be used as a rate-limit/cache Map key.
export const CHATBOT_SESSION_ID_PATTERN = /^[a-zA-Z0-9-]{8,64}$/;

export const isValidChatbotSessionId = (value: unknown): value is string =>
  typeof value === 'string' && CHATBOT_SESSION_ID_PATTERN.test(value);
