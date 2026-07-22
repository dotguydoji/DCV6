import React, { useEffect, useRef } from 'react';
import { Lock } from 'lucide-react';

interface ProductivitySubscribeDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Shown when a signed-in buyer (or signed-out visitor) clicks a Productivity
 * feature link (e.g. Typing Speed) without being granted access -
 * mirrors NoPdfAccessDialog's shell but points at the Productivity category
 * on the main page instead of a dead end, since this is something they can
 * actually subscribe to.
 */
export const ProductivitySubscribeDialog: React.FC<ProductivitySubscribeDialogProps> = ({ open, onClose }) => {
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
      className="fixed inset-0 z-[300] flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="productivity-subscribe-title"
        aria-describedby="productivity-subscribe-message"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm sm:max-w-md lg:max-w-lg rounded-sm border border-orange-500/30 bg-surface p-6 sm:p-8 lg:p-10 shadow-2xl"
      >
        <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-full bg-orange-500/10 border border-orange-500/30 flex items-center justify-center mb-4 sm:mb-5">
          <Lock size={20} className="sm:hidden text-orange-500" strokeWidth={1.5} />
          <Lock size={26} className="hidden sm:block text-orange-500" strokeWidth={1.5} />
        </div>
        <h2 id="productivity-subscribe-title" className="text-lg sm:text-2xl lg:text-3xl font-bold text-text-primary mb-2 sm:mb-3">
          Productivity Subscription Required
        </h2>
        <p id="productivity-subscribe-message" className="f-body text-text-secondary mb-6 sm:mb-8">
          The Typing Speed is part of the Productivity category (₱59/month). Add it to your cart from Doji's
          Library to subscribe, and it'll unlock here automatically once your access is granted.
        </p>
        <div className="flex flex-col sm:flex-row justify-end gap-3">
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 sm:px-6 sm:py-3.5 rounded-sm f-body font-bold border border-border-hairline text-text-primary hover:border-border-strong transition-colors"
          >
            Close
          </button>
          <a
            href="/"
            className="px-4 py-2.5 sm:px-6 sm:py-3.5 rounded-sm f-body font-bold bg-orange-500 text-white hover:bg-orange-400 transition-colors text-center"
          >
            Browse Productivity
          </a>
        </div>
      </div>
    </div>
  );
};
