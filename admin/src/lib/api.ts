import { clearCachedResponse, getCachedResponse, setCachedResponse } from './requestCache';

// Just enough to avoid redundant R2/Firestore reads on a quick reload, not
// a long-term cache - the admin actively uploads/deletes/grants and needs
// to see those changes immediately, which is why every mutation below
// clears its cache key right after succeeding rather than waiting out the TTL.
const LIST_CACHE_TTL_MS = 120 * 1000;

export interface Buyer {
  email: string;
  productIds: string[];
  expiresAt: string | null;
}

export interface AdminFile {
  productId: string;
  key: string;
  sizeBytes: number;
  lastModified: string | null;
}

// Not a real PDF/file of its own - just a named shortcut for a set of
// existing productIds, so an admin can grant several PDFs to a buyer in one
// pick instead of selecting each individually.
export interface Package {
  id: string;
  name: string;
  productIds: string[];
}

// Carries the HTTP status alongside the message so callers can tell a real
// "not authorized" (403) apart from a rate limit (429) or a server error
// (5xx) - these need different handling, not one generic failure message.
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const call = async <T>(fn: string, idToken: string, body: Record<string, unknown> = {}): Promise<T> => {
  const response = await fetch(`/.netlify/functions/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, ...body })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(data.error ?? `Request failed (${response.status})`, response.status);
  }

  return response.json();
};

const BUYERS_CACHE_KEY = 'buyers';
const FILES_CACHE_KEY = 'files';
const PACKAGES_CACHE_KEY = 'packages';

export const listBuyers = async (idToken: string): Promise<{ buyers: Buyer[] }> => {
  const cached = getCachedResponse<{ buyers: Buyer[] }>(BUYERS_CACHE_KEY);
  if (cached) return cached;

  const result = await call<{ buyers: Buyer[] }>('admin-list-buyers', idToken);
  setCachedResponse(BUYERS_CACHE_KEY, result, LIST_CACHE_TTL_MS);
  return result;
};

export const updateBuyer = async (
  idToken: string,
  email: string,
  action: 'add' | 'remove' | 'delete',
  productId?: string | string[]
) => {
  const result = await call<{ ok: true }>('admin-update-buyer', idToken, { email, action, productId });
  clearCachedResponse(BUYERS_CACHE_KEY);
  return result;
};

export const listFiles = async (idToken: string): Promise<{ files: AdminFile[]; canManageFiles: boolean }> => {
  const cached = getCachedResponse<{ files: AdminFile[]; canManageFiles: boolean }>(FILES_CACHE_KEY);
  if (cached) return cached;

  const result = await call<{ files: AdminFile[]; canManageFiles: boolean }>('admin-list-files', idToken);
  setCachedResponse(FILES_CACHE_KEY, result, LIST_CACHE_TTL_MS);
  return result;
};

export const getUploadUrl = (idToken: string, productId: string) =>
  call<{ url: string }>('admin-get-upload-url', idToken, { productId });

export const deleteFile = async (idToken: string, productId: string) => {
  const result = await call<{ ok: true }>('admin-delete-file', idToken, { productId });
  clearCachedResponse(FILES_CACHE_KEY);
  return result;
};

export const listPackages = async (idToken: string): Promise<{ packages: Package[] }> => {
  const cached = getCachedResponse<{ packages: Package[] }>(PACKAGES_CACHE_KEY);
  if (cached) return cached;

  const result = await call<{ packages: Package[] }>('admin-list-packages', idToken);
  setCachedResponse(PACKAGES_CACHE_KEY, result, LIST_CACHE_TTL_MS);
  return result;
};

export const upsertPackage = async (
  idToken: string,
  pkg: { id?: string; name: string; productIds: string[] }
) => {
  const result = await call<{ id: string }>('admin-upsert-package', idToken, pkg);
  clearCachedResponse(PACKAGES_CACHE_KEY);
  return result;
};

export const deletePackage = async (idToken: string, id: string) => {
  const result = await call<{ ok: true }>('admin-delete-package', idToken, { id });
  clearCachedResponse(PACKAGES_CACHE_KEY);
  return result;
};

export const backfillExpiry = async (idToken: string) => {
  const result = await call<{ updated: number }>('admin-backfill-expiry', idToken);
  clearCachedResponse(BUYERS_CACHE_KEY);
  return result;
};

export const uploadFileToR2 = async (uploadUrl: string, file: File): Promise<void> => {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/pdf' },
    body: file
  });

  if (!response.ok) {
    throw new ApiError('Upload failed', response.status);
  }

  // This PUT goes straight to R2, bypassing the call() wrapper above, so
  // the files-list cache needs to be invalidated here too - otherwise a
  // freshly uploaded file wouldn't show up until the cache naturally expires.
  clearCachedResponse(FILES_CACHE_KEY);
};
