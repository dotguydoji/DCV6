import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Copy } from 'lucide-react';

interface GrantSuccessDialogProps {
  open: boolean;
  message: string;
  onClose: () => void;
}

/**
 * Shown right after a successful grant - the message in the textbox is what
 * the admin pastes to the buyer, so the whole point of the Copy button is
 * to get it onto the clipboard in one click rather than a manual select-all.
 */
export const GrantSuccessDialog: React.FC<GrantSuccessDialogProps> = ({ open, message, onClose }) => {
  const [copyError, setCopyError] = useState(false);
  const copyButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setCopyError(false);
    copyButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      onClose();
    } catch {
      // Clipboard API can be unavailable (older browsers, permissions) -
      // leave the dialog open so the admin can still select the text by
      // hand instead of losing the message with no way to recover it.
      setCopyError(true);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="grant-success-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-lg rounded-xl border border-brand-border bg-brand-surface p-6 shadow-2xl animate-pop-in"
      >
        <div className="w-11 h-11 rounded-full bg-brand-yellow/10 border border-brand-yellow/20 flex items-center justify-center mb-4">
          <CheckCircle2 size={20} className="text-brand-yellow" />
        </div>
        <h2 id="grant-success-title" className="text-lg font-bold mb-2">
          Access granted
        </h2>
        <p className="text-sm text-brand-muted mb-4">
          Send this message to the buyer to let them know their access is ready.
        </p>

        <textarea
          readOnly
          value={message}
          rows={9}
          aria-label="Buyer confirmation message"
          className="w-full bg-brand-black border border-brand-border rounded-lg px-3 py-2.5 text-white text-sm outline-none resize-none focus:border-brand-yellow transition-colors"
          onFocus={(event) => event.currentTarget.select()}
        />

        {copyError && (
          <p className="text-red-400 text-sm mt-2">
            Couldn't copy automatically - select the text above and copy it manually.
          </p>
        )}

        <div className="flex justify-end gap-3 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg text-sm font-medium text-brand-muted hover:bg-brand-surface-hover hover:text-white transition-colors"
          >
            Close
          </button>
          <button
            ref={copyButtonRef}
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold bg-brand-yellow text-brand-black hover:brightness-95 transition-[filter]"
          >
            <Copy size={16} />
            Copy
          </button>
        </div>
      </div>
    </div>
  );
};
