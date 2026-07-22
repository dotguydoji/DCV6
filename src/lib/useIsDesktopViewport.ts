import { useEffect, useState } from 'react';

// Matches the same `lg` (1024px) breakpoint the rest of the site already
// uses to split mobile vs desktop UI (see Navbar.tsx/MyLibraryPage.tsx's
// `lg:flex`/hamburger split), so "desktop" here means the same thing it
// means everywhere else in this codebase.
const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)';

/**
 * Live viewport-width check (not a one-time read) - updates immediately if
 * the window is resized or a device is rotated, rather than only reflecting
 * whatever size the page happened to load at.
 */
export const useIsDesktopViewport = (): boolean => {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window === 'undefined' ? true : window.matchMedia(DESKTOP_MEDIA_QUERY).matches
  );

  useEffect(() => {
    const mediaQueryList = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const handleChange = () => setIsDesktop(mediaQueryList.matches);

    handleChange();
    mediaQueryList.addEventListener('change', handleChange);
    return () => mediaQueryList.removeEventListener('change', handleChange);
  }, []);

  return isDesktop;
};
