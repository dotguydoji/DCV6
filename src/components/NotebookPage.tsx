import React, { useEffect } from 'react';
import { ArrowLeft, FileText, Lock, RefreshCw } from 'lucide-react';
import { NotebookWorkspace } from './notebook/NotebookWorkspace';
import { GoogleSignInButton } from './GoogleSignInButton';
import { ThemeToggle } from './ThemeToggle';
import { setCachedIdToken } from '../lib/googleIdentity';
import { useOwnsAnyPdf } from '../lib/useOwnsAnyPdf';

const PAGE_TITLE = "Notebook | Doji's Library";

/**
 * Dedicated standalone page for the Notebook feature (in addition to being
 * embeddable inside the PDF viewer). Gated the same way the "Join Messenger
 * Group Chat" prompt is: must be signed in AND own at least one PDF - not a
 * real security boundary (notes themselves are just local device storage,
 * nothing sensitive is served here), just keeps the feature scoped to
 * actual buyers.
 */
export const NotebookPage: React.FC = () => {
  const { status, recheck } = useOwnsAnyPdf();

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

  if (status === 'owns-some') {
    return (
      <div className="h-screen bg-surface flex flex-col overflow-hidden">
        <header className="h-16 border-b border-border-hairline flex items-center justify-between px-4 lg:px-6 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <a
              href="/my-library"
              className="flex items-center justify-center w-9 h-9 shrink-0 rounded-sm border border-border-hairline text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors"
              aria-label="Back to My Library"
            >
              <ArrowLeft size={18} strokeWidth={1.5} />
            </a>
            <h1 className="text-base lg:text-lg font-medium text-text-primary truncate">Notebook</h1>
          </div>
          <ThemeToggle />
        </header>
        <div className="flex-1 min-h-0">
          <NotebookWorkspace variant="full" />
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
            <Lock size={44} className="mx-auto text-text-primary mb-5" strokeWidth={1.5} />
            <h1 className="f-heading text-text-primary mb-2">Notebook Locked</h1>
            <p className="text-text-secondary f-body mb-8">
              You need to own at least one PDF to use the Notebook. Once you purchase a note pack, it'll unlock here automatically.
            </p>
            <a href="/" className="inline-flex items-center gap-2 px-6 py-3 rounded-sm bg-surface-inverted text-text-inverted font-medium hover:opacity-90 transition-opacity">
              <FileText size={18} strokeWidth={1.5} />
              Browse Doji's Library
            </a>
          </>
        ) : status === 'error' ? (
          <>
            <h1 className="f-heading text-text-primary mb-2">Notebook</h1>
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
            <h1 className="f-heading text-text-primary mb-2">Notebook</h1>
            <p className="text-text-secondary f-body mb-8">
              Sign in with the Gmail you used to purchase your notes to unlock the Notebook.
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
