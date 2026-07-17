import type { Handler } from '@netlify/functions';
import { schedule } from '@netlify/functions';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import type { Timestamp } from 'firebase-admin/firestore';
import { getAdminFirestore } from './lib/adminAuth';
import { r2Client, R2_BUCKET_NAME } from './lib/r2Client';
import { checkRateLimit, rateLimitedResponse } from './lib/rateLimit';
import type { BackupBuyerRecord, BackupPayload } from './lib/backupTypes';

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

  const buyers: BackupBuyerRecord[] = snapshot.docs.map((doc) => {
    const data = doc.data();
    const expiresAt = data.expiresAt as Timestamp | undefined;
    return {
      email: doc.id,
      productIds: (data.productIds ?? []) as string[],
      expiresAt: expiresAt ? expiresAt.toDate().toISOString() : null
    };
  });

  const createdAt = new Date().toISOString();
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

// Runs once a day at exactly midnight UTC. Netlify's scheduler runs on UTC,
// not the site owner's local timezone - worth keeping in mind since
// "midnight" here may not be midnight wherever you are.
export const handler = schedule('0 0 * * *', backupBuyers);
