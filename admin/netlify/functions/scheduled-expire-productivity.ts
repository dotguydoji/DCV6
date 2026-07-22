import type { Handler } from '@netlify/functions';
import { schedule } from '@netlify/functions';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminFirestore } from './lib/adminAuth';
import { checkRateLimit, rateLimitedResponse } from './lib/rateLimit';
import { PRODUCTIVITY_SUBSCRIPTION_PRODUCT_ID } from './lib/productivityFeatures';

// Deliberately not using Firestore's own TTL policy field (the same reason
// the 3-year buyer-record lifetime doesn't either) - Firestore TTL requires
// a paid plan's scheduled-deletion feature isn't guaranteed on the free
// Spark tier, so this mirrors scheduled-prune-expired-buyers.ts's approach
// instead: a plain Netlify scheduled function doing the sweep itself, at
// zero extra hosting cost.
const SUBSCRIPTION_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 500;

const expireProductivitySubscriptions: Handler = async (event) => {
  // Defense-in-depth only, same reasoning as scheduled-prune-expired-buyers.ts -
  // schedule()-wrapped functions aren't meant to be reachable over the open
  // internet at all.
  const rateLimit = checkRateLimit(event.headers, 'scheduled-expire-productivity', 3, 60 * 60 * 1000);
  if (rateLimit.limited) {
    return rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  const db = getAdminFirestore();
  // array-contains + an inequality on a different field isn't a supported
  // Firestore query, so the productivitySubscribedAt cutoff is applied in
  // code below instead of in the query itself - the buyers collection is
  // small enough (a Gmail whitelist, not a general user table) for this to
  // stay cheap.
  const snapshot = await db
    .collection('buyers')
    .where('productIds', 'array-contains', PRODUCTIVITY_SUBSCRIPTION_PRODUCT_ID)
    .get();

  const now = Date.now();
  const expiredDocs = snapshot.docs.filter((doc) => {
    const subscribedAt = doc.data().productivitySubscribedAt as Timestamp | undefined;
    if (!subscribedAt) return true; // No recorded start date - can't be a valid active subscription, clean it up.
    return subscribedAt.toMillis() + SUBSCRIPTION_PERIOD_MS <= now;
  });

  for (let i = 0; i < expiredDocs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const doc of expiredDocs.slice(i, i + BATCH_SIZE)) {
      batch.set(
        doc.ref,
        {
          productIds: FieldValue.arrayRemove(PRODUCTIVITY_SUBSCRIPTION_PRODUCT_ID),
          productivitySubscribedAt: FieldValue.delete()
        },
        { merge: true }
      );
    }
    await batch.commit();
  }

  // Count only - no emails - same logging convention as
  // scheduled-prune-expired-buyers.ts. Nothing sensitive ever gets logged.
  console.log(`scheduled-expire-productivity: expired ${expiredDocs.length} subscription(s)`);

  return {
    statusCode: 200,
    body: JSON.stringify({ expired: expiredDocs.length })
  };
};

// Runs once a day at 16:00 UTC = midnight Philippine Time (UTC+8), per the
// owner's request for a daily midnight sweep - note this is NOT midnight
// UTC (see scheduled-backup-buyers.ts, which intentionally runs at 00:00
// UTC instead).
export const handler = schedule('0 16 * * *', expireProductivitySubscriptions);
