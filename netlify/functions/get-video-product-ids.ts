import type { Handler } from '@netlify/functions';
import { getFirestore } from 'firebase-admin/firestore';
import { getFirebaseApp } from './lib/firebase';
import { checkRateLimit, rateLimitedResponse } from './lib/rateLimit';

// Which product ids have any bonus videos at all is not sensitive on its
// own - every product id in this list is already public (shipped in
// src/constants.ts to every visitor). This only lets the client decide
// whether to show a "Bonus Videos" affordance on a product the buyer
// already owns, without a Firestore round trip per product. The actual
// titles and unlisted video ids stay gated behind get-product-videos.ts /
// get-video-embed.ts, which do require proof of ownership.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const rateLimit = checkRateLimit(event.headers, 'get-video-product-ids', 60, 60 * 1000);
  if (rateLimit.limited) {
    return rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  const app = getFirebaseApp();
  const db = getFirestore(app);

  const snapshot = await db.collection('productVideos').select().get();
  const productIds = snapshot.docs.map((doc) => doc.id);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productIds })
  };
};
