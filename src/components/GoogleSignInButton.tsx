import React, { useEffect, useRef, useState } from 'react';
import { renderGoogleSignInButton, setActiveSignInListener } from '../lib/googleIdentity';

interface GoogleSignInButtonProps {
  onSignIn: (idToken: string) => void;
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

/**
 * Renders exactly one sign-in surface: Google's explicit "Sign in with
 * Google" button. Deliberately does NOT also trigger Google's automatic
 * "One Tap" popup on mount (a previous version did) - showing both at once
 * was confusing (two separate invitations to sign in stacked on the same
 * page) and the extra automatic attempt was one more chance to hit the
 * FedCM/COOP fallback failure that could strand a visitor mid-sign-in
 * instead of completing it. A buyer who's already signed in still gets
 * renewed automatically in the background - see startAuthSessionKeepAlive
 * in googleIdentity.ts - this button only ever matters while signed out.
 */
export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({ onSignIn }) => {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      setLoadError('Sign-in is not configured yet.');
      return;
    }

    let cancelled = false;
    const unregister = setActiveSignInListener((idToken) => onSignIn(idToken));

    (async () => {
      if (!buttonRef.current) return;

      const ok = await renderGoogleSignInButton(buttonRef.current, {
        theme: 'filled_black',
        size: 'large',
        text: 'signin_with',
        shape: 'pill'
      });

      if (!ok && !cancelled) {
        setLoadError('Could not load Google Sign-In. Check your connection and try again.');
      }
    })();

    return () => {
      cancelled = true;
      unregister();
    };
  }, [onSignIn]);

  if (loadError) {
    return <p className="text-red-400 text-base">{loadError}</p>;
  }

  return <div ref={buttonRef} />;
};
