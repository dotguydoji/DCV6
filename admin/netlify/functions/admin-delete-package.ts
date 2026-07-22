import type { Handler } from '@netlify/functions';
import { AdminAuthError, getAdminFirestore, jsonResponse, verifyAdmin } from './lib/adminAuth';
import { checkRateLimit, rateLimitedResponse } from './lib/rateLimit';
import { isValidFirestoreDocId } from './lib/validation';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const rateLimit = checkRateLimit(event.headers, 'admin-delete-package', 30, 60 * 1000);
  if (rateLimit.limited) {
    return rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  let idToken: unknown;
  let id: unknown;

  try {
    const parsed = JSON.parse(event.body ?? '{}');
    idToken = parsed.idToken;
    id = parsed.id;
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

  if (!isValidFirestoreDocId(id)) {
    return jsonResponse(400, { error: 'Missing or invalid package id' });
  }

  // Deletes the package shortcut only - it never granted anyone anything
  // directly (BuyersPanel expands it into individual productIds at grant
  // time), so buyers who already received those PDFs keep them untouched.
  await getAdminFirestore().collection('packages').doc(id).delete();

  return jsonResponse(200, { ok: true });
};
