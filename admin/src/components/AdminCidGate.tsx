import React, { useRef, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { getAdminCid } from '../lib/cid';

interface AdminCidGateProps {
  onVerified: () => void;
}

export const AdminCidGate: React.FC<AdminCidGateProps> = ({ onVerified }) => {
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (value === getAdminCid()) {
      onVerified();
      return;
    }
    setError(true);
    setValue('');
    inputRef.current?.focus();
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-sm w-full text-center animate-fade-in">
        <div className="mx-auto mb-5 w-16 h-16 rounded-2xl bg-brand-surface border border-brand-border flex items-center justify-center">
          <KeyRound size={30} className="text-brand-yellow" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Enter CID to Continue</h1>
        <p className="text-brand-muted mb-8">
          For extra protection, please enter the CID every time you open this panel.
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
            autoFocus
            autoComplete="off"
            className={`w-full bg-brand-black border rounded-lg px-3 py-2.5 text-white text-center outline-none transition-colors ${
              error ? 'border-red-500 focus:border-red-500' : 'border-brand-border focus:border-brand-yellow'
            }`}
          />
          {error && <p className="text-red-400 text-sm mt-2">Incorrect CID. Try again.</p>}

          <button
            type="submit"
            disabled={!value}
            className="w-full mt-5 px-4 py-2.5 rounded-lg text-sm font-bold bg-brand-yellow text-brand-black disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-95 transition-[filter]"
          >
            Continue
          </button>
        </form>
      </div>
    </div>
  );
};
