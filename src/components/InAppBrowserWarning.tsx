import React, { useEffect, useState } from 'react';
import { AlertTriangle, Copy, ExternalLink, X } from 'lucide-react';
import { isInAppBrowser } from '../lib/inAppBrowser';

// Only a "dismissed for this session" flag - no identifier, no tracking
// value, cleared the moment the tab closes. Storing it is squarely within
// the "strictly necessary for the functionality the user is actively
// using" exemption every major regulator's cookie-consent guidance carves
// out (remembering a dismissed on-page notice for the current session,
// same category as remembering an open/closed panel state) - it never
// needs its own consent prompt.
const DISMISSED_KEY = 'dcv6-inapp-browser-warning-dismissed';

const getDismissed = (): boolean => {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
};

const setDismissed = (): void => {
  try {
    sessionStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    // Ignored on purpose - worst case the banner can reappear on the next
    // page view within the same session, never a functional problem.
  }
};

/**
 * A non-blocking notice for visitors browsing inside Messenger/Instagram/
 * Facebook's built-in browser, where Google Sign-In does not work at all
 * (see inAppBrowser.ts for why).
 *
 * Deliberately plain, in-flow content (not `position: fixed`) - a fixed
 * overlay would sit on top of, and visually hide, whatever sticky header
 * the page underneath renders at its own top-0 (every page here has one).
 * Left in normal flow, it just pushes that header down by its own height
 * with zero coordination needed - the header's sticky behavior still works
 * exactly as before, just triggered a little later on scroll. Pages that
 * lock their layout to exactly 100vh (like My Library's two-column section)
 * end up very slightly taller than the viewport while this is showing,
 * needing a small scroll - an acceptable, rare-case tradeoff next to the
 * alternative (silently hiding the real header behind an overlay).
 *
 * Mounted once, above <App/>, in index.tsx - not inside App.tsx itself,
 * since App.tsx has several early `return`s for different routes and this
 * needs to show on all of them without duplicating it into each branch.
 */
export const InAppBrowserWarning: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isInAppBrowser() && !getDismissed()) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const handleDismiss = () => {
    setDismissed();
    setVisible(false);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard API can be unavailable in some in-app browsers - the
      // visitor can still select/copy the address bar manually if theirs
      // even shows one, or use the "Open in Browser" menu option instead.
    }
  };

  return (
    // This site's light/dark theme is a manual [data-theme] toggle, not
    // Tailwind's media-query-driven `dark:` variant (see index.css) - a
    // single warm, opaque amber scheme (rather than site's own bg-surface/
    // text-primary tokens) reads correctly as a deliberate alert regardless
    // of which theme the page underneath is currently in, without needing
    // a second color set to track.
    <div
      role="alert"
      className="relative z-[300] bg-amber-400 text-amber-950 border-b border-amber-600 shadow-lg"
    >
      <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-start gap-3">
        <AlertTriangle size={20} strokeWidth={1.5} className="shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1 text-sm leading-relaxed">
          <p className="font-bold">You're viewing this inside an app's built-in browser.</p>
          <p className="mt-0.5">
            Google Sign-In won't work here. Tap the <strong>⋯</strong> or <strong>↗</strong> menu icon (usually top-right)
            and choose "Open in Chrome" or "Open in Browser" - or copy the link below and paste it into your browser app.
          </p>
          <button
            type="button"
            onClick={handleCopyLink}
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-amber-700 text-xs font-bold uppercase tracking-wider hover:bg-amber-300 transition-colors"
          >
            {copied ? (
              <>
                <ExternalLink size={14} strokeWidth={1.5} />
                Link copied
              </>
            ) : (
              <>
                <Copy size={14} strokeWidth={1.5} />
                Copy link
              </>
            )}
          </button>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="shrink-0 p-1 rounded-sm hover:bg-amber-300 transition-colors"
        >
          <X size={18} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
};
