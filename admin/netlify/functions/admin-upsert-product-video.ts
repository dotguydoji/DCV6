import type { Handler } from '@netlify/functions';
import { randomUUID } from 'crypto';
import { AdminAuthError, getAdminFirestore, jsonResponse, verifyAdmin } from './lib/adminAuth';
import { checkRateLimit, rateLimitedResponse } from './lib/rateLimit';
import { extractYoutubeId, isValidProductId } from './lib/validation';
import { productFileExists } from './lib/productExists';

const MAX_TITLE_LENGTH = 150;

// Adds a new video entry when `video.id` is omitted, or edits an existing
// one in place when it matches an id already in that product's list - same
// one-endpoint-for-both shape as admin-upsert-package.ts.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const rateLimit = checkRateLimit(event.headers, 'admin-upsert-product-video', 30, 60 * 1000);
  if (rateLimit.limited) {
    return rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  let idToken: unknown;
  let productId: unknown;
  let video: unknown;

  try {
    const parsed = JSON.parse(event.body ?? '{}');
    idToken = parsed.idToken;
    productId = parsed.productId;
    video = parsed.video;
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

  if (!isValidProductId(productId)) {
    return jsonResponse(400, { error: 'Invalid productId' });
  }
  if (!(await productFileExists(productId))) {
    return jsonResponse(400, { error: `No uploaded PDF matches: ${productId}` });
  }

  if (typeof video !== 'object' || video === null) {
    return jsonResponse(400, { error: 'Missing video details' });
  }
  const { id, title, youtubeUrl } = video as Record<string, unknown>;

  const trimmedTitle = typeof title === 'string' ? title.trim() : '';
  if (!trimmedTitle || trimmedTitle.length > MAX_TITLE_LENGTH) {
    return jsonResponse(400, { error: `Video title must be 1-${MAX_TITLE_LENGTH} characters` });
  }

  const youtubeId = extractYoutubeId(youtubeUrl);
  if (!youtubeId) {
    return jsonResponse(400, { error: 'Could not find a valid YouTube video id in that link' });
  }

  const db = getAdminFirestore();
  const docRef = db.collection('productVideos').doc(productId);

  await db.runTransaction(async (tx) => {
    const doc = await tx.get(docRef);
    const videos = (doc.exists ? doc.data()?.videos : []) as
      | { id: string; title: string; youtubeId: string; addedAt: number }[]
      | undefined;
    const list = Array.isArray(videos) ? videos : [];

    const existingIndex = typeof id === 'string' ? list.findIndex((entry) => entry.id === id) : -1;

    if (existingIndex !== -1) {
      list[existingIndex] = { ...list[existingIndex], title: trimmedTitle, youtubeId };
    } else {
      list.push({ id: randomUUID(), title: trimmedTitle, youtubeId, addedAt: Date.now() });
    }

    tx.set(docRef, { videos: list });
  });

  return jsonResponse(200, { ok: true });
};
