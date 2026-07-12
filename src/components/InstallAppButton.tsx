import React from 'react';
import { Download } from 'lucide-react';
import { InstallGuide } from '../lib/installGuides';

interface InstallAppButtonProps {
  /** 'desktop' matches the inline nav row's item styling; 'mobile' matches the hamburger sheet's item styling. */
  variant: 'desktop' | 'mobile';
  canInstall: boolean;
  guide: InstallGuide;
  onOpen: () => void;
}

/**
 * Trigger only - does not render the modal itself. The modal has to live
 * outside the hamburger sheet's DOM subtree (see InstallGuideModal usage in
 * Navbar.tsx): that subtree has overflow-hidden plus an animated max-height,
 * and a fixed + backdrop-blur descendant of that combination silently fails
 * to paint in Chromium even though its computed layout is entirely correct -
 * confirmed via getBoundingClientRect()/computed styles all being right
 * while nothing actually rendered on screen. MessengerJoinDialog/
 * NoPdfAccessDialog already avoid this by rendering as top-level siblings
 * of <nav>, not nested inside it - this follows the same pattern.
 */
export const InstallAppButton: React.FC<InstallAppButtonProps> = ({ variant, canInstall, guide, onOpen }) => {
  if (!canInstall) return null;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={guide.label}
      className={
        variant === 'desktop'
          ? 'flex items-center gap-2 shrink-0 px-4 laptop:px-5 py-2.5 laptop:py-3 rounded-sm border border-border-hairline text-sm laptop:text-base font-medium text-text-primary hover:border-border-strong transition-colors'
          : 'flex items-center gap-3 px-4 py-3.5 rounded-sm border border-border-hairline text-text-primary font-medium hover:border-border-strong transition-colors'
      }
    >
      <Download size={variant === 'desktop' ? 18 : 20} strokeWidth={1.5} />
      {guide.label}
    </button>
  );
};
