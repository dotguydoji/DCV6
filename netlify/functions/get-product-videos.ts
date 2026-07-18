import type { Handler } from '@netlify/functions';
import { OAuth2Client } from 'google-auth-library';
import { getFirestore } from 'firebase-admin/firestore';
import { getFirebaseApp } from './lib/firebase';
import { checkRateLimit, rateLimitedResponse } from './lib/rateLimit';
import { isValidProductId } from './lib/validation';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const RATE_LIMIT_MAX_REQUESTS = 40;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

const denied = (statusCode: number, reason: string) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ authorized: false, reason })
});

// Returns only { id, title } per video - deliberately never the underlying
// youtubeId. A signed-in owner of this product still can't read the raw
// unlisted link list in one shot; they have to click a specific title,
// which calls get-video-embed.ts and re-checks ownership again there.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return denied(405, 'Method not allowed');
  }

  const rateLimit = checkRateLimit(event.headers, 'get-product-videos', RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS);
  if (rateLimit.limited) {
    return rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  let idToken: unknown;
  let productId: unknown;

  try {
    const parsed = JSON.parse(event.body ?? '{}');
    idToken = parsed.idToken;
    productId = parsed.productId;
  } catch {
    return denied(400, 'Invalid request body');
  }

  if (typeof idToken !== 'string' || !idToken || !isValidProductId(productId)) {
    return denied(400, 'Missing idToken or invalid productId');
  }

  let verifiedEmail: string | undefined;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (payload?.email && payload.email_verified) {
      verifiedEmail = payload.email;
    }
  } catch {
    return denied(401, 'Invalid sign-in');
  }
  if (!verifiedEmail) {
    return denied(401, 'Invalid sign-in');
  }

  const app = getFirebaseApp();
  const db = getFirestore(app);

  const buyerDoc = await db.collection('buyers').doc(verifiedEmail).get();
  const productIds: string[] = buyerDoc.exists ? (buyerDoc.data()?.productIds ?? []) : [];

  if (!productIds.includes(productId)) {
    return denied(403, 'Not authorized for this product');
  }

  const videosDoc = await db.collection('productVideos').doc(productId).get();
  const videos = (videosDoc.exists ? videosDoc.data()?.videos : []) as
    | { id: string; title: string }[]
    | undefined;

  const titlesOnly = (videos ?? []).map(({ id, title }) => ({ id, title }));

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authorized: true, videos: titlesOnly })
  };
};
