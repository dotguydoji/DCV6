import type { Handler } from '@netlify/functions';
import { AdminAuthError, getAdminFirestore, jsonResponse, verifyAdmin } from './lib/adminAuth';
import { checkRateLimit, rateLimitedResponse } from './lib/rateLimit';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const rateLimit = checkRateLimit(event.headers, 'admin-list-product-videos', 30, 60 * 1000);
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
  const snapshot = await db.collection('productVideos').get();

  const productVideos = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      productId: doc.id,
      videos: (data.videos ?? []) as { id: string; title: string; youtubeId: string }[]
    };
  });

  return jsonResponse(200, { productVideos });
};
