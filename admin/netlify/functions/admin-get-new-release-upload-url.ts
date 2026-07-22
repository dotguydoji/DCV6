import type { Handler } from '@netlify/functions';
import { randomUUID } from 'crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AdminAuthError, canManageFiles, jsonResponse, verifyAdmin } from './lib/adminAuth';
import { publicR2Client, R2_PUBLIC_BUCKET_NAME } from './lib/publicR2Client';
import { checkRateLimit, rateLimitedResponse } from './lib/rateLimit';
import { THUMBNAIL_PREFIX } from './lib/newReleases';

const UPLOAD_URL_TTL_SECONDS = 5 * 60;

const CONTENT_TYPES: Record<string, string> = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg'
};

// Mints a presigned PUT straight to the PUBLIC images bucket (never the
// private PDF bucket - see publicR2Client.ts) for a New Videos/New PDF
// Releases thumbnail. The key is always server-generated (a fresh UUID),
// never client-supplied, so there's no way for a caller to overwrite an
// unrelated object anywhere else in the bucket.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const rateLimit = checkRateLimit(event.headers, 'admin-get-new-release-upload-url', 10, 60 * 1000);
  if (rateLimit.limited) {
    return rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  let idToken: unknown;
  let fileExtension: unknown;

  try {
    const parsed = JSON.parse(event.body ?? '{}');
    idToken = parsed.idToken;
    fileExtension = parsed.fileExtension;
  } catch {
    return jsonResponse(400, { error: 'Invalid request body' });
  }

  let email: string;
  try {
    email = await verifyAdmin(idToken);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return jsonResponse(403, { error: 'Not authorized' });
    }
    throw err;
  }

  if (!canManageFiles(email)) {
    return jsonResponse(403, { error: 'Not authorized to manage files' });
  }

  const ext = typeof fileExtension === 'string' ? fileExtension.toLowerCase().replace(/^\./, '') : '';
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) {
    return jsonResponse(400, { error: 'Thumbnail must be a .webp, .png, or .jpg image' });
  }

  const key = `${THUMBNAIL_PREFIX}${randomUUID()}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: R2_PUBLIC_BUCKET_NAME,
    Key: key,
    ContentType: contentType
  });

  const url = await getSignedUrl(publicR2Client, command, { expiresIn: UPLOAD_URL_TTL_SECONDS });

  return jsonResponse(200, { url, key });
};
