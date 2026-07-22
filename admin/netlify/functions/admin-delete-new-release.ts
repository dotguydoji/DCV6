import type { Handler } from '@netlify/functions';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { AdminAuthError, canManageFiles, jsonResponse, verifyAdmin } from './lib/adminAuth';
import { publicR2Client, R2_PUBLIC_BUCKET_NAME } from './lib/publicR2Client';
import { checkRateLimit, rateLimitedResponse } from './lib/rateLimit';
import { readPdfs, readVideos, writePdfs, writeVideos } from './lib/newReleases';
import { isValidFirestoreDocId } from './lib/validation';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const rateLimit = checkRateLimit(event.headers, 'admin-delete-new-release', 20, 60 * 1000);
  if (rateLimit.limited) {
    return rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  let idToken: unknown;
  let kind: unknown;
  let id: unknown;

  try {
    const parsed = JSON.parse(event.body ?? '{}');
    idToken = parsed.idToken;
    kind = parsed.kind;
    id = parsed.id;
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
  if (!isValidFirestoreDocId(id)) {
    return jsonResponse(400, { error: 'Invalid id' });
  }

  let thumbnailKey: string | undefined;

  if (kind === 'video') {
    const list = await readVideos();
    const target = list.find((entry) => entry.id === id);
    if (!target) {
      return jsonResponse(404, { error: 'Not found' });
    }
    thumbnailKey = target.thumbnailKey;
    await writeVideos(list.filter((entry) => entry.id !== id));
  } else {
    const list = await readPdfs();
    const target = list.find((entry) => entry.id === id);
    if (!target) {
      return jsonResponse(404, { error: 'Not found' });
    }
    thumbnailKey = target.thumbnailKey;
    await writePdfs(list.filter((entry) => entry.id !== id));
  }

  try {
    await publicR2Client.send(new DeleteObjectCommand({ Bucket: R2_PUBLIC_BUCKET_NAME, Key: thumbnailKey }));
  } catch {
    // Best-effort - a leftover orphaned thumbnail object is harmless; the
    // manifest write above (which already succeeded) is what buyers see.
  }

  return jsonResponse(200, { ok: true });
};
