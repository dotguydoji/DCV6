import type { Handler } from '@netlify/functions';
import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Timestamp } from 'firebase-admin/firestore';
import { AdminAuthError, getAdminFirestore, jsonResponse, verifyAdmin } from './lib/adminAuth';
import { r2Client, R2_BUCKET_NAME } from './lib/r2Client';
import { checkRateLimit, rateLimitedResponse } from './lib/rateLimit';
import { isValidBackupPayload } from './lib/backupTypes';

const BACKUP_PREFIX = 'backups/buyers/';

// Firestore batched writes are capped at 500 operations each - same cap
// scheduled-prune-expired-buyers.ts already works around the same way.
const BATCH_SIZE = 500;

/**
 * Restores every buyer from the most recently created backup file.
 *
 * Deliberately takes no input beyond the admin's own idToken - there is no
 * "pick which backup" or "pick a file" option, so there is nothing for a
 * client to supply that could point this at an unexpected object. It
 * always restores the single latest backup, found the same way
 * admin-backup-status.ts finds it (R2's own LastModified).
 *
 * Safety model, in order:
 *  1. The backup file is fetched and parsed, but NOTHING is written to
 *     Firestore until every single record in it has been validated. A
 *     backup that's even partially malformed/corrupted is rejected
 *     entirely - never partially applied.
 *  2. Each buyer record is written with `.set()` (not merge, not
 *     arrayUnion) so it exactly matches what the backup says - but this
 *     only ever touches buyers that are actually IN the backup. A buyer
 *     who exists right now but isn't in that backup snapshot (e.g. added
 *     after the backup ran) is left completely alone - restore can only
 *     add/overwrite, it can never delete a current buyer.
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  // Deliberately tight - this is a rare, sensitive, admin-initiated action,
  // not something that should ever be called in a tight loop.
  const rateLimit = checkRateLimit(event.headers, 'admin-restore-buyers', 3, 10 * 60 * 1000);
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
    return jsonResponse(400, { error: 'No backup exists yet to restore from.' });
  }

  const latest = objects.reduce((newest, item) =>
    (item.LastModified?.getTime() ?? 0) > (newest.LastModified?.getTime() ?? 0) ? item : newest
  );
  if (!latest.Key) {
    return jsonResponse(400, { error: 'No backup exists yet to restore from.' });
  }

  const getResult = await r2Client.send(new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: latest.Key }));
  const rawBody = await getResult.Body?.transformToString();
  if (!rawBody) {
    return jsonResponse(500, { error: 'The backup file could not be read.' });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return jsonResponse(500, { error: 'The backup file is not valid JSON - restore was NOT performed.' });
  }

  // Whole-file validation gate - see isValidBackupPayload's own comment.
  // Nothing below this line runs unless every record in the file passed.
  if (!isValidBackupPayload(parsed)) {
    return jsonResponse(500, { error: 'The backup file is malformed - restore was NOT performed to avoid writing bad data.' });
  }

  const db = getAdminFirestore();
  const { buyers } = parsed;

  for (let i = 0; i < buyers.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const buyer of buyers.slice(i, i + BATCH_SIZE)) {
      const docRef = db.collection('buyers').doc(buyer.email);
      batch.set(docRef, {
        productIds: buyer.productIds,
        expiresAt: buyer.expiresAt ? Timestamp.fromDate(new Date(buyer.expiresAt)) : null
      });
    }
    await batch.commit();
  }

  console.log(`admin-restore-buyers: restored ${buyers.length} buyer(s) from ${latest.Key}`);

  return jsonResponse(200, { ok: true, restoredCount: buyers.length, backupCreatedAt: parsed.createdAt });
};
