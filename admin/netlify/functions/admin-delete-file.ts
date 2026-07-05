import type { Handler } from '@netlify/functions';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { AdminAuthError, canManageFiles, jsonResponse, verifyAdmin } from './lib/adminAuth';
import { r2Client, R2_BUCKET_NAME } from './lib/r2Client';
import { checkRateLimit, rateLimitedResponse } from './lib/rateLimit';
import { isValidProductId } from './lib/validation';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const rateLimit = checkRateLimit(event.headers, 'admin-delete-file', 10, 60 * 1000);
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
    return jsonResponse(400, { error: 'Invalid productId' });
  }

  await r2Client.send(
    new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: `pdfs/${productId}.pdf` })
  );

  return jsonResponse(200, { ok: true });
};
