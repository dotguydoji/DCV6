/**
 * Client helpers for the payment-screenshot order flow (add to cart ->
 * sign in -> upload proof of payment -> admin reviews in the admin panel).
 * Every call here requires a real Google ID token - there is no
 * unauthenticated path into any of this, matching every other buyer-facing
 * function in this codebase.
 */

export interface OrderSummary {
  id: string;
  productIds: string[];
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: number | null;
  reviewMessage: string | null;
}

class OrderApiError extends Error {}

const call = async <T>(fn: string, body: Record<string, unknown>): Promise<T> => {
  const response = await fetch(`/.netlify/functions/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.authorized === false) {
    throw new OrderApiError(data?.reason || data?.error || `Request failed (${response.status})`);
  }

  return data as T;
};

// Maps MIME type -> extension - the SAME direction get-order-upload-url.ts
// maps extension -> Content-Type when signing the upload URL. Deriving the
// extension we send FROM file.type (rather than the filename) guarantees
// the Content-Type header this module puts on the actual PUT request always
// matches what the server signed the URL for - a mismatch here (e.g.
// filename says .jpg but the real content-type is something else) would
// otherwise make R2 reject the upload with a signature error.
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

// Mirrors the server's own cap (get-order-upload-url.ts) - checked here only
// for a friendly early message; the server is the real enforcer and the
// presigned URL's signed ContentLength makes R2 itself reject anything over.
const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;

/** Uploads a payment-proof screenshot directly to R2 and creates a pending order for it. */
export const submitPaymentScreenshot = async (
  idToken: string,
  file: File,
  productIds: string[]
): Promise<{ orderId: string }> => {
  const extension = EXTENSION_BY_MIME[file.type];
  if (!extension) {
    throw new OrderApiError('Please upload a .jpg, .png, or .webp image.');
  }
  if (file.size <= 0 || file.size > MAX_SCREENSHOT_BYTES) {
    throw new OrderApiError('Please upload an image up to 8 MB.');
  }

  const { url, key } = await call<{ url: string; key: string }>('get-order-upload-url', {
    idToken,
    fileExtension: extension,
    contentLength: file.size
  });

  const uploadResponse = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file
  });
  if (!uploadResponse.ok) {
    throw new OrderApiError('Could not upload your screenshot. Please try again.');
  }

  const { orderId } = await call<{ orderId: string }>('submit-order', { idToken, key, productIds });
  return { orderId };
};

export const fetchMyOrders = async (idToken: string): Promise<OrderSummary[]> => {
  const { orders } = await call<{ orders: OrderSummary[] }>('get-my-orders', { idToken });
  return orders;
};
