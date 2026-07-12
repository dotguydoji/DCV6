import React from 'react';
import { createPortal } from 'react-dom';
import { Clock } from 'lucide-react';

interface IdleWarningModalProps {
  open: boolean;
  secondsRemaining: number;
  onStayActive: () => void;
}

/**
 * Shown after a long stretch with zero interaction, before background
 * activity (e.g. PdfViewer's proactive signed-URL refresh) gets paused.
 * Purely a UI prompt - any interaction anywhere on the page dismisses it
 * (the underlying useIdleTimeout hook listens document-wide), this button
 * is just the obvious, explicit way to do that.
 */
export const IdleWarningModal: React.FC<IdleWarningModalProps> = ({ open, secondsRemaining, onStayActive }) => {
  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="idle-warning-title"
      aria-describedby="idle-warning-message"
    >
      <div className="w-full max-w-sm rounded-sm border border-border-hairline bg-surface p-6 shadow-2xl text-center">
        <div className="w-12 h-12 mx-auto rounded-full bg-surface-secondary border border-border-hairline flex items-center justify-center mb-4">
          <Clock size={22} strokeWidth={1.5} className="text-text-primary" />
        </div>
        <h2 id="idle-warning-title" className="text-lg font-bold text-text-primary mb-2">
          Are you still there?
        </h2>
        <p id="idle-warning-message" className="text-text-secondary text-sm mb-5 leading-relaxed">
          We'll pause background activity in{' '}
          <span className="font-mono font-bold text-text-primary">{secondsRemaining}</span>s if there's no response.
          Nothing you've done will be lost - reading picks up right where you left off.
        </p>
        <button
          type="button"
          onClick={onStayActive}
          className="w-full py-3 rounded-sm font-bold text-xs uppercase tracking-wider bg-surface-inverted text-text-inverted hover:opacity-90 transition-colors"
        >
          Yes, I'm still here
        </button>
      </div>
    </div>,
    document.body
  );
};
