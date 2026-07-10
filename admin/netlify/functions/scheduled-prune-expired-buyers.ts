import type { Handler } from '@netlify/functions';
import { schedule } from '@netlify/functions';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminFirestore } from './lib/adminAuth';

// Firestore batched writes are capped at 500 operations each.
const BATCH_SIZE = 500;

const pruneExpiredBuyers: Handler = async () => {
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

// Runs once a day. schedule() makes this unreachable via a normal HTTP
// request - only Netlify's own scheduler can invoke it - so this doesn't
// need the verifyAdmin check every other function in this folder has;
// there's no external caller to authorize in the first place. Even if that
// guarantee were ever somehow bypassed, this only ever deletes records
// already past their own stored expiry - it accepts no input and reveals
// nothing.
export const handler = schedule('0 3 * * *', pruneExpiredBuyers);
