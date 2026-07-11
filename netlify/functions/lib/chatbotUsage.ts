import type { Firestore } from 'firebase-admin/firestore';

const USAGE_COLLECTION = 'chatbot_usage';

/**
 * Per-IP/per-session rate limiting (rateLimit.ts) is in-memory, which only
 * protects one warm function instance at a time - it can't give a real,
 * site-wide guarantee that the free Gemini tier is never exceeded, since
 * Netlify can run several instances concurrently. This uses Firestore's
 * transactions instead specifically for that one guarantee: a single
 * counter, atomically incremented, shared by every instance and every
 * visitor. Everything else about rate limiting stays in-memory (cheaper,
 * and doesn't need this level of accuracy) - this is only for the hard
 * daily ceiling that protects against ever going over quota / incurring cost.
 */
const getManilaDateKey = (): string => {
  // en-CA gives YYYY-MM-DD directly - avoids manually assembling the string
  // from separately-formatted parts.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
};

export interface DailyBudgetResult {
  allowed: boolean;
  count: number;
}

/**
 * Atomically checks-and-increments today's (Asia/Manila) usage counter.
 * Returns allowed:false without incrementing once the cap is already hit,
 * so the counter never runs past maxPerDay.
 */
export const tryConsumeDailyBudget = async (
  db: Firestore,
  maxPerDay: number
): Promise<DailyBudgetResult> => {
  const docRef = db.collection(USAGE_COLLECTION).doc(getManilaDateKey());

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(docRef);
    const currentCount: number = snapshot.exists ? (snapshot.data()?.count ?? 0) : 0;

    if (currentCount >= maxPerDay) {
      return { allowed: false, count: currentCount };
    }

    const nextCount = currentCount + 1;
    transaction.set(docRef, { count: nextCount }, { merge: true });
    return { allowed: true, count: nextCount };
  });
};
