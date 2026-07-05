import type { Handler } from '@netlify/functions';
import { FieldValue } from 'firebase-admin/firestore';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { AdminAuthError, getAdminFirestore, jsonResponse, verifyAdmin } from './lib/adminAuth';
import { r2Client, R2_BUCKET_NAME } from './lib/r2Client';
import { checkRateLimit, rateLimitedResponse } from './lib/rateLimit';
import { isValidProductId } from './lib/validation';

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

  if ((action === 'add' || action === 'remove') && !isValidProductId(productId)) {
    return jsonResponse(400, {
      error: 'productId must be lowercase letters, numbers, and hyphens only'
    });
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
  const validatedProductId = productId as string;

  if (action === 'add') {
    if (!(await productFileExists(validatedProductId))) {
      return jsonResponse(400, { error: 'No uploaded file matches this product id' });
    }
    await docRef.set({ productIds: FieldValue.arrayUnion(validatedProductId) }, { merge: true });
    return jsonResponse(200, { ok: true });
  }

  // action === 'remove'
  await docRef.set({ productIds: FieldValue.arrayRemove(validatedProductId) }, { merge: true });
  return jsonResponse(200, { ok: true });
};
