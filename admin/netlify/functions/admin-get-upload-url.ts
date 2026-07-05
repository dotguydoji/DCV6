import type { Handler } from '@netlify/functions';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AdminAuthError, canManageFiles, jsonResponse, verifyAdmin } from './lib/adminAuth';
import { r2Client, R2_BUCKET_NAME } from './lib/r2Client';
import { checkRateLimit, rateLimitedResponse } from './lib/rateLimit';
import { isValidProductId } from './lib/validation';

const UPLOAD_URL_TTL_SECONDS = 5 * 60;

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const rateLimit = checkRateLimit(event.headers, 'admin-get-upload-url', 10, 60 * 1000);
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

  if (!isValidProductId(productId)) {
    return jsonResponse(400, {
      error: 'productId must be lowercase letters, numbers, and hyphens only'
    });
  }

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: `pdfs/${productId}.pdf`,
    ContentType: 'application/pdf'
  });

  const url = await getSignedUrl(r2Client, command, { expiresIn: UPLOAD_URL_TTL_SECONDS });

  return jsonResponse(200, { url });
};
