import React, { useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { InstallGuide } from '../lib/installGuides';

interface InstallGuideModalProps {
  guide: InstallGuide;
  onClose: () => void;
  onInstallNow: () => void;
}

export const InstallGuideModal: React.FC<InstallGuideModalProps> = ({ guide, onClose, onInstallNow }) => {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-guide-title"
        onClick={(event) => event.stopPropagation()}
        className="relative w-full max-w-md rounded-sm border border-border-hairline bg-surface-secondary shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-hairline bg-surface shrink-0">
          <h2 id="install-guide-title" className="text-lg font-medium text-text-primary">
            {guide.label}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-text-secondary hover:text-text-primary transition-colors"
          >
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          {guide.intro && (
            <p className="f-small text-text-secondary bg-surface border border-border-hairline rounded-sm px-4 py-3 leading-relaxed">
              {guide.intro}
            </p>
          )}

          {guide.showNativeButton && (
            <button
              type="button"
              onClick={onInstallNow}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-sm bg-surface-inverted text-text-inverted font-medium hover:opacity-90 transition-all active:scale-[0.98]"
            >
              <Download size={18} strokeWidth={1.5} />
              Install Now
            </button>
          )}

          <ol className="space-y-3.5">
            {guide.steps.map((step, index) => (
              <li key={index} className="flex items-start gap-3.5">
                <span className="flex items-center justify-center w-7 h-7 shrink-0 rounded-full border border-border-hairline text-text-primary text-sm font-medium">
                  {index + 1}
                </span>
                <p className="f-body text-text-secondary leading-relaxed pt-0.5">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
};
