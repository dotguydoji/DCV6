import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Lock, ShieldAlert } from 'lucide-react';
import { GoogleSignInButton } from './GoogleSignInButton';
import { PdfViewer, RefreshUrlResult } from './PdfViewer';
import { Product } from '../types';
import { clearCachedIdToken, getCachedIdToken, getIdTokenEmail, setCachedIdToken } from '../lib/googleIdentity';
import { recordOpened } from '../lib/libraryPreferences';
import { getCachedResponse, setCachedResponse } from '../lib/requestCache';

// Slightly under the server's 5-minute signed URL lifetime (get-pdf.ts),
// so a cached URL is never handed out right at the edge of expiring.
const PDF_URL_CACHE_TTL_MS = 4.5 * 60 * 1000;

interface PdfGatePageProps {
  product: Product | undefined;
  productId: string;
}

type ViewState =
  | { status: 'restoring' }
  | { status: 'signed-out' }
  | { status: 'checking' }
  | { status: 'denied' }
  | { status: 'rate-limited'; idToken: string }
  | { status: 'error'; message: string; idToken?: string }
  | { status: 'authorized'; fileUrl: string };

export const PdfGatePage: React.FC<PdfGatePageProps> = ({ product, productId }) => {
  const [state, setState] = useState<ViewState>({ status: 'restoring' });
  const hasTriedCachedToken = useRef(false);

  const handleSignIn = useCallback(
    async (idToken: string) => {
      setState({ status: 'checking' });

      // Cached per account email + productId, so a reload/quick revisit of
      // the same PDF doesn't re-hit the function - scoping by email (never
      // stored beyond this short in-tab cache) prevents a cached result
      // from ever being handed to a different signed-in account on a
      // shared device. The signed URL itself is unchanged either way.
      const email = getIdTokenEmail(idToken);
      const cacheKey = email ? `pdf:${email}:${productId}` : null;
      const cached = cacheKey ? getCachedResponse<string>(cacheKey) : null;

      if (cached) {
        setCachedIdToken(idToken);
        recordOpened(productId);
        setState({ status: 'authorized', fileUrl: cached });
        return;
      }

      try {
        const response = await fetch('/.netlify/functions/get-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken, productId })
        });

        const data = await response.json();

        if (response.ok && data.authorized) {
          if (cacheKey) setCachedResponse(cacheKey, data.url, PDF_URL_CACHE_TTL_MS);
          setCachedIdToken(idToken);
          recordOpened(productId);
          setState({ status: 'authorized', fileUrl: data.url });
        } else if (response.status === 429) {
          // Too many requests in a short window (our own rate limiter) -
          // not a real access denial, so don't sign the buyer out over it.
          setState({ status: 'rate-limited', idToken });
        } else if (response.status >= 500) {
          // A real server-side failure (e.g. a transient Firestore/R2 issue)
          // is not the same thing as "wrong account" - showing "not
          // authorized" here would be actively false, and clearing the
          // token would force a needless re-sign-in for a problem that had
          // nothing to do with the buyer's account.
          setState({ status: 'error', message: 'Something went wrong on our end. Please try again.', idToken });
        } else {
          clearCachedIdToken();
          setState({ status: 'denied' });
        }
      } catch {
        setState({ status: 'error', message: 'Something went wrong. Please try again.' });
      }
    },
    [productId]
  );

  // Lets an already-authorized PdfViewer silently ask for a brand new
  // signed URL without dropping back through the sign-in/checking states -
  // used to keep a long reading session alive past the signed URL's short
  // lifetime, instead of forcing the buyer back to My Library. Reuses the
  // exact same server call and re-authorization check as a normal open;
  // nothing about the security check itself is weakened or skipped.
  const refreshFileUrl = useCallback(async (): Promise<RefreshUrlResult> => {
    const idToken = getCachedIdToken();
    if (!idToken) return { ok: false, reason: 'denied' };

    try {
      const response = await fetch('/.netlify/functions/get-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, productId })
      });
      const data = await response.json();

      if (response.ok && data.authorized) {
        const email = getIdTokenEmail(idToken);
        const cacheKey = email ? `pdf:${email}:${productId}` : null;
        if (cacheKey) setCachedResponse(cacheKey, data.url, PDF_URL_CACHE_TTL_MS);
        return { ok: true, url: data.url };
      }

      if (response.status === 429 || response.status >= 500) {
        return { ok: false, reason: 'retry' };
      }

      return { ok: false, reason: 'denied' };
    } catch {
      return { ok: false, reason: 'retry' };
    }
  }, [productId]);

  useEffect(() => {
    if (hasTriedCachedToken.current) return;
    hasTriedCachedToken.current = true;

    const cachedToken = getCachedIdToken();
    if (cachedToken) {
      handleSignIn(cachedToken);
    } else {
      setState({ status: 'signed-out' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  useEffect(() => {
    // iOS Safari (much more aggressively than other browsers) can restore
    // this exact page from its back-forward cache when a buyer taps back
    // then re-opens the link, instead of doing a real reload - which means
    // an already-expired signed URL (or an already-shown error) would
    // otherwise just sit frozen on screen forever, since nothing re-runs to
    // fetch a fresh one. `pageshow` with `persisted: true` is how a bfcache
    // restore is detected; redoing the same check a real fresh load would
    // do is what actually gets a new signed URL instead of leaving the
    // stale one displayed.
    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;

      const cachedToken = getCachedIdToken();
      if (cachedToken) {
        handleSignIn(cachedToken);
      } else {
        setState({ status: 'signed-out' });
      }
    };

    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, [handleSignIn]);

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1a1d1e] text-white px-6">
        <div className="text-center">
          <ShieldAlert size={40} className="mx-auto text-brand-yellow mb-4" />
          <p className="text-lg font-bold">This PDF link doesn't match any product.</p>
          <a href="/" className="text-brand-yellow underline mt-3 inline-block">
            Back to Doji's Library
          </a>
        </div>
      </div>
    );
  }

  if (state.status === 'authorized') {
    return (
      <div className="fixed inset-0 z-[200]">
        <PdfViewer fileUrl={state.fileUrl} product={product} onRefreshUrl={refreshFileUrl} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1a1d1e] text-white px-6">
      <div className="max-w-md w-full text-center">
        <Lock size={40} className="mx-auto text-brand-yellow mb-5" />
        <h1 className="text-2xl font-bold mb-2">{product.title}</h1>
        <p className="text-brand-muted mb-8">
          Sign in with the Gmail you used to purchase this item to view it.
        </p>

        {state.status === 'restoring' && <p className="text-brand-muted">Checking your session…</p>}

        {state.status === 'signed-out' && (
          <div className="flex justify-center">
            <GoogleSignInButton onSignIn={handleSignIn} />
          </div>
        )}

        {state.status === 'checking' && <p className="text-brand-muted">Checking your access…</p>}

        {state.status === 'denied' && (
          <div>
            <p className="text-red-400 font-bold mb-4">
              This Gmail account doesn't have access to this item.
            </p>
            <button
              type="button"
              onClick={() => setState({ status: 'signed-out' })}
              className="text-brand-yellow underline"
            >
              Try a different Gmail account
            </button>
          </div>
        )}

        {state.status === 'rate-limited' && (
          <div>
            <p className="text-red-400 font-bold mb-4">
              Too many attempts in a short time. Please wait a moment and try again.
            </p>
            <button
              type="button"
              onClick={() => handleSignIn(state.idToken)}
              className="text-brand-yellow underline"
            >
              Try again
            </button>
          </div>
        )}

        {state.status === 'error' && (
          <div>
            <p className="text-red-400 font-bold mb-4">{state.message}</p>
            {state.idToken && (
              <button
                type="button"
                onClick={() => handleSignIn(state.idToken!)}
                className="text-brand-yellow underline"
              >
                Try again
              </button>
            )}
          </div>
        )}

        <a href="/" className="block text-brand-muted underline mt-8 text-sm">
          Back to Doji's Library
        </a>
      </div>
    </div>
  );
};
