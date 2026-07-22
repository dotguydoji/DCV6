import type { Handler } from '@netlify/functions';
import { randomUUID } from 'crypto';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { AdminAuthError, canManageFiles, jsonResponse, verifyAdmin } from './lib/adminAuth';
import { publicR2Client, R2_PUBLIC_BUCKET_NAME } from './lib/publicR2Client';
import { checkRateLimit, rateLimitedResponse } from './lib/rateLimit';
import { extractYoutubeId, isValidProductId } from './lib/validation';
import { productFileExists } from './lib/productExists';
import {
  isValidThumbnailKey,
  MAX_DESCRIPTION_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_VIDEOS,
  NewReleasePdfItem,
  NewReleaseVideoItem,
  readPdfs,
  readVideos,
  writePdfs,
  writeVideos
} from './lib/newReleases';

// Deletes the old thumbnail only after the manifest write that stops
// referencing it has already succeeded, and only ever as a best-effort
// cleanup - a failure here would leave one harmless orphaned object in
// storage, never a broken/missing thumbnail for buyers.
const deleteThumbnailBestEffort = async (key: string | undefined) => {
  if (!key) return;
  try {
    await publicR2Client.send(new DeleteObjectCommand({ Bucket: R2_PUBLIC_BUCKET_NAME, Key: key }));
  } catch {
    // Ignored on purpose - see comment above.
  }
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const rateLimit = checkRateLimit(event.headers, 'admin-upsert-new-release', 20, 60 * 1000);
  if (rateLimit.limited) {
    return rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  let idToken: unknown;
  let kind: unknown;
  let item: unknown;

  try {
    const parsed = JSON.parse(event.body ?? '{}');
    idToken = parsed.idToken;
    kind = parsed.kind;
    item = parsed.item;
  } catch {
    return jsonResponse(400, { error: 'Invalid request body' });
  }

  let email: string;
  try {
    email = await verifyAdmin(idToken);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return jsonResponse(403, { error: 'Not authorized' });
    }
    throw err;
  }

  if (!canManageFiles(email)) {
    return jsonResponse(403, { error: 'Not authorized to manage files' });
  }

  if (kind !== 'video' && kind !== 'pdf') {
    return jsonResponse(400, { error: "kind must be 'video' or 'pdf'" });
  }

  if (typeof item !== 'object' || item === null) {
    return jsonResponse(400, { error: 'Missing item details' });
  }
  const { id, title, description, thumbnailKey, youtubeUrl, productId } = item as Record<string, unknown>;

  const trimmedTitle = typeof title === 'string' ? title.trim() : '';
  if (!trimmedTitle || trimmedTitle.length > MAX_TITLE_LENGTH) {
    return jsonResponse(400, { error: `Title must be 1-${MAX_TITLE_LENGTH} characters` });
  }

  const trimmedDescription = typeof description === 'string' ? description.trim() : '';
  if (!trimmedDescription || trimmedDescription.length > MAX_DESCRIPTION_LENGTH) {
    return jsonResponse(400, { error: `Description must be 1-${MAX_DESCRIPTION_LENGTH} characters` });
  }

  if (!isValidThumbnailKey(thumbnailKey)) {
    return jsonResponse(400, { error: 'Upload a thumbnail first' });
  }

  const existingId = typeof id === 'string' && id ? id : null;

  if (kind === 'video') {
    const youtubeId = extractYoutubeId(youtubeUrl);
    if (!youtubeId) {
      return jsonResponse(400, { error: 'Could not find a valid YouTube video id in that link' });
    }

    const list = await readVideos();
    const existingIndex = existingId ? list.findIndex((entry) => entry.id === existingId) : -1;

    if (existingIndex === -1 && list.length >= MAX_VIDEOS) {
      return jsonResponse(400, {
        error: `Only ${MAX_VIDEOS} New Videos can be listed at once - remove one first.`
      });
    }

    const previousThumbnailKey = existingIndex !== -1 ? list[existingIndex].thumbnailKey : undefined;

    const entry: NewReleaseVideoItem = {
      id: existingIndex !== -1 ? list[existingIndex].id : randomUUID(),
      title: trimmedTitle,
      description: trimmedDescription,
      thumbnailKey,
      youtubeId,
      addedAt: existingIndex !== -1 ? list[existingIndex].addedAt : Date.now()
    };

    if (existingIndex !== -1) {
      list[existingIndex] = entry;
    } else {
      list.push(entry);
    }

    await writeVideos(list);
    if (previousThumbnailKey && previousThumbnailKey !== thumbnailKey) {
      await deleteThumbnailBestEffort(previousThumbnailKey);
    }

    return jsonResponse(200, { ok: true, id: entry.id });
  }

  // kind === 'pdf'
  if (!isValidProductId(productId)) {
    return jsonResponse(400, { error: 'Pick a valid PDF product' });
  }
  if (!(await productFileExists(productId))) {
    return jsonResponse(400, { error: `No uploaded PDF matches: ${productId}` });
  }

  const list = await readPdfs();
  const existingIndex = existingId ? list.findIndex((entry) => entry.id === existingId) : -1;
  const previousThumbnailKey = existingIndex !== -1 ? list[existingIndex].thumbnailKey : undefined;

  const entry: NewReleasePdfItem = {
    id: existingIndex !== -1 ? list[existingIndex].id : randomUUID(),
    title: trimmedTitle,
    description: trimmedDescription,
    thumbnailKey,
    productId,
    addedAt: existingIndex !== -1 ? list[existingIndex].addedAt : Date.now()
  };

  if (existingIndex !== -1) {
    list[existingIndex] = entry;
  } else {
    list.push(entry);
  }

  await writePdfs(list);
  if (previousThumbnailKey && previousThumbnailKey !== thumbnailKey) {
    await deleteThumbnailBestEffort(previousThumbnailKey);
  }

  return jsonResponse(200, { ok: true, id: entry.id });
};
