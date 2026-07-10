import type { Handler } from '@netlify/functions';
import { schedule } from '@netlify/functions';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminFirestore } from './lib/adminAuth';
import { checkRateLimit, rateLimitedResponse } from './lib/rateLimit';

// Firestore batched writes are capped at 500 operations each.
const BATCH_SIZE = 500;

const pruneExpiredBuyers: Handler = async (event) => {
  // Rate-limited the same way every other function here is, purely as
  // cheap defense-in-depth - see the comment on `handler` below for why
  // this shouldn't be reachable at all under normal circumstances.
  const rateLimit = checkRateLimit(event.headers, 'scheduled-prune-expired-buyers', 3, 60 * 60 * 1000);
  if (rateLimit.limited) {
    return rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  const db = getAdminFirestore();
  const snapshot = await db.collection('buyers').where('expiresAt', '<=', Timestamp.now()).get();

  for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const doc of snapshot.docs.slice(i, i + BATCH_SIZE)) {
      batch.delete(doc.ref);
    }
    await batch.commit();
  }

  // Count only - no emails or product ids - just enough to confirm this ran
  // and see roughly how much it's doing, visible in Netlify's own function
  // logs. Nothing sensitive ever gets logged here.
  console.log(`scheduled-prune-expired-buyers: removed ${snapshot.docs.length} record(s)`);

  return {
    statusCode: 200,
    body: JSON.stringify({ deleted: snapshot.docs.length })
  };
};

// Runs once a day. Netlify documents schedule()-wrapped functions as not
// directly callable over the open internet the way a normal function is -
// that guarantee is enforced by Netlify's own infrastructure, not by
// anything in this file, so treat it as a platform assumption to
// periodically confirm against Netlify's current docs rather than a proven
// fact. The rate limit above and the logic itself are this file's own
// defense-in-depth regardless: it takes no input, reveals nothing in its
// response, and only ever deletes records already past their own stored
// expiry - so even a worst-case unauthorized call can't do more than run
// the same cleanup a few hours early.
export const handler = schedule('0 3 * * *', pruneExpiredBuyers);
