import type { Handler } from '@netlify/functions';
import { OAuth2Client } from 'google-auth-library';
import { getFirestore } from 'firebase-admin/firestore';
import { getFirebaseApp } from './lib/firebase';
import { checkRateLimit, rateLimitedResponse } from './lib/rateLimit';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const RATE_LIMIT_MAX_REQUESTS = 40;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

const denied = (statusCode: number, reason: string) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ authorized: false, reason })
});

/**
 * Lets a signed-in buyer see the status of their own recent order
 * submissions (pending / approved / rejected, plus the admin's optional
 * one-way message on a rejection) - the same identity-scoping every other
 * buyer-facing function here uses: only ever the verified email from this
 * request's own idToken, never a client-supplied one, so a buyer can only
 * ever see their own orders.
 *
 * Deliberately never returns screenshotKey - the buyer has no legitimate
 * reason to have that value, and not returning it removes any chance of it
 * being probed or reused client-side.
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return denied(405, 'Method not allowed');
  }

  const rateLimit = checkRateLimit(event.headers, 'get-my-orders', RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS);
  if (rateLimit.limited) {
    return rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  let idToken: unknown;
  try {
    idToken = JSON.parse(event.body ?? '{}').idToken;
  } catch {
    return denied(400, 'Invalid request body');
  }

  if (typeof idToken !== 'string' || !idToken) {
    return denied(400, 'Missing idToken');
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

  // Sorted in memory rather than via .orderBy() - see admin-list-orders.ts
  // for why (avoids needing a Firestore composite index for no real benefit,
  // since one buyer only ever has a handful of orders at most).
  const snap = await db.collection('orders').where('email', '==', verifiedEmail).limit(50).get();
  const sortedDocs = snap.docs.sort((a, b) => (b.data().submittedAt ?? 0) - (a.data().submittedAt ?? 0)).slice(0, 10);

  const orders = sortedDocs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      productIds: Array.isArray(data.productIds) ? data.productIds : [],
      status: data.status ?? 'pending',
      submittedAt: data.submittedAt ?? null,
      reviewMessage: data.reviewMessage ?? null
    };
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authorized: true, orders })
  };
};
