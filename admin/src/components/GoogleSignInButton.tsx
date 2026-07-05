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
          auto_select: true,
          cancel_on_tap_outside: false
        });

        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: 'filled_black',
          size: 'large',
          text: 'signin_with',
          shape: 'pill'
        });

        // Guarded to at most once per tab (see attemptSilentSignIn) - calling
        // prompt() on every mount/reload without this guard triggers
        // Google's own cooldown, suppressing sign-in for several minutes.
        // Admins reload this panel often, so this matters here just as much
        // as it does on the main site.
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
