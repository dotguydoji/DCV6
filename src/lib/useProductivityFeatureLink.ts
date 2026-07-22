import { useCallback, useState } from 'react';
import { getCachedIdToken, getIdTokenEmail } from './googleIdentity';
import { fetchOwnedProductIds } from './libraryAccess';
import { PRODUCTIVITY_SUBSCRIPTION_PRODUCT_ID } from '../constants';

/**
 * Shared nav-link gate for every standalone Productivity feature (Typing
 * Speed Test, Notebook, and anything added later) - all of them unlock
 * together on the same PRODUCTIVITY_SUBSCRIPTION_PRODUCT_ID grant, so a new
 * feature only needs `useProductivityFeatureLink('/its-path')` plus a
 * disabled={isChecking} + onLocked callback, not its own copy of this
 * check/navigate logic. Not a real security boundary itself (the
 * destination route re-verifies independently) - this only decides whether
 * to navigate straight there or show the subscribe prompt first.
 */
export const useProductivityFeatureLink = (path: string) => {
  const [isChecking, setIsChecking] = useState(false);

  const handleClick = useCallback(
    async (onLocked: () => void) => {
      const idToken = getCachedIdToken();
      if (!idToken) {
        onLocked();
        return;
      }

      setIsChecking(true);
      const result = await fetchOwnedProductIds(idToken, getIdTokenEmail(idToken));
      setIsChecking(false);

      if (result.status === 'ok' && result.productIds.includes(PRODUCTIVITY_SUBSCRIPTION_PRODUCT_ID)) {
        window.location.href = path;
      } else {
        onLocked();
      }
    },
    [path]
  );

  return { isChecking, handleClick };
};
