export interface Buyer {
  email: string;
  productIds: string[];
}

export interface AdminFile {
  productId: string;
  key: string;
  sizeBytes: number;
  lastModified: string | null;
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

export const listBuyers = (idToken: string) => call<{ buyers: Buyer[] }>('admin-list-buyers', idToken);

export const updateBuyer = (
  idToken: string,
  email: string,
  action: 'add' | 'remove' | 'delete',
  productId?: string | string[]
) => call<{ ok: true }>('admin-update-buyer', idToken, { email, action, productId });

export const listFiles = (idToken: string) =>
  call<{ files: AdminFile[]; canManageFiles: boolean }>('admin-list-files', idToken);

export const getUploadUrl = (idToken: string, productId: string) =>
  call<{ url: string }>('admin-get-upload-url', idToken, { productId });

export const deleteFile = (idToken: string, productId: string) =>
  call<{ ok: true }>('admin-delete-file', idToken, { productId });

export const uploadFileToR2 = async (uploadUrl: string, file: File): Promise<void> => {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/pdf' },
    body: file
  });

  if (!response.ok) {
    throw new ApiError('Upload failed', response.status);
  }
};
