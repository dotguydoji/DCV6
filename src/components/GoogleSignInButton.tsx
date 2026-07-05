import React, { useEffect, useRef, useState } from 'react';
import { attemptSilentSignIn, loadGoogleIdentityScript, GoogleCredentialResponse } from '../lib/googleIdentity';

interface GoogleSignInButtonProps {
  onSignIn: (idToken: string) => void;
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({ onSignIn }) => {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      setLoadError('Sign-in is not configured yet.');
      return;
    }

    let cancelled = false;

    loadGoogleIdentityScript()
      .then(() => {
        if (cancelled || !window.google || !buttonRef.current) return;

        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response: GoogleCredentialResponse) => {
            onSignIn(response.credential);
          },
          // If the browser still has an active Google session and the
          // buyer has signed in here before, this lets Google silently
          // re-issue a fresh credential instead of requiring a click -
          // a second layer on top of our own cached-token check, for
          // cases like visiting a different product for the first time.
          auto_select: true,
          cancel_on_tap_outside: false
        });

        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: 'filled_black',
          size: 'large',
          text: 'signin_with',
          shape: 'pill'
        });

        // Try a silent, no-click sign-in once per tab (see attemptSilentSignIn's
        // sessionStorage guard) - this is what lets a buyer stay "logged in"
        // across visits without re-clicking every time their cached token
        // expires, as long as they haven't explicitly signed out (which
        // calls disableAutoSelect() and clears this guard). Calling
        // prompt() on every mount/reload without this guard was found to
        // trigger Google's own cooldown, suppressing sign-in for several
        // minutes - the guard is what makes this safe to re-enable.
        attemptSilentSignIn();
      })
      .catch(() => {
        if (!cancelled) setLoadError('Could not load Google Sign-In. Check your connection and try again.');
      });

    return () => {
      cancelled = true;
    };
  }, [onSignIn]);

  if (loadError) {
    return <p className="text-red-400 text-base">{loadError}</p>;
  }

  return <div ref={buttonRef} />;
};
