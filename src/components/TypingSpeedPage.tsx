import React, { useEffect } from 'react';
import { ArrowLeft, Keyboard, Lock, RefreshCw } from 'lucide-react';
import { TypingSpeedTest } from './TypingSpeedTest';
import { GoogleSignInButton } from './GoogleSignInButton';
import { ThemeToggle } from './ThemeToggle';
import { setCachedIdToken } from '../lib/googleIdentity';
import { useOwnsProduct } from '../lib/useOwnsProduct';
import { useIsDesktopViewport } from '../lib/useIsDesktopViewport';
import { DesktopOnlyNotice } from './DesktopOnlyNotice';
import { PRODUCTIVITY_SUBSCRIPTION_PRODUCT_ID } from '../constants';

const PAGE_TITLE = "Typing Speed | Doji's Library";

/**
 * Standalone route for the Typing Speed - gated the same way the
 * Notebook page gates on "owns at least one PDF" (NotebookPage.tsx), except
 * here it's a specific Productivity grant (see useOwnsProduct) rather than
 * any PDF at all, since this feature is its own paid subscription.
 */
export const TypingSpeedPage: React.FC = () => {
  const { status, recheck } = useOwnsProduct(PRODUCTIVITY_SUBSCRIPTION_PRODUCT_ID);
  const isDesktop = useIsDesktopViewport();

  useEffect(() => {
    const previousTitle = document.title;
    document.title = PAGE_TITLE;
    return () => {
      document.title = previousTitle;
    };
  }, []);

  const handleSignIn = (idToken: string) => {
    setCachedIdToken(idToken);
    recheck();
  };

  if (status === 'owns-it') {
    if (!isDesktop) {
      return <DesktopOnlyNotice featureName="Typing Speed" />;
    }

    return (
      <div className="min-h-screen bg-surface flex flex-col">
        <header className="h-16 border-b border-orange-500/20 flex items-center justify-between px-4 lg:px-6 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <a
              href="/my-library"
              className="flex items-center justify-center w-9 h-9 shrink-0 rounded-sm border border-border-hairline text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors"
              aria-label="Back to My Library"
            >
              <ArrowLeft size={18} strokeWidth={1.5} />
            </a>
            <Keyboard size={18} strokeWidth={1.5} className="text-orange-500 shrink-0" />
            <h1 className="text-base lg:text-lg font-medium text-text-primary truncate">Typing Speed</h1>
          </div>
          <ThemeToggle />
        </header>
        <div className="flex-1 min-h-0">
          <TypingSpeedTest />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center font-sans relative px-6">
      <div className="absolute top-6 right-6 z-10">
        <ThemeToggle />
      </div>

      <div className="relative z-10 max-w-md w-full text-center">
        {status === 'owns-none' ? (
          <>
            <Lock size={44} className="mx-auto text-orange-500 mb-5" strokeWidth={1.5} />
            <h1 className="f-heading text-text-primary mb-2">Typing Speed Locked</h1>
            <p className="text-text-secondary f-body mb-8">
              This is part of the Productivity subscription (₱59/month). Subscribe from Doji's Library and it'll
              unlock here automatically.
            </p>
            <a href="/" className="inline-flex items-center gap-2 px-6 py-3 rounded-sm bg-orange-500 text-white font-medium hover:bg-orange-400 transition-colors">
              <Keyboard size={18} strokeWidth={1.5} />
              Browse Productivity
            </a>
          </>
        ) : status === 'error' ? (
          <>
            <h1 className="f-heading text-text-primary mb-2">Typing Speed</h1>
            <p className="text-red-400 font-medium f-body mb-6">Something went wrong. Please try again.</p>
            <button
              type="button"
              onClick={recheck}
              className="inline-flex items-center gap-2 text-text-primary underline underline-offset-4 f-body"
            >
              <RefreshCw size={16} strokeWidth={1.5} />
              Try again
            </button>
          </>
        ) : status === 'signed-out' ? (
          <>
            <h1 className="f-heading text-text-primary mb-2">Typing Speed</h1>
            <p className="text-text-secondary f-body mb-8">
              Sign in with the Gmail you used to subscribe to Productivity to unlock the Typing Speed.
            </p>
            <div className="flex justify-center">
              <GoogleSignInButton onSignIn={handleSignIn} />
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center gap-2 text-text-secondary f-body" aria-live="polite">
            <RefreshCw size={18} className="animate-spin" strokeWidth={1.5} />
            Checking your access…
          </div>
        )}

        <a href="/" className="flex items-center justify-center gap-2 text-text-secondary underline underline-offset-4 mt-8 f-body">
          <ArrowLeft size={16} strokeWidth={1.5} />
          Back to Doji's Library
        </a>
      </div>
    </div>
  );
};
