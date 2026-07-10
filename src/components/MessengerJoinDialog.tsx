import React, { useEffect, useRef } from 'react';
import { MessageCircle } from 'lucide-react';

const MESSENGER_GROUP_URL = 'https://www.messenger.com/channel/dojicreates/AbYHbTqnuSwFMEYv/';

interface MessengerJoinDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Confirmation step before leaving to Messenger - explains what the group
 * chat is for rather than opening it the moment the menu item is tapped.
 * The actual link is a real <a target="_blank">, not window.open(), so
 * mobile OSes can hand it straight to the Messenger app via their own
 * universal/app-link handling when it's installed, while still never
 * replacing the current dojicreates.com tab if it isn't.
 */
export const MessengerJoinDialog: React.FC<MessengerJoinDialogProps> = ({ open, onClose }) => {
  const joinLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    joinLinkRef.current?.focus();

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
        aria-labelledby="messenger-join-title"
        aria-describedby="messenger-join-message"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm sm:max-w-md lg:max-w-lg rounded-sm border border-white/10 bg-[#242829] p-6 sm:p-8 lg:p-10 shadow-2xl"
      >
        <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-full bg-brand-yellow/10 border border-brand-yellow/20 flex items-center justify-center mb-4 sm:mb-5">
          <MessageCircle size={20} className="sm:hidden text-brand-yellow" strokeWidth={1.5} />
          <MessageCircle size={26} className="hidden sm:block text-brand-yellow" strokeWidth={1.5} />
        </div>
        <h2 id="messenger-join-title" className="text-lg sm:text-2xl lg:text-3xl font-bold text-white mb-2 sm:mb-3">
          Join Our Messenger Group Chat
        </h2>
        <p id="messenger-join-message" className="f-body text-brand-muted mb-6 sm:mb-8">
          Stay updated in our Messenger group - it's where we announce the latest platform changes,
          new features, and freshly released books, notes, and PDFs first.
        </p>
        <div className="flex justify-end gap-3 sm:gap-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 sm:px-6 sm:py-3.5 rounded-sm f-body font-medium text-brand-muted hover:text-white transition-colors"
          >
            Cancel
          </button>
          <a
            ref={joinLinkRef}
            href={MESSENGER_GROUP_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className="px-4 py-2.5 sm:px-6 sm:py-3.5 rounded-sm f-body font-bold bg-brand-yellow text-[#1a1d1e] hover:brightness-95 transition-[filter]"
          >
            Join
          </a>
        </div>
      </div>
    </div>
  );
};
