import type { Handler } from '@netlify/functions';
import { AdminAuthError, getAdminFirestore, jsonResponse, verifyAdmin } from './lib/adminAuth';
import { checkRateLimit, rateLimitedResponse } from './lib/rateLimit';
import { isValidFirestoreDocId, isValidProductId } from './lib/validation';
import { productFileExists } from './lib/productExists';

const MAX_NAME_LENGTH = 100;

// Creates a new package when `id` is omitted, or fully replaces an existing
// one's name/productIds when `id` matches a real package doc - one endpoint
// for both, since the admin UI's create and edit forms are otherwise
// identical (name + a set of product ids).
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const rateLimit = checkRateLimit(event.headers, 'admin-upsert-package', 30, 60 * 1000);
  if (rateLimit.limited) {
    return rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  let idToken: unknown;
  let id: unknown;
  let name: unknown;
  let productIds: unknown;

  try {
    const parsed = JSON.parse(event.body ?? '{}');
    idToken = parsed.idToken;
    id = parsed.id;
    name = parsed.name;
    productIds = parsed.productIds;
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

  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (!trimmedName || trimmedName.length > MAX_NAME_LENGTH) {
    return jsonResponse(400, { error: `Package name must be 1-${MAX_NAME_LENGTH} characters` });
  }

  if (!Array.isArray(productIds) || productIds.length === 0 || !productIds.every(isValidProductId)) {
    return jsonResponse(400, { error: 'Pick at least one valid product for this package' });
  }
  const uniqueProductIds = Array.from(new Set(productIds as string[]));

  const existsResults = await Promise.all(uniqueProductIds.map(productFileExists));
  const missing = uniqueProductIds.filter((_, index) => !existsResults[index]);
  if (missing.length > 0) {
    return jsonResponse(400, { error: `No uploaded file matches: ${missing.join(', ')}` });
  }

  if (id !== undefined && id !== null && !isValidFirestoreDocId(id)) {
    return jsonResponse(400, { error: 'Invalid package id' });
  }

  const db = getAdminFirestore();
  const docRef = typeof id === 'string' && id ? db.collection('packages').doc(id) : db.collection('packages').doc();

  await docRef.set({ name: trimmedName, productIds: uniqueProductIds });

  return jsonResponse(200, { id: docRef.id });
};
