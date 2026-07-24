import React, { useState } from 'react';
import { Monitor, Smartphone, X } from 'lucide-react';
import { MOBILE_URL, DESKTOP_URL } from '../constants';

interface OrderSubmittedModalProps {
  open: boolean;
  onClose: () => void;
}

const MESSAGE_TEXT = 'Hi admins, I have availed a PDF. Kindly check.';

/**
 * Shown right after a screenshot upload succeeds. This IS the notification
 * mechanism for new orders (see project notes) - deliberately not a push
 * notification or a polling admin panel, both of which would cost real
 * Netlify/Firestore requests for no benefit. Instead, the buyer is prompted
 * to send one quick Messenger message, which Meta's own infrastructure
 * reliably delivers as a real phone notification, for zero cost to us.
 */
export const OrderSubmittedModal: React.FC<OrderSubmittedModalProps> = ({ open, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const fallbackCopy = (text: string) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
    } catch {
      // Ignored on purpose - copying is a convenience, not a required step;
      // the buyer can still type the message manually into Messenger.
    } finally {
      document.body.removeChild(textArea);
    }
  };

  const copyMessage = () => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(MESSAGE_TEXT)
        .then(() => setCopied(true))
        .catch(() => fallbackCopy(MESSAGE_TEXT));
    } else {
      fallbackCopy(MESSAGE_TEXT);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNotify = (platform: 'mobile' | 'desktop') => {
    copyMessage();
    const url = platform === 'mobile' ? MOBILE_URL : DESKTOP_URL;
    if (platform === 'mobile') {
      window.location.assign(url);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} role="presentation" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-submitted-title"
        className="relative bg-surface-secondary border border-border-hairline rounded-lg w-full max-w-md mx-4 shadow-2xl p-7"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          type="button"
          className="absolute top-4 right-4 p-2 hover:bg-surface-inverted/5 rounded-full transition-colors"
        >
          <X size={22} className="text-text-secondary hover:text-text-primary" />
        </button>

        <h2 id="order-submitted-title" className="text-2xl font-bold text-text-primary mb-2 pr-8">
          Screenshot of Payment Submitted
        </h2>
        <p className="text-text-secondary text-base mb-5">
          Kindly wait for 20 minutes, or you can notify the admin.
        </p>

        <div className="bg-surface border border-border-hairline rounded-sm p-4 mb-4 text-text-primary text-lg">
          {MESSAGE_TEXT}
        </div>

        <button
          onClick={copyMessage}
          type="button"
          className={`w-full flex items-center justify-center gap-2 py-4 rounded-sm font-bold text-lg transition-all touch-manipulation active:scale-[0.98] mb-4 ${
            copied
              ? 'bg-green-600 text-white cursor-default'
              : 'bg-surface-inverted text-text-inverted hover:opacity-90 cursor-pointer'
          }`}
        >
          {copied ? 'Copied!' : 'Copy Text'}
        </button>

        <div className="grid grid-cols-2 gap-3.5">
          <button
            onClick={() => handleNotify('mobile')}
            type="button"
            className="flex items-center justify-center gap-2 bg-surface-inverted text-text-inverted border border-surface-inverted py-4 rounded-sm transition-all duration-300 hover:opacity-90 active:scale-95 font-bold"
          >
            <Smartphone size={18} strokeWidth={1.5} className="hidden sm:block" />
            <span>Notify through Mobile</span>
          </button>
          <button
            onClick={() => handleNotify('desktop')}
            type="button"
            className="flex items-center justify-center gap-2 bg-surface-inverted text-text-inverted border border-surface-inverted py-4 rounded-sm transition-all duration-300 hover:opacity-90 active:scale-95 font-bold"
          >
            <Monitor size={18} strokeWidth={1.5} className="hidden sm:block" />
            <span>Notify through Desktop</span>
          </button>
        </div>
      </div>
    </div>
  );
};
