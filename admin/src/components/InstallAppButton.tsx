import React, { useEffect, useState } from 'react';
import { Download, Share, SquarePlus, X } from 'lucide-react';
import { useInstallPrompt } from '../lib/useInstallPrompt';

export const InstallAppButton: React.FC = () => {
  const { canInstall, isIOS, hasNativePrompt, promptInstall } = useInstallPrompt();
  const [showIOSModal, setShowIOSModal] = useState(false);

  useEffect(() => {
    if (!showIOSModal) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowIOSModal(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showIOSModal]);

  if (!canInstall) return null;

  const handleClick = () => {
    if (hasNativePrompt) {
      promptInstall();
    } else if (isIOS) {
      setShowIOSModal(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label="Install this app on your device"
        className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-brand-muted hover:bg-brand-surface-hover hover:text-white transition-colors"
      >
        <Download size={18} />
        Install App
      </button>

      {showIOSModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm animate-fade-in"
          role="presentation"
          onClick={() => setShowIOSModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-modal-title"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-brand-border bg-brand-surface p-6 shadow-2xl animate-pop-in"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 id="install-modal-title" className="text-lg font-bold">
                Install on Your Device
              </h2>
              <button
                type="button"
                onClick={() => setShowIOSModal(false)}
                aria-label="Close"
                className="text-brand-muted hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3.5">
                <span className="flex items-center justify-center w-9 h-9 rounded-full bg-brand-yellow/10 border border-brand-yellow/30 text-brand-yellow shrink-0">
                  <Share size={16} />
                </span>
                <p className="text-sm text-brand-muted">
                  Tap the <strong className="text-white">Share</strong> button in Safari's toolbar.
                </p>
              </div>
              <div className="flex items-center gap-3.5">
                <span className="flex items-center justify-center w-9 h-9 rounded-full bg-brand-yellow/10 border border-brand-yellow/30 text-brand-yellow shrink-0">
                  <SquarePlus size={16} />
                </span>
                <p className="text-sm text-brand-muted">
                  Scroll down and tap <strong className="text-white">Add to Home Screen</strong>.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
