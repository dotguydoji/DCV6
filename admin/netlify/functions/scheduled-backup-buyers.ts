import type { Handler } from '@netlify/functions';
import { schedule } from '@netlify/functions';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import type { Timestamp } from 'firebase-admin/firestore';
import { getAdminFirestore } from './lib/adminAuth';
import { r2Client, R2_BUCKET_NAME } from './lib/r2Client';
import { checkRateLimit, rateLimitedResponse } from './lib/rateLimit';
import {
  PRODUCTIVITY_SUBSCRIPTION_PERIOD_DAYS,
  PRODUCTIVITY_SUBSCRIPTION_PERIOD_MS,
  type BackupBuyerRecord,
  type BackupPayload
} from './lib/backupTypes';

// Same private bucket the PDFs themselves live in (no public bucket policy
// or public r2.dev URL exists for it anywhere in this project - every real
// PDF read already goes through a signed, time-limited URL minted
// server-side, never a bare public link). Reusing it means this feature
// needs zero new Cloudflare setup - the credentials and bucket are already
// configured for the admin site. A distinct "backups/" prefix keeps these
// files separate from the "pdfs/" ones without needing a second bucket.
const BACKUP_PREFIX = 'backups/buyers/';

const backupBuyers: Handler = async (event) => {
  // Defense-in-depth only, same reasoning as scheduled-prune-expired-buyers.ts -
  // schedule()-wrapped functions aren't meant to be reachable over the open
  // internet at all. This never returns buyer data even if somehow called.
  const rateLimit = checkRateLimit(event.headers, 'scheduled-backup-buyers', 3, 60 * 60 * 1000);
  if (rateLimit.limited) {
    return rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  const db = getAdminFirestore();
  const snapshot = await db.collection('buyers').get();

  // One fixed "now" for the whole run, so every buyer's "days remaining"
  // and the payload's own createdAt agree with each other exactly - calling
  // Date.now()/new Date() separately per record could let them drift by a
  // few milliseconds across a large collection.
  const backupTimeMs = Date.now();

  const buyers: BackupBuyerRecord[] = snapshot.docs.map((doc) => {
    const data = doc.data();
    const expiresAt = data.expiresAt as Timestamp | undefined;
    const productivitySubscribedAt = data.productivitySubscribedAt as Timestamp | undefined;

    // The three fields below are purely derived from productivitySubscribedAt
    // (the actual source of truth, restored as-is by admin-restore-buyers.ts) -
    // computed once here so the backup file itself is readable/auditable
    // without doing the 30-day math by hand every time someone opens it.
    let productivitySubscriptionExpiresAt: string | null = null;
    let productivitySubscriptionDaysRemainingAtBackup: number | null = null;
    if (productivitySubscribedAt) {
      const expiresAtMs = productivitySubscribedAt.toMillis() + PRODUCTIVITY_SUBSCRIPTION_PERIOD_MS;
      productivitySubscriptionExpiresAt = new Date(expiresAtMs).toISOString();
      productivitySubscriptionDaysRemainingAtBackup = Math.max(
        0,
        Math.ceil((expiresAtMs - backupTimeMs) / (24 * 60 * 60 * 1000))
      );
    }

    return {
      email: doc.id,
      productIds: (data.productIds ?? []) as string[],
      expiresAt: expiresAt ? expiresAt.toDate().toISOString() : null,
      productivitySubscribedAt: productivitySubscribedAt ? productivitySubscribedAt.toDate().toISOString() : null,
      productivitySubscriptionExpiresAt,
      productivitySubscriptionDurationDays: productivitySubscribedAt ? PRODUCTIVITY_SUBSCRIPTION_PERIOD_DAYS : null,
      productivitySubscriptionDaysRemainingAtBackup
    };
  });

  const createdAt = new Date(backupTimeMs).toISOString();
  const payload: BackupPayload = { createdAt, count: buyers.length, buyers };

  // ":" isn't safe in an R2/S3 object key on every client, so the timestamp
  // in the filename itself is sanitized - the real, exact createdAt is also
  // stored inside the file and as object metadata below, so nothing is lost.
  const key = `${BACKUP_PREFIX}${createdAt.replace(/:/g, '-')}.json`;

  await r2Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: JSON.stringify(payload),
      ContentType: 'application/json',
      // Lets the status-check endpoint answer "when was the last backup,
      // how many buyers" from object metadata alone (a cheap HEAD request),
      // without ever having to read/parse the actual backup body.
      Metadata: { count: String(buyers.length), createdat: createdAt }
    })
  );

  // Count only - no emails or product ids - same logging convention as
  // scheduled-prune-expired-buyers.ts. Nothing sensitive ever gets logged.
  console.log(`scheduled-backup-buyers: backed up ${buyers.length} buyer(s) to ${key}`);

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, count: buyers.length })
  };
};

// Runs once a day at 19:00 UTC = 3:00 AM Philippine Time (UTC+8) - matches
// the owner's actual local schedule, same reasoning as
// scheduled-expire-productivity.ts's 16:00 UTC (= midnight PHT) choice.
// Netlify's scheduler runs on UTC, not the site owner's local timezone, so
// this offset is what actually lands the run at 3 AM PHT.
export const handler = schedule('0 19 * * *', backupBuyers);
