import React from 'react';

interface PdfLoadingOverlayProps {
  percent: number;
}

/**
 * Purely presentational - shows a rotating wireframe-cube spinner (from
 * https://uiverse.io/faxriddin20/light-vampirebat-74, recolored via
 * var(--border-strong) instead of the original's hardcoded "lime" so it
 * follows this site's dark/light theme automatically - see the
 * .pdf-cube-spinner rules in index.css). No visible percent text - `percent`
 * is still taken and clamped only to keep the aria-label announcing real
 * progress for screen readers. Has no knowledge of PDF.js, loading tasks,
 * or anything else - PdfViewer.tsx is entirely responsible for computing
 * what percent to pass in, so this component can't affect loading behavior
 * at all.
 */
export const PdfLoadingOverlay: React.FC<PdfLoadingOverlayProps> = ({ percent }) => {
  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-surface">
      <div className="pdf-cube-spinner" role="img" aria-label={`Loading PDF, ${Math.round(clamped)}%`}>
        <div />
        <div />
        <div />
        <div />
        <div />
        <div />
      </div>
    </div>
  );
};
