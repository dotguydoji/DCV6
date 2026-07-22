import type { Handler } from '@netlify/functions';
import type { Timestamp } from 'firebase-admin/firestore';
import { AdminAuthError, getAdminFirestore, jsonResponse, verifyAdmin } from './lib/adminAuth';
import { checkRateLimit, rateLimitedResponse } from './lib/rateLimit';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const rateLimit = checkRateLimit(event.headers, 'admin-list-buyers', 30, 60 * 1000);
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

  const db = getAdminFirestore();
  const snapshot = await db.collection('buyers').get();

  const buyers = snapshot.docs.map((doc) => {
    const data = doc.data();
    const expiresAt = data.expiresAt as Timestamp | undefined;
    const productivitySubscribedAt = data.productivitySubscribedAt as Timestamp | undefined;
    return {
      email: doc.id,
      productIds: (data.productIds ?? []) as string[],
      expiresAt: expiresAt ? expiresAt.toDate().toISOString() : null,
      productivitySubscribedAt: productivitySubscribedAt ? productivitySubscribedAt.toDate().toISOString() : null
    };
  });

  return jsonResponse(200, { buyers });
};
