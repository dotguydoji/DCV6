import React, { useEffect } from 'react';
import { Copy, Monitor, ShoppingCart, Smartphone, X } from 'lucide-react';
import { Product } from '../types';

interface CartModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProducts: Product[];
  onToggleSelect: (product: Product, event?: React.MouseEvent) => void;
  hideCommerce?: boolean;
}

const getLanguageLabel = (product: Product) => {
  if (product.language === 'tl') return 'Tagalog';
  if (product.language === 'en') return 'English';
  return '';
};

const formatPrice = (value: number, billingPeriod?: 'month') =>
  `P ${value.toLocaleString()}${billingPeriod === 'month' ? '/mo' : ''}`;

const PriceLabel: React.FC<{ value: number }> = ({ value }) => (
  <>
    <span className="text-[0.5em]">P</span> {value.toLocaleString()}
  </>
);

const formatOrderLine = (product: Product) => {
  const languageLabel = getLanguageLabel(product);
  const price = formatPrice(product.price, product.billingPeriod);
  return languageLabel
    ? `${product.title} (${languageLabel}) - ${price}`
    : `${product.title} - ${price}`;
};

export const CartModal: React.FC<CartModalProps> = ({
  isOpen,
  onClose,
  selectedProducts,
  onToggleSelect,
  hideCommerce = false
}) => {
  const [copied, setCopied] = React.useState(false);

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

  const buildOrderText = () => {
    const orderList = selectedProducts
      .map((product, index) => `${index + 1}. ${formatOrderLine(product)}`)
      .join('\n');

    const total = selectedProducts.reduce((sum, product) => sum + product.price, 0);
    return `My Order:\n${orderList}\n\nTotal: ${formatPrice(total)}`;
  };

  const fallbackCopy = (text: string, showFeedback = true) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    textArea.style.opacity = '0';

    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      const successful = document.execCommand('copy');
      if (successful && showFeedback) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        if (!successful) {
          console.error('execCommand copy failed');
        }
      }
    } catch (error) {
      console.error('execCommand copy error:', error);
    } finally {
      document.body.removeChild(textArea);
    }
  };

  const copyOrderToClipboard = (showFeedback = true) => {
    if (selectedProducts.length === 0) return;

    const fullText = buildOrderText();

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(fullText)
        .then(() => {
          if (showFeedback) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }
        })
        .catch((error) => {
          console.error('Clipboard API failed:', error);
          fallbackCopy(fullText, showFeedback);
        });
    } else {
      fallbackCopy(fullText, showFeedback);
    }
  };

  const copyOrderBeforeRedirect = () => {
    if (selectedProducts.length === 0) return;

    const fullText = buildOrderText();

    try {
      fallbackCopy(fullText, false);
    } catch (error) {
      console.error('Synchronous copy before redirect failed:', error);
      copyOrderToClipboard(false);
    }
  };

  const handleCopyOrder = (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    copyOrderToClipboard(true);
  };

  const handleBuyNow = (platform: 'mobile' | 'desktop') => {
    if (selectedProducts.length === 0) return;

    copyOrderBeforeRedirect();

    const url =
      platform === 'mobile'
        ? (selectedProducts[0]?.mobileUrl ?? 'https://m.me/103186496068437')
        : (selectedProducts[0]?.desktopUrl ?? 'https://www.facebook.com/share/p/1HMaPSeaty/');

    if (platform === 'mobile') {
      window.location.assign(url);
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (!isOpen || hideCommerce) return null;

  const total = selectedProducts.reduce((sum, product) => sum + product.price, 0);

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
          <div className="flex items-center gap-3">
            <ShoppingCart size={28} className="text-text-primary" strokeWidth={1.5} />
            <h2 id="cart-modal-title" className="text-3xl font-light text-text-primary">Your Cart</h2>
            {selectedProducts.length > 0 && (
              <span className="bg-surface-inverted/10 text-text-primary px-2.5 py-1 rounded-sm text-base font-black">
                {selectedProducts.length} ITEMS
              </span>
            )}
          </div>
          <button onClick={onClose} aria-label="Close cart" type="button" className="p-2 hover:bg-surface-inverted/5 rounded-full transition-colors">
            <X size={24} className="text-text-secondary hover:text-text-primary" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-7">
          {selectedProducts.length === 0 ? (
            <div className="text-center py-16">
              <ShoppingCart size={56} className="mx-auto text-text-secondary/30 mb-5" strokeWidth={1.5} />
              <p className="text-text-secondary text-xl font-medium">Your cart is empty</p>
              <p className="text-text-secondary text-lg mt-2">Select items to add them to your cart</p>
            </div>
          ) : (
            <>
              <div className="space-y-4 mb-7">
                <h3 className="text-lg font-bold text-text-primary uppercase tracking-wider">Selected Items</h3>
                <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-2 custom-scrollbar">
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

              <div className="bg-surface border border-border-hairline rounded-sm p-5 mb-7">
                <h4 className="text-xl font-bold text-text-primary uppercase tracking-wider mb-3">
                  How to Purchase
                </h4>
                <p className="text-text-primary text-xl leading-relaxed">
                  Click the copy button to copy your order. Then, send it to our Facebook page. You can click the
                  button below if you&apos;re using mobile or desktop.
                </p>
              </div>

              <div className="space-y-3.5">
                <button
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleCopyOrder(event);
                  }}
                  className={`w-full flex items-center justify-center gap-2.5 py-5 rounded-sm font-bold text-lg transition-all touch-manipulation active:scale-[0.98] ${
                    copied
                      ? 'bg-green-600 text-white cursor-default'
                      : 'bg-surface-inverted text-text-inverted hover:opacity-90 cursor-pointer'
                  }`}
                  style={{ minHeight: '56px' }}
                  type="button"
                >
                  {copied ? (
                    <>
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      COPIED!
                    </>
                  ) : (
                    <>
                      <Copy size={20} strokeWidth={1.5} />
                      COPY ORDER LIST
                    </>
                  )}
                </button>

                <div className="grid grid-cols-2 gap-3.5">
                  <button
                    onClick={() => handleBuyNow('mobile')}
                    className="flex items-center justify-center gap-2 bg-surface-inverted text-text-inverted border border-surface-inverted py-4 rounded-sm transition-all duration-300 hover:opacity-90 active:scale-95 font-bold"
                  >
                    <Smartphone size={18} strokeWidth={1.5} className="hidden sm:block" />
                    <span className="text-lg">BUY WITH MOBILE</span>
                  </button>
                  <button
                    onClick={() => handleBuyNow('desktop')}
                    className="flex items-center justify-center gap-2 bg-surface-inverted text-text-inverted border border-surface-inverted py-4 rounded-sm transition-all duration-300 hover:opacity-90 active:scale-95 font-bold"
                  >
                    <Monitor size={18} strokeWidth={1.5} className="hidden sm:block" />
                    <span className="text-lg">BUY WITH DESKTOP</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
