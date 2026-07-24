import type { Handler } from '@netlify/functions';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AdminAuthError, getAdminFirestore, jsonResponse, verifyAdmin } from './lib/adminAuth';
import { r2Client, R2_BUCKET_NAME } from './lib/r2Client';
import { checkRateLimit, rateLimitedResponse } from './lib/rateLimit';
import { isValidPaymentProofKey } from './lib/validation';

// Read-only for any admin (no canManageFiles gate) - same posture as
// admin-list-files.ts/admin-list-new-releases.ts.
const SCREENSHOT_URL_TTL_SECONDS = 10 * 60;

type OrderStatus = 'pending' | 'approved' | 'rejected';

const isOrderStatus = (value: unknown): value is OrderStatus =>
  value === 'pending' || value === 'approved' || value === 'rejected';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const rateLimit = checkRateLimit(event.headers, 'admin-list-orders', 30, 60 * 1000);
  if (rateLimit.limited) {
    return rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  let idToken: unknown;
  let status: unknown;

  try {
    const parsed = JSON.parse(event.body ?? '{}');
    idToken = parsed.idToken;
    status = parsed.status;
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

  const filterStatus: OrderStatus = isOrderStatus(status) ? status : 'pending';

  const db = getAdminFirestore();
  // Sorted in memory rather than via .orderBy() - combining a .where()
  // equality filter with .orderBy() on a different field requires a
  // Firestore composite index that doesn't exist yet (and creating one is a
  // Firebase console step, not something this code can do) - unnecessary
  // here since pending-order volume is always small (submit-order.ts caps
  // each buyer at 5 open orders at once).
  const snap = await db.collection('orders').where('status', '==', filterStatus).limit(200).get();
  const sortedDocs = snap.docs.sort((a, b) => (b.data().submittedAt ?? 0) - (a.data().submittedAt ?? 0)).slice(0, 100);

  const orders = await Promise.all(
    sortedDocs.map(async (doc) => {
      const data = doc.data();
      let screenshotUrl: string | null = null;

      // Re-validated to the payment-proofs/ key shape before signing, so a
      // signed GET URL can only ever be minted for a real payment-proof
      // object, never coerced toward another prefix (e.g. pdfs/).
      if (isValidPaymentProofKey(data.screenshotKey)) {
        try {
          screenshotUrl = await getSignedUrl(
            r2Client,
            new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: data.screenshotKey }),
            { expiresIn: SCREENSHOT_URL_TTL_SECONDS }
          );
        } catch {
          screenshotUrl = null;
        }
      }

      return {
        id: doc.id,
        email: data.email ?? '',
        productIds: Array.isArray(data.productIds) ? data.productIds : [],
        status: data.status ?? 'pending',
        submittedAt: data.submittedAt ?? null,
        reviewedAt: data.reviewedAt ?? null,
        reviewMessage: data.reviewMessage ?? null,
        screenshotUrl
      };
    })
  );

  return jsonResponse(200, { orders });
};
