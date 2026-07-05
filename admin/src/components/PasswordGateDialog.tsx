import React, { useEffect, useRef, useState } from 'react';
import { KeyRound } from 'lucide-react';

interface PasswordGateDialogProps {
  open: boolean;
  title: string;
  message: string;
  password: string;
  onVerified: () => void;
  onCancel: () => void;
}

/**
 * A surface-level "type a code before this dangerous action unlocks"
 * step. This is NOT real access control - the code lives in the bundled
 * client JS and is visible to anyone with devtools. It only exists to add
 * friction against an admin accidentally hitting delete, not to guard
 * against a malicious actor. Real authorization is still 100% the
 * server-side verifyAdmin/email-whitelist check on every function call.
 */
export const PasswordGateDialog: React.FC<PasswordGateDialogProps> = ({
  open,
  title,
  message,
  password,
  onVerified,
  onCancel
}) => {
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setValue('');
    setError(false);
    inputRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (value === password) {
      onVerified();
    } else {
      setError(true);
      setValue('');
      inputRef.current?.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="password-gate-title"
        aria-describedby="password-gate-message"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-brand-border bg-brand-surface p-6 shadow-2xl animate-pop-in"
      >
        <div className="w-11 h-11 rounded-full bg-brand-yellow/10 border border-brand-yellow/20 flex items-center justify-center mb-4">
          <KeyRound size={20} className="text-brand-yellow" />
        </div>
        <h2 id="password-gate-title" className="text-lg font-bold mb-2">
          {title}
        </h2>
        <p id="password-gate-message" className="text-sm text-brand-muted mb-4">
          {message}
        </p>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="password"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (error) setError(false);
            }}
            placeholder="Enter CID"
            aria-label="Enter CID"
            autoComplete="off"
            className={`w-full bg-brand-black border rounded-lg px-3 py-2.5 text-white outline-none transition-colors ${
              error ? 'border-red-500 focus:border-red-500' : 'border-brand-border focus:border-brand-yellow'
            }`}
          />
          {error && <p className="text-red-400 text-sm mt-2">Incorrect CID. Try again.</p>}

          <div className="flex justify-end gap-3 mt-5">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 rounded-lg text-sm font-medium text-brand-muted hover:bg-brand-surface-hover hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!value}
              className="px-4 py-2.5 rounded-lg text-sm font-bold bg-brand-yellow text-brand-black disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-95 transition-[filter]"
            >
              Continue
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
