import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Check, Copy, ImagePlus, Loader2, MessageCircle, ShoppingCart, X } from 'lucide-react';
import { Product } from '../types';
import { DESKTOP_URL } from '../constants';
import { GoogleSignInButton } from './GoogleSignInButton';
import { getCachedIdToken, setCachedIdToken } from '../lib/googleIdentity';
import { submitPaymentScreenshot } from '../lib/orders';

interface CartModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProducts: Product[];
  onToggleSelect: (product: Product, event?: React.MouseEvent) => void;
  hideCommerce?: boolean;
  onOrderSubmitted: () => void;
}

const getLanguageLabel = (product: Product) => {
  if (product.language === 'tl') return 'Tagalog';
  if (product.language === 'en') return 'English';
  return '';
};

const PriceLabel: React.FC<{ value: number }> = ({ value }) => (
  <>
    <span className="text-[0.5em]">P</span> {value.toLocaleString()}
  </>
);

// Displayed with dashes for readability, but only the 11 raw digits are ever
// copied to the clipboard (see copyGcashNumber below) - that's the format
// GCash/Messenger apps actually expect when pasted in.
const GCASH_NUMBER_DISPLAY = '0985-972-4805';
const GCASH_NUMBER_DIGITS = GCASH_NUMBER_DISPLAY.replace(/-/g, '');
const GCASH_NAME = 'Re••a An•••a S.';

const fallbackCopyText = (text: string) => {
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
    // Ignored on purpose - copying is a convenience, not a required step.
  } finally {
    document.body.removeChild(textArea);
  }
};

export const CartModal: React.FC<CartModalProps> = ({
  isOpen,
  onClose,
  selectedProducts,
  onToggleSelect,
  hideCommerce = false,
  onOrderSubmitted
}) => {
  const [step, setStep] = useState<'cart' | 'payment'>('cart');
  const [gcashCopied, setGcashCopied] = useState(false);

  // Screenshot submission - only readable/writable while this modal is
  // open; nothing here is a global auth state. getCachedIdToken() re-reads
  // localStorage fresh on every open, so signing in elsewhere on the site
  // (e.g. My Library) already signs the buyer in here too.
  const [idToken, setIdToken] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [submitState, setSubmitState] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setStep('cart');
      setIdToken(getCachedIdToken());
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const copyGcashNumber = () => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(GCASH_NUMBER_DIGITS)
        .then(() => setGcashCopied(true))
        .catch(() => fallbackCopyText(GCASH_NUMBER_DIGITS));
    } else {
      fallbackCopyText(GCASH_NUMBER_DIGITS);
    }
    setGcashCopied(true);
    setTimeout(() => setGcashCopied(false), 2000);
  };

  const handleFilePick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setPendingFile(file ?? null);
    setSubmitError('');
  };

  const handleSubmitScreenshot = async () => {
    if (!idToken || !pendingFile || selectedProducts.length === 0) return;

    setSubmitState('uploading');
    setSubmitError('');

    try {
      await submitPaymentScreenshot(
        idToken,
        pendingFile,
        selectedProducts.map((product) => product.id)
      );
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setSubmitState('idle');
      onOrderSubmitted();
    } catch (error) {
      setSubmitState('error');
      setSubmitError(error instanceof Error ? error.message : 'Could not submit your screenshot. Please try again.');
    }
  };

  if (!isOpen || hideCommerce) return null;

  const total = selectedProducts.reduce((sum, product) => sum + product.price, 0);
  const isEmpty = selectedProducts.length === 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-modal-title"
        className="relative bg-surface-secondary border border-border-hairline rounded-lg w-full max-w-xl mx-4 max-h-[92vh] overflow-hidden flex flex-col shadow-2xl"
      >
        <div className="flex items-center justify-between px-7 py-5 border-b border-border-hairline bg-surface">
          <div className="flex items-center gap-3 min-w-0">
            {step === 'payment' ? (
              <button
                onClick={() => setStep('cart')}
                aria-label="Back to cart"
                type="button"
                className="p-1.5 -ml-1.5 hover:bg-surface-inverted/5 rounded-full transition-colors shrink-0"
              >
                <ArrowLeft size={22} className="text-text-secondary hover:text-text-primary" />
              </button>
            ) : (
              <ShoppingCart size={28} className="text-text-primary shrink-0" strokeWidth={1.5} />
            )}
            <h2 id="cart-modal-title" className="text-3xl font-light text-text-primary truncate">
              {step === 'payment' ? 'Checkout' : 'Your Cart'}
            </h2>
            {step === 'cart' && selectedProducts.length > 0 && (
              <span className="bg-surface-inverted/10 text-text-primary px-2.5 py-1 rounded-sm text-base font-black shrink-0">
                {selectedProducts.length} ITEMS
              </span>
            )}
          </div>
          <button onClick={onClose} aria-label="Close cart" type="button" className="p-2 hover:bg-surface-inverted/5 rounded-full transition-colors shrink-0">
            <X size={24} className="text-text-secondary hover:text-text-primary" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-7">
          {isEmpty ? (
            <div className="text-center py-16">
              <ShoppingCart size={56} className="mx-auto text-text-secondary/30 mb-5" strokeWidth={1.5} />
              <p className="text-text-secondary text-xl font-medium">Your cart is empty</p>
              <p className="text-text-secondary text-lg mt-2">Select items to add them to your cart</p>
            </div>
          ) : step === 'cart' ? (
            <>
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-text-primary uppercase tracking-wider">Selected Items</h3>
                <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-2 custom-scrollbar">
                  {selectedProducts.map((product) => (
                    <div
                      key={product.id}
                      className="flex items-start gap-4 bg-surface border border-border-hairline rounded-sm p-4"
                    >
                      <img
                        src={product.thumbnail}
                        alt={product.title}
                        className="w-20 h-12 object-cover rounded-sm flex-shrink-0"
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-text-primary text-lg font-medium truncate">{product.title}</p>
                        <p className="text-text-secondary text-sm font-black uppercase tracking-[0.16em] truncate">
                          {product.category}
                          {getLanguageLabel(product) ? ` | ${getLanguageLabel(product)}` : ''}
                        </p>
                        <p className="text-text-primary text-lg font-bold"><PriceLabel value={product.price} /></p>
                      </div>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleSelect(product, event);
                        }}
                        aria-label={`Remove ${product.title} from cart`}
                        type="button"
                        className="p-1.5 hover:bg-surface-inverted/5 rounded transition-colors"
                      >
                        <X size={16} className="text-text-secondary/50 hover:text-red-400" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center pt-5 border-t border-border-hairline">
                  <span className="text-text-secondary text-xl font-bold tracking-wider">TOTAL</span>
                  <span className="text-2xl font-bold text-text-primary"><PriceLabel value={total} /></span>
                </div>
              </div>

              <button
                onClick={() => setStep('payment')}
                type="button"
                className="w-full mt-7 py-5 rounded-sm font-bold text-lg bg-surface-inverted text-text-inverted hover:opacity-90 transition-all touch-manipulation active:scale-[0.98]"
                style={{ minHeight: '56px' }}
              >
                Checkout
              </button>
            </>
          ) : (
            <>
              <p className="text-text-primary text-lg leading-relaxed mb-5">
                Your selected items will appear in your My Library using the Gmail account you signed in with once
                your payment has been verified.
              </p>

              <div className="bg-surface border border-border-hairline rounded-sm p-5 mb-6 space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-text-primary text-lg">
                    <span className="font-bold">GCash:</span> {GCASH_NUMBER_DISPLAY}
                  </p>
                  <button
                    onClick={copyGcashNumber}
                    type="button"
                    aria-label="Copy GCash number"
                    className={`flex items-center justify-center w-9 h-9 rounded-sm border transition-colors shrink-0 ${
                      gcashCopied
                        ? 'bg-green-600 border-green-600 text-white'
                        : 'border-border-hairline text-text-secondary hover:text-text-primary hover:border-border-strong'
                    }`}
                  >
                    {gcashCopied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
                <p className="text-text-primary text-lg">
                  <span className="font-bold">Name:</span> {GCASH_NAME}
                </p>
                <p className="text-text-primary text-lg">
                  <span className="font-bold">Total:</span> <PriceLabel value={total} />
                </p>
              </div>

              <div className="bg-surface border border-border-hairline rounded-sm p-5">
                <h4 className="text-xl font-bold text-text-primary uppercase tracking-wider mb-3">
                  Upload Payment Screenshot
                </h4>

                {!idToken ? (
                  <div className="flex justify-center py-2">
                    <GoogleSignInButton
                      onSignIn={(token) => {
                        setCachedIdToken(token);
                        setIdToken(token);
                      }}
                    />
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <label className="flex items-center justify-center gap-2 border border-dashed border-border-hairline rounded-sm py-6 cursor-pointer hover:border-border-strong transition-colors text-text-secondary">
                      <ImagePlus size={20} strokeWidth={1.5} />
                      <span className="text-base font-medium">
                        {pendingFile ? pendingFile.name : 'Choose a screenshot to upload'}
                      </span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleFilePick}
                        className="hidden"
                      />
                    </label>

                    {submitState === 'error' && (
                      <p className="flex items-center gap-1.5 text-red-400 text-sm">
                        <AlertCircle size={14} className="shrink-0" />
                        {submitError}
                      </p>
                    )}

                    <button
                      onClick={handleSubmitScreenshot}
                      disabled={!pendingFile || submitState === 'uploading'}
                      type="button"
                      className="w-full flex items-center justify-center gap-2 py-4 rounded-sm font-bold text-lg bg-surface-inverted text-text-inverted hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {submitState === 'uploading' ? (
                        <>
                          <Loader2 size={20} className="animate-spin" /> Submitting…
                        </>
                      ) : (
                        'Submit Screenshot'
                      )}
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={() => window.open(DESKTOP_URL, '_blank', 'noopener,noreferrer')}
                type="button"
                className="w-full flex items-center justify-center gap-2 mt-4 py-3.5 rounded-sm font-semibold text-text-secondary border border-border-hairline hover:text-text-primary hover:border-border-strong transition-colors"
              >
                <MessageCircle size={18} strokeWidth={1.5} />
                Talk to an Admin
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
