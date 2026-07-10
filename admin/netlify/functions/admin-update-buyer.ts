import type { Handler } from '@netlify/functions';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { AdminAuthError, getAdminFirestore, jsonResponse, verifyAdmin } from './lib/adminAuth';
import { r2Client, R2_BUCKET_NAME } from './lib/r2Client';
import { checkRateLimit, rateLimitedResponse } from './lib/rateLimit';
import { isValidProductId } from './lib/validation';

// Buyer records are kept for a bounded window rather than indefinitely, to
// stop the buyers collection from growing forever - each grant refreshes
// this forward, so an active/returning buyer's record never gets close to
// it. A record past this point is removed by scheduled-prune-expired-buyers.ts.
// Removal only means the record is gone; re-adding the same Gmail through
// this same endpoint restores it exactly as before.
const RECORD_LIFETIME_MS = 3 * 365 * 24 * 60 * 60 * 1000;

// Only "add" ever needs this check - a well-formed but nonexistent productId
// used to be silently accepted into a buyer's whitelist (harmless in effect,
// since get-pdf.ts would just 404 later, but confusing and easy to miss).
// "remove" of something that was never real is already a no-op either way.
const productFileExists = async (productId: string): Promise<boolean> => {
  try {
    await r2Client.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: `pdfs/${productId}.pdf` }));
    return true;
  } catch {
    return false;
  }
};

type UpdateAction = 'add' | 'remove' | 'delete';

// Firestore's .doc(path) treats "/" as a path separator - an email
// containing one could otherwise target an unexpected nested document
// instead of a real buyers/{email} doc. A real email address can never
// contain "/", "@" exactly once, or whitespace, so this also doubles as
// basic format validation.
const EMAIL_PATTERN = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;

const isUpdateAction = (value: unknown): value is UpdateAction =>
  value === 'add' || value === 'remove' || value === 'delete';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const rateLimit = checkRateLimit(event.headers, 'admin-update-buyer', 30, 60 * 1000);
  if (rateLimit.limited) {
    return rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  let idToken: unknown;
  let email: unknown;
  let action: unknown;
  let productId: unknown;

  try {
    const parsed = JSON.parse(event.body ?? '{}');
    idToken = parsed.idToken;
    email = parsed.email;
    action = parsed.action;
    productId = parsed.productId;
  } catch {
    return jsonResponse(400, { error: 'Invalid request body' });
  }

  try {
    await verifyAdmin(idToken);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return jsonResponse(403, { error: 'Not authorized' });
    }
    throw err;
  }

  if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim()) || !isUpdateAction(action)) {
    return jsonResponse(400, { error: 'Missing or invalid email/action' });
  }

  // Grant/remove accept either a single productId or an array of them, so an
  // admin can assign several PDFs to one buyer in a single request.
  const productIds = Array.isArray(productId) ? productId : [productId];

  if ((action === 'add' || action === 'remove')) {
    if (productIds.length === 0 || !productIds.every(isValidProductId)) {
      return jsonResponse(400, {
        error: 'productId must be lowercase letters, numbers, and hyphens only'
      });
    }
  }

  const normalizedEmail = email.trim().toLowerCase();
  const db = getAdminFirestore();
  const docRef = db.collection('buyers').doc(normalizedEmail);

  if (action === 'delete') {
    await docRef.delete();
    return jsonResponse(200, { ok: true });
  }

  // Already confirmed valid by isValidProductId above for both remaining
  // actions - narrowing explicitly here since TS can't infer it through the
  // earlier combined condition.
  const validatedProductIds = productIds as string[];

  if (action === 'add') {
    const existsResults = await Promise.all(validatedProductIds.map(productFileExists));
    const missing = validatedProductIds.filter((_, index) => !existsResults[index]);
    if (missing.length > 0) {
      return jsonResponse(400, { error: `No uploaded file matches: ${missing.join(', ')}` });
    }
    await docRef.set(
      {
        productIds: FieldValue.arrayUnion(...validatedProductIds),
        expiresAt: Timestamp.fromMillis(Date.now() + RECORD_LIFETIME_MS)
      },
      { merge: true }
    );
    return jsonResponse(200, { ok: true });
  }

  // action === 'remove'
  await docRef.set({ productIds: FieldValue.arrayRemove(...validatedProductIds) }, { merge: true });
  return jsonResponse(200, { ok: true });
};
