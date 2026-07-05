import React, { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A reusable, accessible replacement for window.confirm(). Purely
 * presentational - callers still own whatever async action actually runs
 * when the admin confirms; this component only decides whether that call
 * happens, exactly like window.confirm did before.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel
}) => {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-brand-border bg-brand-surface p-6 shadow-2xl animate-pop-in"
      >
        <div className="w-11 h-11 rounded-full bg-red-400/10 border border-red-400/20 flex items-center justify-center mb-4">
          <AlertTriangle size={20} className="text-red-400" />
        </div>
        <h2 id="confirm-dialog-title" className="text-lg font-bold mb-2">
          {title}
        </h2>
        <p id="confirm-dialog-message" className="text-sm text-brand-muted mb-6">
          {message}
        </p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 rounded-lg text-sm font-medium text-brand-muted hover:bg-brand-surface-hover hover:text-white transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            className="px-4 py-2.5 rounded-lg text-sm font-bold bg-red-500 text-white hover:bg-red-600 transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
