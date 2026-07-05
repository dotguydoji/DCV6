import React, { useEffect, useState } from 'react';
import { Download, Share, SquarePlus, X } from 'lucide-react';
import { useInstallPrompt } from '../lib/useInstallPrompt';

interface InstallAppButtonProps {
  variant?: 'full' | 'icon';
}

export const InstallAppButton: React.FC<InstallAppButtonProps> = ({ variant = 'full' }) => {
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

  const label = isIOS ? 'Add to Home Screen' : 'Install App';

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label={label}
        className={
          variant === 'icon'
            ? 'flex items-center justify-center w-12 h-12 rounded border border-white/10 text-brand-gray hover:border-brand-yellow/50 hover:text-brand-yellow transition-all duration-300 active:scale-90'
            : 'flex items-center gap-2 shrink-0 px-4 laptop:px-5 py-2.5 laptop:py-3 rounded-sm border border-white/10 text-sm laptop:text-base font-bold text-white hover:border-brand-yellow/50 hover:text-brand-yellow transition-colors'
        }
      >
        <Download size={variant === 'icon' ? 22 : 18} />
        {variant === 'full' && label}
      </button>

      {showIOSModal && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center px-4"
          role="presentation"
          onClick={() => setShowIOSModal(false)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-modal-title"
            onClick={(event) => event.stopPropagation()}
            className="relative w-full max-w-sm rounded-lg border border-white/10 bg-[#242829] shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-[#1a1d1e]">
              <h2 id="install-modal-title" className="text-lg font-bold text-white">
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

            <div className="px-5 py-5 space-y-4">
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
