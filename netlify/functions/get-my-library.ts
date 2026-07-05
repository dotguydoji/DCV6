import type { Handler } from '@netlify/functions';
import { OAuth2Client } from 'google-auth-library';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { checkRateLimit, rateLimitedResponse } from './lib/rateLimit';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
// Was 20/min - raised for the same reason as get-pdf.ts's identical change:
// real reload-heavy use (not abuse) was hitting this limit too easily.
const RATE_LIMIT_MAX_REQUESTS = 40;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

const getFirebaseApp = () => {
  if (getApps().length) {
    return getApps()[0];
  }

  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT ?? '{}');
  return initializeApp({
    credential: cert(serviceAccount)
  });
};

const denied = (statusCode: number, reason: string) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ authorized: false, reason })
});

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return denied(405, 'Method not allowed');
  }

  const rateLimit = checkRateLimit(
    event.headers,
    'get-my-library',
    RATE_LIMIT_MAX_REQUESTS,
    RATE_LIMIT_WINDOW_MS
  );
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

  // The buyer's identity comes only from the verified Google token below -
  // never from anything client-supplied - so a signed-in user can only ever
  // read their own buyers/{email} document, never anyone else's.
  let verifiedEmail: string | undefined;

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID
    });
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

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authorized: true, productIds })
  };
};
