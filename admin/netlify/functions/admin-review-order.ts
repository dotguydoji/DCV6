import type { Handler } from '@netlify/functions';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { AdminAuthError, getAdminFirestore, jsonResponse, verifyAdmin } from './lib/adminAuth';
import { r2Client, R2_BUCKET_NAME } from './lib/r2Client';
import { checkRateLimit, rateLimitedResponse } from './lib/rateLimit';
import { isValidEmail, isValidFirestoreDocId, isValidPaymentProofKey } from './lib/validation';
import { productFileExists } from './lib/productExists';
import { isProductivitySubscriptionProductId } from './lib/productivityFeatures';

// Kept identical to admin-update-buyer.ts's own value on purpose - a grant
// through this path should behave exactly like a manual grant through the
// Buyers tab, not a second, subtly different access-lifetime rule.
const RECORD_LIFETIME_MS = 3 * 365 * 24 * 60 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 500;

type ReviewAction = 'approve' | 'reject';

const isReviewAction = (value: unknown): value is ReviewAction => value === 'approve' || value === 'reject';

/**
 * Approves or rejects a pending order.
 *
 * Approve: re-validates every productId exactly like admin-update-buyer.ts's
 * own "add" action (a real uploaded PDF must exist for each one, or the
 * fixed Productivity subscription id) and grants them to the buyer the same
 * way. Reject: records an optional one-way message the buyer will see
 * against this order (see get-my-orders.ts); nothing is granted.
 *
 * Either way the payment screenshot is deleted from R2 - it's sensitive
 * financial PII kept only while an order is awaiting review, never retained
 * after a decision. And either way this only ever acts on a pending order -
 * an already-reviewed order is left untouched, so double-submitting a review
 * can't grant access twice or overwrite an earlier decision.
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const rateLimit = checkRateLimit(event.headers, 'admin-review-order', 30, 60 * 1000);
  if (rateLimit.limited) {
    return rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  let idToken: unknown;
  let orderId: unknown;
  let action: unknown;
  let message: unknown;

  try {
    const parsed = JSON.parse(event.body ?? '{}');
    idToken = parsed.idToken;
    orderId = parsed.orderId;
    action = parsed.action;
    message = parsed.message;
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

  if (!isValidFirestoreDocId(orderId)) {
    return jsonResponse(400, { error: 'Invalid orderId' });
  }
  if (!isReviewAction(action)) {
    return jsonResponse(400, { error: "action must be 'approve' or 'reject'" });
  }

  const trimmedMessage = typeof message === 'string' ? message.trim().slice(0, MAX_MESSAGE_LENGTH) : '';

  const db = getAdminFirestore();
  const orderRef = db.collection('orders').doc(orderId);
  const orderSnap = await orderRef.get();
  const order = orderSnap.data();

  if (!orderSnap.exists || !order) {
    return jsonResponse(404, { error: 'Order not found' });
  }
  if (order.status !== 'pending') {
    return jsonResponse(400, { error: `Order already ${order.status}` });
  }

  const email = order.email;
  const productIds: string[] = Array.isArray(order.productIds) ? order.productIds : [];
  const screenshotKey = order.screenshotKey;

  // The screenshot is deleted either way (approve OR reject) - a payment
  // screenshot is sensitive financial PII with no reason to keep once it's
  // been acted on, so it only ever exists while an order is pending review.
  // Re-validated to the payment-proofs/ key shape before it's ever fed to
  // R2, so even a hypothetically tampered value can't target another prefix.
  const deleteScreenshot = async () => {
    if (!isValidPaymentProofKey(screenshotKey)) return;
    try {
      await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: screenshotKey }));
    } catch {
      // Best-effort - a leftover object is swept later; never a failed review.
    }
  };

  if (action === 'reject') {
    await orderRef.set(
      { status: 'rejected', reviewedAt: Timestamp.now(), reviewMessage: trimmedMessage || null },
      { merge: true }
    );
    await deleteScreenshot();
    return jsonResponse(200, { ok: true });
  }

  // action === 'approve'
  if (!isValidEmail(email)) {
    return jsonResponse(400, { error: 'Order has an invalid email' });
  }

  const existsResults = await Promise.all(
    productIds.map((id) => (isProductivitySubscriptionProductId(id) ? Promise.resolve(true) : productFileExists(id)))
  );
  const missing = productIds.filter((_, index) => !existsResults[index]);
  if (missing.length > 0) {
    return jsonResponse(400, { error: `No uploaded file matches: ${missing.join(', ')}` });
  }

  const buyerUpdate: Record<string, unknown> = {
    productIds: FieldValue.arrayUnion(...productIds),
    expiresAt: Timestamp.fromMillis(Date.now() + RECORD_LIFETIME_MS)
  };
  if (productIds.some(isProductivitySubscriptionProductId)) {
    buyerUpdate.productivitySubscribedAt = Timestamp.now();
  }

  await db.collection('buyers').doc(email.trim().toLowerCase()).set(buyerUpdate, { merge: true });

  await orderRef.set(
    { status: 'approved', reviewedAt: Timestamp.now(), reviewMessage: trimmedMessage || null },
    { merge: true }
  );
  await deleteScreenshot();

  return jsonResponse(200, { ok: true });
};
