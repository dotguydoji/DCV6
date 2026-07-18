import type { Handler } from '@netlify/functions';
import { AdminAuthError, getAdminFirestore, jsonResponse, verifyAdmin } from './lib/adminAuth';
import { checkRateLimit, rateLimitedResponse } from './lib/rateLimit';
import { isValidProductId } from './lib/validation';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const rateLimit = checkRateLimit(event.headers, 'admin-delete-product-video', 30, 60 * 1000);
  if (rateLimit.limited) {
    return rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  let idToken: unknown;
  let productId: unknown;
  let videoId: unknown;

  try {
    const parsed = JSON.parse(event.body ?? '{}');
    idToken = parsed.idToken;
    productId = parsed.productId;
    videoId = parsed.videoId;
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

  if (!isValidProductId(productId) || typeof videoId !== 'string' || !videoId) {
    return jsonResponse(400, { error: 'Missing productId or videoId' });
  }

  const db = getAdminFirestore();
  const docRef = db.collection('productVideos').doc(productId);

  await db.runTransaction(async (tx) => {
    const doc = await tx.get(docRef);
    if (!doc.exists) return;

    const videos = (doc.data()?.videos ?? []) as { id: string }[];
    const remaining = videos.filter((entry) => entry.id !== videoId);

    if (remaining.length === 0) {
      tx.delete(docRef);
    } else {
      tx.set(docRef, { videos: remaining });
    }
  });

  return jsonResponse(200, { ok: true });
};
