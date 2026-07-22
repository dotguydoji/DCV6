import type { Handler } from '@netlify/functions';
import { OAuth2Client } from 'google-auth-library';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { checkRateLimit, rateLimitedResponse } from './lib/rateLimit';
import { isValidProductId } from './lib/validation';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
// Deliberately revised from 5 to 11 minutes (owner decision, 2026-07-13) to
// cut how often the client needs to re-hit this function during a long
// reading session - previously every ~4 minutes, now every ~10. This is a
// real, accepted tradeoff: a leaked/logged/shared signed URL now stays
// usable for ~11 minutes instead of ~5 before needing re-authorization.
// Must match SIGNED_URL_LIFETIME_MS in src/components/PdfViewer.tsx and
// PDF_URL_CACHE_TTL_MS in src/components/PdfGatePage.tsx - keep all three synced.
const SIGNED_URL_TTL_SECONDS = 11 * 60;
// Was 20/min - raised after real reload-heavy usage (a buyer or the owner
// refreshing repeatedly while testing) hit this limit during normal, non-
// abusive use. 40/min is still well below what a scripted abuse attempt
// would need, but gives real humans reloading a page much more headroom.
const RATE_LIMIT_MAX_REQUESTS = 40;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY ?? '';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME ?? '';

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

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY
  }
});

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
    'get-pdf',
    RATE_LIMIT_MAX_REQUESTS,
    RATE_LIMIT_WINDOW_MS
  );
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

  if (typeof idToken !== 'string' || typeof productId !== 'string' || !idToken || !productId) {
    return denied(400, 'Missing idToken or productId');
  }

  // Defense in depth: productId ends up in an R2 object key below. It can
  // only ever match an entry already in the buyer's own whitelist (set via
  // the admin panel), but validating the shape here too prevents any
  // path-traversal-style key ever being built, regardless of how it got in.
  if (!isValidProductId(productId)) {
    return denied(400, 'Invalid productId');
  }

  let verifiedEmail: string | undefined;

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID
    });
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
    return denied(403, 'Not authorized for this PDF');
  }

  const objectKey = `pdfs/${productId}.pdf`;

  try {
    const command = new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: objectKey });
    const url = await getSignedUrl(r2Client, command, { expiresIn: SIGNED_URL_TTL_SECONDS });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorized: true, url })
    };
  } catch {
    return denied(404, 'PDF not found');
  }
};
