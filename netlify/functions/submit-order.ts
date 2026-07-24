import type { Handler } from '@netlify/functions';
import { randomUUID } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { getFirestore } from 'firebase-admin/firestore';
import { DeleteObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getFirebaseApp } from './lib/firebase';
import { checkRateLimit, checkRateLimitByIdentifier, rateLimitedResponse } from './lib/rateLimit';
import { isValidPaymentProofKey, isValidProductId } from './lib/validation';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const IP_RATE_LIMIT_MAX = 15;
const IP_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const EMAIL_RATE_LIMIT_MAX = 8;
const EMAIL_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY ?? '';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME ?? '';

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY
  }
});

// A backstop only - the real ceiling is enforced at upload time by the
// signed ContentLength in get-order-upload-url.ts. Kept here so a bucket
// object that somehow exceeds it is still rejected rather than accepted.
const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
// The strongest anti-spam control here, and unlike a per-IP limit it can't
// be bypassed by rotating IPs: one account can never have more than this
// many orders waiting for review at once. To open another, an earlier one
// must first be approved/rejected by an admin.
const MAX_PENDING_ORDERS_PER_BUYER = 5;
const MAX_PRODUCT_IDS_PER_ORDER = 20;

const denied = (statusCode: number, reason: string) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ authorized: false, reason })
});

const deleteObjectBestEffort = async (key: string) => {
  try {
    await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
  } catch {
    // Ignored on purpose - only ever runs as cleanup while already rejecting
    // a request; a leftover object is harmless and gets swept later.
  }
};

/**
 * Creates a pending order from an already-uploaded payment-proof screenshot
 * (see get-order-upload-url.ts). Everything a signed-in buyer can do here is
 * scoped to themselves:
 *
 *  - The email the order is filed under is ONLY ever the verified email from
 *    this request's own Google token, never anything the client sends. A
 *    buyer cannot file an order under, or grant access to, anyone else.
 *  - The screenshot key must be a valid payment-proofs/ key (shape-checked,
 *    so it can never point at pdfs/ or anywhere else) AND must correspond to
 *    a real object in the bucket (HeadObject). The key is a 122-bit
 *    server-generated UUID only ever returned to the account that requested
 *    the upload, so it can't be guessed or borrowed to any effect.
 *  - The same screenshot can back only one order, and one account can only
 *    have a bounded number of orders pending review at a time.
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return denied(405, 'Method not allowed');
  }

  const ipLimit = checkRateLimit(event.headers, 'submit-order', IP_RATE_LIMIT_MAX, IP_RATE_LIMIT_WINDOW_MS);
  if (ipLimit.limited) {
    return rateLimitedResponse(ipLimit.retryAfterSeconds);
  }

  let idToken: unknown;
  let key: unknown;
  let productIds: unknown;

  try {
    const parsed = JSON.parse(event.body ?? '{}');
    idToken = parsed.idToken;
    key = parsed.key;
    productIds = parsed.productIds;
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

  const emailLimit = checkRateLimitByIdentifier(
    'submit-order:email',
    verifiedEmail,
    EMAIL_RATE_LIMIT_MAX,
    EMAIL_RATE_LIMIT_WINDOW_MS
  );
  if (emailLimit.limited) {
    return rateLimitedResponse(emailLimit.retryAfterSeconds);
  }

  if (!isValidPaymentProofKey(key)) {
    return denied(400, 'Invalid screenshot reference');
  }
  const screenshotKey = key as string;

  const productIdList = Array.isArray(productIds) ? productIds : [];
  if (
    productIdList.length === 0 ||
    productIdList.length > MAX_PRODUCT_IDS_PER_ORDER ||
    !productIdList.every(isValidProductId)
  ) {
    return denied(400, 'Invalid or missing productIds');
  }

  const app = getFirebaseApp();
  const db = getFirestore(app);

  // Verify the uploaded object is really there, an allowed image type, and
  // within size - never trusted just because a key was supplied.
  try {
    const head = await r2Client.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: screenshotKey }));

    if (
      !head.ContentType ||
      !ALLOWED_CONTENT_TYPES.has(head.ContentType) ||
      !head.ContentLength ||
      head.ContentLength > MAX_SCREENSHOT_BYTES
    ) {
      await deleteObjectBestEffort(screenshotKey);
      return denied(400, 'Uploaded file is not a supported image');
    }
  } catch {
    return denied(400, 'Screenshot upload could not be found - please try uploading again');
  }

  // One screenshot backs one order - prevents the same upload being
  // submitted repeatedly (single-field equality query, no composite index).
  const existingForKey = await db.collection('orders').where('screenshotKey', '==', screenshotKey).limit(1).get();
  if (!existingForKey.empty) {
    return denied(409, 'This screenshot has already been submitted');
  }

  // Single-field query (email only) then count pending in memory - avoids
  // any Firestore composite-index requirement, and one buyer only ever has
  // a handful of orders total, so this stays cheap.
  const buyerOrders = await db.collection('orders').where('email', '==', verifiedEmail).limit(50).get();
  const pendingCount = buyerOrders.docs.filter((doc) => doc.data().status === 'pending').length;

  if (pendingCount >= MAX_PENDING_ORDERS_PER_BUYER) {
    return denied(429, 'You already have several orders awaiting review - please wait for those first');
  }

  const orderId = randomUUID();
  await db.collection('orders').doc(orderId).set({
    email: verifiedEmail,
    productIds: productIdList,
    screenshotKey,
    status: 'pending',
    submittedAt: Date.now()
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authorized: true, orderId })
  };
};
