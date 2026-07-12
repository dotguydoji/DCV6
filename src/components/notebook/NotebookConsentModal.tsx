import React from 'react';
import { HardDriveDownload, ShieldCheck } from 'lucide-react';

interface NotebookConsentModalProps {
  onAllow: () => void;
  onDecline: () => void;
}

/**
 * Shown once, the first time someone opens the Notebook on a given device.
 * The Notebook has no backend at all - this is the only place that decision
 * is ever surfaced to the buyer, so it needs to be explicit rather than
 * silently writing to their browser the first time they type something.
 */
export const NotebookConsentModal: React.FC<NotebookConsentModalProps> = ({ onAllow, onDecline }) => (
  <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="notebook-consent-title"
      className="w-full max-w-sm sm:max-w-md rounded-sm border border-border-hairline bg-surface p-6 sm:p-8 shadow-2xl"
    >
      <div className="w-12 h-12 rounded-full bg-surface-secondary border border-border-hairline flex items-center justify-center mb-4">
        <HardDriveDownload size={22} strokeWidth={1.5} className="text-text-primary" />
      </div>
      <h2 id="notebook-consent-title" className="text-lg sm:text-xl font-bold text-text-primary mb-2">
        Save notes on this device?
      </h2>
      <p className="text-text-secondary text-sm leading-relaxed mb-4">
        The Notebook has no server of its own - everything you write is saved only in this browser's local storage,
        on this device. Nothing is uploaded or sent anywhere.
      </p>
      <div className="flex items-start gap-2 text-xs text-text-secondary mb-6 bg-surface-secondary border border-border-hairline rounded-sm p-3">
        <ShieldCheck size={16} strokeWidth={1.5} className="shrink-0 mt-0.5" />
        <span>
          If you say no, you can still write notes for this visit, but they'll be lost as soon as you close this tab.
        </span>
      </div>
      <div className="flex flex-col-reverse sm:flex-row gap-3">
        <button
          type="button"
          onClick={onDecline}
          className="flex-1 py-3 rounded-sm font-bold text-xs uppercase tracking-wider bg-surface-secondary border border-border-hairline text-text-secondary hover:text-text-primary transition-colors"
        >
          Not now
        </button>
        <button
          type="button"
          onClick={onAllow}
          className="flex-1 py-3 rounded-sm font-bold text-xs uppercase tracking-wider bg-surface-inverted text-text-inverted hover:opacity-90 transition-colors shadow-lg"
        >
          Allow &amp; Save Locally
        </button>
      </div>
    </div>
  </div>
);
