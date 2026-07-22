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

// The one place the actual unlisted youtubeId is ever sent to a browser -
// re-verifies both sign-in and ownership independently of
// get-product-videos.ts (never trusts that an earlier call already checked
// this), so this endpoint is safe to call on its own too.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return denied(405, 'Method not allowed');
  }

  const rateLimit = checkRateLimit(event.headers, 'get-video-embed', RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS);
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
    return denied(400, 'Invalid request body');
  }

  if (
    typeof idToken !== 'string' || !idToken ||
    !isValidProductId(productId) ||
    typeof videoId !== 'string' || !videoId
  ) {
    return denied(400, 'Missing idToken, productId, or videoId');
  }

  let verifiedEmail: string | undefined;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (payload?.email && payload.email_verified) {
      verifiedEmail = payload.email.toLowerCase();
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
    | { id: string; title: string; youtubeId: string }[]
    | undefined;

  const match = (videos ?? []).find((entry) => entry.id === videoId);
  if (!match) {
    return denied(404, 'Video not found');
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authorized: true, youtubeId: match.youtubeId, title: match.title })
  };
};
