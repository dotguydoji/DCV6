import { useEffect, useState } from 'react';

// Only phones have the on-screen-keyboard-covers-content problem this hook
// exists to fix. Tablets/desktop never had that issue, and some tablet
// browsers report an incorrect/stale window.visualViewport.height during
// the initial page load - applying this override unconditionally on every
// screen size once caused the whole reader to render at ~0 height (blank
// page, no error) on at least one real tablet. Scoping this to mobile
// widths restores the previously-reliable behavior everywhere else.
const MOBILE_MAX_WIDTH = 640;

const isMobileWidth = () => typeof window !== 'undefined' && window.innerWidth <= MOBILE_MAX_WIDTH;

/**
 * Tracks the browser's visual viewport height on mobile-width screens only.
 * Returns null on wider screens (tablet/desktop), signaling the caller to
 * fall back to a plain CSS height (e.g. `h-full`) instead of a JS-computed
 * one. On mobile, the layout viewport does NOT shrink when the on-screen
 * keyboard opens, but the visual viewport does - a reader UI pinned to the
 * layout viewport ends up with its lower portion (e.g. a search bar near
 * the top, but also toolbars) covered by the keyboard instead of reflowing
 * above it. Using this value for the reader's actual height on mobile keeps
 * everything within the visible area.
 */
export const useVisualViewportHeight = (): number | null => {
  const [height, setHeight] = useState<number | null>(() => {
    if (typeof window === 'undefined' || !isMobileWidth()) return null;
    return window.visualViewport?.height ?? window.innerHeight;
  });

  useEffect(() => {
    const viewport = window.visualViewport;

    const update = () => {
      if (!isMobileWidth()) {
        setHeight(null);
        return;
      }
      setHeight(viewport?.height ?? window.innerHeight);
    };

    update();

    if (viewport) {
      viewport.addEventListener('resize', update);
    }
    window.addEventListener('resize', update);

    return () => {
      viewport?.removeEventListener('resize', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return height;
};
