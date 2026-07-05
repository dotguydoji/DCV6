import React from 'react';
import { X } from 'lucide-react';

interface PdfInfoModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export const PdfInfoModal: React.FC<PdfInfoModalProps> = ({ title, onClose, children }) => (
  <div
    className="fixed inset-0 z-[300] bg-black/70 flex items-center justify-center px-4"
    onClick={onClose}
  >
    <div
      className="bg-[#242829] border border-white/10 rounded-sm shadow-2xl max-w-md w-full max-h-[80vh] overflow-y-auto"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 sticky top-0 bg-[#242829]">
        <h2 className="font-bold text-white">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="text-brand-muted hover:text-white">
          <X size={18} />
        </button>
      </div>
      <div className="px-5 py-4 text-sm text-brand-muted">{children}</div>
    </div>
  </div>
);
