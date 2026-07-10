import React, { useEffect, useRef } from 'react';
import { Lock } from 'lucide-react';

interface NoPdfAccessDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Shown instead of MessengerJoinDialog when the signed-in buyer (or a
 * signed-out visitor) owns zero PDFs - same modal shell/style, just a
 * dead-end message rather than a join link.
 */
export const NoPdfAccessDialog: React.FC<NoPdfAccessDialogProps> = ({ open, onClose }) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-300"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="no-pdf-access-title"
        aria-describedby="no-pdf-access-message"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm sm:max-w-md lg:max-w-lg rounded-sm border border-white/10 bg-[#242829] p-6 sm:p-8 lg:p-10 shadow-2xl"
      >
        <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-full bg-brand-yellow/10 border border-brand-yellow/20 flex items-center justify-center mb-4 sm:mb-5">
          <Lock size={20} className="sm:hidden text-brand-yellow" strokeWidth={1.5} />
          <Lock size={26} className="hidden sm:block text-brand-yellow" strokeWidth={1.5} />
        </div>
        <h2 id="no-pdf-access-title" className="text-lg sm:text-2xl lg:text-3xl font-bold text-white mb-2 sm:mb-3">
          PDF Access Required
        </h2>
        <p id="no-pdf-access-message" className="f-body text-brand-muted mb-6 sm:mb-8">
          You need to have at least one PDF access in order to join the Messenger group chat.
        </p>
        <div className="flex justify-end">
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 sm:px-6 sm:py-3.5 rounded-sm f-body font-bold bg-brand-yellow text-[#1a1d1e] hover:brightness-95 transition-[filter]"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
