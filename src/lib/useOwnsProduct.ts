import { useCallback, useEffect, useState } from 'react';
import { getCachedIdToken, getIdTokenEmail } from './googleIdentity';
import { fetchOwnedProductIds } from './libraryAccess';

export type OwnsProductStatus = 'checking' | 'signed-out' | 'owns-none' | 'owns-it' | 'error';

/**
 * Checks whether the signed-in buyer has been granted one specific
 * productId - used to gate every standalone Productivity feature page
 * (Typing Speed, Notebook, and anything added later) on
 * PRODUCTIVITY_SUBSCRIPTION_PRODUCT_ID, granted through the exact same
 * buyers/{email}.productIds mechanism as a PDF, just never backed by an
 * uploaded file.
 */
export const useOwnsProduct = (productId: string) => {
  const [status, setStatus] = useState<OwnsProductStatus>('checking');

  const check = useCallback(async () => {
    const idToken = getCachedIdToken();
    if (!idToken) {
      setStatus('signed-out');
      return;
    }

    setStatus('checking');
    const result = await fetchOwnedProductIds(idToken, getIdTokenEmail(idToken));
    if (result.status === 'ok') {
      setStatus(result.productIds.includes(productId) ? 'owns-it' : 'owns-none');
    } else {
      setStatus('error');
    }
  }, [productId]);

  useEffect(() => {
    check();
  }, [check]);

  return { status, recheck: check };
};
