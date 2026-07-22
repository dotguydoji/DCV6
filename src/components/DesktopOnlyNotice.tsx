import React from 'react';
import { Monitor } from 'lucide-react';

interface DesktopOnlyNoticeProps {
  featureName: string;
  backHref?: string;
  backLabel?: string;
}

/**
 * Blocking notice shown in place of a feature that genuinely requires a
 * physical keyboard/larger screen to work as intended (e.g. Typing Speed) -
 * reusable for any future Productivity feature with the same desktop-only
 * requirement, just pass a different featureName.
 */
export const DesktopOnlyNotice: React.FC<DesktopOnlyNoticeProps> = ({
  featureName,
  backHref = '/my-library',
  backLabel = "Back to My Library"
}) => (
  <div className="min-h-screen flex items-center justify-center font-sans px-6">
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="desktop-only-title"
      aria-describedby="desktop-only-message"
      className="w-full max-w-sm sm:max-w-md rounded-sm border border-orange-500/30 bg-surface p-6 sm:p-8 shadow-2xl text-center"
    >
      <div className="w-14 h-14 rounded-full bg-orange-500/10 border border-orange-500/30 flex items-center justify-center mx-auto mb-5">
        <Monitor size={26} className="text-orange-500" strokeWidth={1.5} />
      </div>
      <h1 id="desktop-only-title" className="text-xl sm:text-2xl font-bold text-text-primary mb-3">
        Desktop Required
      </h1>
      <p id="desktop-only-message" className="f-body text-text-secondary mb-8">
        {featureName} is designed for a physical keyboard and is only available on desktop. Please open this page on
        a computer to continue.
      </p>
      <a
        href={backHref}
        className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-sm f-body font-bold bg-surface-inverted text-text-inverted hover:opacity-90 transition-opacity"
      >
        {backLabel}
      </a>
    </div>
  </div>
);
