import { useCallback, useEffect, useState } from 'react';
import { getCachedIdToken, getIdTokenEmail } from './googleIdentity';
import { fetchOwnedProductIds } from './libraryAccess';

export type OwnsAnyPdfStatus = 'checking' | 'signed-out' | 'owns-none' | 'owns-some' | 'error';

/**
 * Same "does this buyer own at least one PDF" check the Messenger gate
 * (Navbar's handleMessengerClick) already performs, pulled out so the
 * Notebook feature can gate on it too - not a real security boundary
 * (nothing sensitive is served based on this), just an access-worthiness
 * check reusing the same server call and short-lived cache as My Library.
 */
export const useOwnsAnyPdf = () => {
  const [status, setStatus] = useState<OwnsAnyPdfStatus>('checking');

  const check = useCallback(async () => {
    const idToken = getCachedIdToken();
    if (!idToken) {
      setStatus('signed-out');
      return;
    }

    setStatus('checking');
    const result = await fetchOwnedProductIds(idToken, getIdTokenEmail(idToken));
    if (result.status === 'ok') {
      setStatus(result.productIds.length > 0 ? 'owns-some' : 'owns-none');
    } else {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  return { status, recheck: check };
};
