import type { Handler } from '@netlify/functions';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { AdminAuthError, canManageFiles, jsonResponse, verifyAdmin } from './lib/adminAuth';
import { r2Client, R2_BUCKET_NAME } from './lib/r2Client';
import { checkRateLimit, rateLimitedResponse } from './lib/rateLimit';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const rateLimit = checkRateLimit(event.headers, 'admin-list-files', 30, 60 * 1000);
  if (rateLimit.limited) {
    return rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  let idToken: unknown;
  try {
    idToken = JSON.parse(event.body ?? '{}').idToken;
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

  const result = await r2Client.send(
    new ListObjectsV2Command({ Bucket: R2_BUCKET_NAME, Prefix: 'pdfs/' })
  );

  const files = (result.Contents ?? [])
    .filter((item) => item.Key && item.Key.endsWith('.pdf'))
    .map((item) => ({
      productId: item.Key!.replace(/^pdfs\//, '').replace(/\.pdf$/, ''),
      key: item.Key!,
      sizeBytes: item.Size ?? 0,
      lastModified: item.LastModified?.toISOString() ?? null
    }));

  return jsonResponse(200, { files, canManageFiles: canManageFiles(email) });
};
