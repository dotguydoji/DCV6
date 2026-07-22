import type { Handler } from '@netlify/functions';
import { AdminAuthError, jsonResponse, verifyAdmin } from './lib/adminAuth';
import { checkRateLimit, rateLimitedResponse } from './lib/rateLimit';
import { readPdfs, readVideos } from './lib/newReleases';

// Read-only for any admin (no canManageFiles gate) - same posture as
// admin-list-files.ts, which also lets every admin view without needing
// upload/delete permission.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const rateLimit = checkRateLimit(event.headers, 'admin-list-new-releases', 30, 60 * 1000);
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

  const [videos, pdfs] = await Promise.all([readVideos(), readPdfs()]);

  return jsonResponse(200, { videos, pdfs });
};
