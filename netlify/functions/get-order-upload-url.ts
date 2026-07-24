import type { Handler } from '@netlify/functions';
import { randomUUID } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { checkRateLimit, checkRateLimitByIdentifier, rateLimitedResponse } from './lib/rateLimit';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
// Two layered limits (see below): a pre-auth per-IP burst limit that
// protects the token-verification step itself from an unauthenticated
// flood, and a per-account limit that's the real anti-spam control since,
// unlike an IP (shared behind mobile carrier CGNAT, or rotated by an
// attacker), it's tied to a real verified Google identity.
const IP_RATE_LIMIT_MAX = 20;
const IP_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const EMAIL_RATE_LIMIT_MAX = 10;
const EMAIL_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const UPLOAD_URL_TTL_SECONDS = 5 * 60;
// Generous for a phone screenshot, but a hard ceiling. Enforced at sign
// time via ContentLength below (not just checked after the fact), so an
// oversized upload is rejected by R2 before the bytes are ever stored.
const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;

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

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp'
};

const denied = (statusCode: number, reason: string) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ authorized: false, reason })
});

/**
 * Mints a presigned PUT for a payment-proof screenshot, in the SAME private
 * bucket the member-only PDFs already live in (never any public bucket)
 * under a payment-proofs/ prefix - private by the exact same guarantee as
 * the PDFs: no public access, ever; only short-lived signed URLs minted
 * server-side after identity verification.
 *
 * The object key is always a server-generated UUID (never client-chosen),
 * so it can't collide with, overwrite, or point at anything else in the
 * bucket, and its 122 bits of randomness mean it can't be guessed - the key
 * is only ever returned to the one verified account that requested it.
 *
 * The presigned URL is bound to a specific ContentType and an exact
 * ContentLength (the client's declared file size, validated <= the cap
 * here), so R2 itself rejects any upload that isn't that size - the size
 * limit is enforced before storage, not merely checked afterwards.
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return denied(405, 'Method not allowed');
  }

  const ipLimit = checkRateLimit(event.headers, 'get-order-upload-url', IP_RATE_LIMIT_MAX, IP_RATE_LIMIT_WINDOW_MS);
  if (ipLimit.limited) {
    return rateLimitedResponse(ipLimit.retryAfterSeconds);
  }

  let idToken: unknown;
  let fileExtension: unknown;
  let contentLength: unknown;

  try {
    const parsed = JSON.parse(event.body ?? '{}');
    idToken = parsed.idToken;
    fileExtension = parsed.fileExtension;
    contentLength = parsed.contentLength;
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
    'get-order-upload-url:email',
    verifiedEmail,
    EMAIL_RATE_LIMIT_MAX,
    EMAIL_RATE_LIMIT_WINDOW_MS
  );
  if (emailLimit.limited) {
    return rateLimitedResponse(emailLimit.retryAfterSeconds);
  }

  const ext = typeof fileExtension === 'string' ? fileExtension.toLowerCase().replace(/^\./, '') : '';
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) {
    return denied(400, 'Screenshot must be a .jpg, .png, or .webp image');
  }

  if (typeof contentLength !== 'number' || !Number.isFinite(contentLength) || contentLength <= 0 || contentLength > MAX_SCREENSHOT_BYTES) {
    return denied(400, 'Screenshot must be a valid image up to 8 MB');
  }

  const key = `payment-proofs/${randomUUID()}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength
  });

  const url = await getSignedUrl(r2Client, command, { expiresIn: UPLOAD_URL_TTL_SECONDS });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authorized: true, url, key })
  };
};
