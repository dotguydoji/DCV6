import type { Handler } from '@netlify/functions';
import { HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { AdminAuthError, jsonResponse, verifyAdmin } from './lib/adminAuth';
import { r2Client, R2_BUCKET_NAME } from './lib/r2Client';
import { checkRateLimit, rateLimitedResponse } from './lib/rateLimit';

const BACKUP_PREFIX = 'backups/buyers/';

/**
 * Lets the admin panel show "last backup: <when>, <count> buyers" as
 * reassurance that the daily backup is actually running - without ever
 * reading the backup file's actual body. Finds the most recent object by
 * R2's own LastModified (not by parsing the filename), then reads only
 * that one object's metadata via a HEAD request - the buyer list itself is
 * never fetched here.
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const rateLimit = checkRateLimit(event.headers, 'admin-backup-status', 30, 60 * 1000);
  if (rateLimit.limited) {
    return rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  let idToken: unknown;
  try {
    idToken = JSON.parse(event.body ?? '{}').idToken;
  } catch {
    return jsonResponse(400, { error: 'Invalid request body' });
  }

  try {
    await verifyAdmin(idToken);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return jsonResponse(403, { error: 'Not authorized' });
    }
    throw err;
  }

  const listResult = await r2Client.send(
    new ListObjectsV2Command({ Bucket: R2_BUCKET_NAME, Prefix: BACKUP_PREFIX })
  );

  const objects = listResult.Contents ?? [];
  if (objects.length === 0) {
    return jsonResponse(200, { lastBackupAt: null, count: null });
  }

  const latest = objects.reduce((newest, item) =>
    (item.LastModified?.getTime() ?? 0) > (newest.LastModified?.getTime() ?? 0) ? item : newest
  );

  if (!latest.Key) {
    return jsonResponse(200, { lastBackupAt: null, count: null });
  }

  const head = await r2Client.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: latest.Key }));
  const count = head.Metadata?.count ? Number(head.Metadata.count) : null;
  const createdAt = head.Metadata?.createdat ?? latest.LastModified?.toISOString() ?? null;

  return jsonResponse(200, { lastBackupAt: createdAt, count: Number.isFinite(count) ? count : null });
};
