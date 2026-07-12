import React from 'react';
import { X } from 'lucide-react';

interface PdfInfoModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export const PdfInfoModal: React.FC<PdfInfoModalProps> = ({ title, onClose, children }) => (
  <div
    className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm flex items-center justify-center px-4"
    onClick={onClose}
  >
    <div
      className="bg-surface-secondary border border-border-hairline rounded-sm shadow-2xl max-w-md w-full max-h-[80vh] overflow-y-auto"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-border-hairline sticky top-0 bg-surface-secondary">
        <h2 className="font-medium text-text-primary">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="text-text-secondary hover:text-text-primary">
          <X size={18} strokeWidth={1.5} />
        </button>
      </div>
      <div className="px-5 py-4 text-sm text-text-secondary">{children}</div>
    </div>
  </div>
);
