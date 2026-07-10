import React, { useEffect, useRef } from 'react';
import { CheckCircle2 } from 'lucide-react';

interface InfoDialogProps {
  open: boolean;
  title: string;
  message: string;
  onClose: () => void;
}

/** A simple one-button acknowledgment dialog for "this already happened" confirmations. */
export const InfoDialog: React.FC<InfoDialogProps> = ({ open, title, message, onClose }) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="info-dialog-title"
        aria-describedby="info-dialog-message"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-brand-border bg-brand-surface p-6 shadow-2xl animate-pop-in"
      >
        <div className="w-11 h-11 rounded-full bg-brand-yellow/10 border border-brand-yellow/20 flex items-center justify-center mb-4">
          <CheckCircle2 size={20} className="text-brand-yellow" />
        </div>
        <h2 id="info-dialog-title" className="text-lg font-bold mb-2">
          {title}
        </h2>
        <p id="info-dialog-message" className="text-sm text-brand-muted mb-6">
          {message}
        </p>
        <div className="flex justify-end">
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg text-sm font-bold bg-brand-yellow text-brand-black hover:brightness-95 transition-[filter]"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};
