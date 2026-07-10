import type { Handler } from '@netlify/functions';
import { Timestamp } from 'firebase-admin/firestore';
import { AdminAuthError, getAdminFirestore, jsonResponse, verifyAdmin } from './lib/adminAuth';
import { checkRateLimit, rateLimitedResponse } from './lib/rateLimit';

// Matches admin-update-buyer.ts's RECORD_LIFETIME_MS - kept as a separate
// constant since this is a one-time migration path, not the normal grant
// flow, and shouldn't silently drift if that one is ever tuned differently.
const RECORD_LIFETIME_MS = 3 * 365 * 24 * 60 * 60 * 1000;

// Firestore batched writes are capped at 500 operations each.
const BATCH_SIZE = 500;

/**
 * One-time (idempotent, safe to run repeatedly) migration: gives every
 * buyer record that predates the expiry field a fresh 3-year window from
 * today, so they're not permanently exempt from the same lifecycle every
 * new grant already gets. Only ever touches records missing the field -
 * never overwrites an expiry a buyer already has.
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const rateLimit = checkRateLimit(event.headers, 'admin-backfill-expiry', 5, 60 * 1000);
  if (rateLimit.limited) {
    return rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  let idToken: unknown;
  try {
    idToken = JSON.parse(event.body ?? '{}').idToken;
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

  const db = getAdminFirestore();
  const snapshot = await db.collection('buyers').get();
  const missingExpiry = snapshot.docs.filter((doc) => !doc.data().expiresAt);

  const expiresAt = Timestamp.fromMillis(Date.now() + RECORD_LIFETIME_MS);

  for (let i = 0; i < missingExpiry.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const doc of missingExpiry.slice(i, i + BATCH_SIZE)) {
      batch.set(doc.ref, { expiresAt }, { merge: true });
    }
    await batch.commit();
  }

  return jsonResponse(200, { updated: missingExpiry.length });
};
