import React, { memo, useCallback, useEffect, useRef } from 'react';
import { Check, Download, Plus } from 'lucide-react';
import { Product } from '../types';

interface ProductCardProps {
  product: Product;
  isHighlighted?: boolean;
  isSelected: boolean;
  onToggleSelect: (product: Product, event?: React.MouseEvent) => void;
  hideCommerce?: boolean;
  priority?: boolean;
}

export const ProductCard = memo(
  ({ product, isHighlighted, isSelected, onToggleSelect, hideCommerce = false, priority = false }: ProductCardProps) => {
    const cardRef = useRef<HTMLDivElement>(null);
    const scrollTimeoutRef = useRef<number | null>(null);
    const isAvailable = product.available !== false;

    useEffect(() => {
      if (isHighlighted && cardRef.current) {
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }

        scrollTimeoutRef.current = window.setTimeout(() => {
          cardRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'center'
          });
        }, 300);
      }

      return () => {
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
      };
    }, [isHighlighted]);

    const handleImageLoad = useCallback((event: React.SyntheticEvent<HTMLImageElement>) => {
      event.currentTarget.style.willChange = 'auto';
    }, []);

    return (
      <div
        ref={cardRef}
        className={`group flex-shrink-0 w-[320px] sm:w-[360px] laptop:w-[290px] xl:w-[320px] bg-surface border rounded-sm overflow-hidden flex flex-col transition-all duration-300 active:scale-[0.98] will-change-transform card-elevated hover:-translate-y-0.5 ${
          isHighlighted
            ? 'animate-highlight border-border-strong z-10 scale-[1.02]'
            : isSelected
              ? 'border-border-strong ring-2 ring-border-strong/20'
              : 'border-border-hairline hover:border-border-strong'
        }`}
      >
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-gray-950/50">
          <img
            src={product.thumbnail}
            alt={product.title}
            className="w-full h-full object-cover transition-transform duration-700 ease-in-out group-hover:scale-110 will-change-transform"
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
            decoding="async"
            referrerPolicy="no-referrer"
            onLoad={handleImageLoad}
          />

          {product.preOrder && (
            <div className="absolute left-3 top-3 z-10 rounded-full bg-surface-inverted px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-text-inverted">
              Pre-order
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-surface to-transparent opacity-40"></div>
        </div>

        <div className="p-5 laptop:p-5 flex flex-col flex-grow bg-surface">
          <h3 className="font-poppins font-normal text-lg lg:text-2xl text-text-primary mb-1 leading-tight transition-colors duration-300 line-clamp-2 min-h-[2lh]">
            {product.title}
          </h3>
          <p className="text-xs normal-case text-text-secondary mb-4 flex-grow tracking-normal leading-relaxed line-clamp-2 font-normal">
            {product.description}
          </p>

          <div className="mt-auto border-t border-border-hairline bg-surface-inverted rounded-b-sm -mx-5 -mb-5 px-5 py-2.5 flex items-center justify-between">
            {isAvailable ? (
              <>
                {hideCommerce ? (
                  <div className="w-full flex items-center justify-start">
                    <span className="flex items-center justify-center w-10 h-10 border border-text-inverted/15 text-text-inverted/45">
                      <Download size={18} strokeWidth={1.5} />
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col">
                      {typeof product.originalPrice === 'number' && (
                        <span className="text-sm font-bold tracking-wide text-text-inverted/60 line-through">
                          <span className="text-[0.5em]">P</span> {product.originalPrice.toLocaleString()}
                        </span>
                      )}
                      <span className="f-price text-text-inverted font-semibold leading-none">
                        <span className="text-[0.5em]">P</span> {product.price.toLocaleString()}
                      </span>
                    </div>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleSelect(product, event);
                      }}
                      className={`flex items-center justify-center w-11 h-11 border border-text-inverted/20 rounded-none transition-all duration-300 ${
                        isSelected
                          ? 'text-text-inverted border-text-inverted bg-text-inverted/10'
                          : 'text-text-inverted/70 hover:text-text-inverted hover:border-text-inverted hover:bg-text-inverted/5'
                      }`}
                      type="button"
                      aria-label={isSelected ? `Remove ${product.title} from cart` : `Add ${product.title} to cart`}
                    >
                      {isSelected ? <Check size={22} strokeWidth={2} /> : <Plus size={22} strokeWidth={2} />}
                    </button>
                  </>
                )}
              </>
            ) : (
              <>
                <span className="text-sm font-semibold uppercase tracking-[0.2em] text-text-inverted">
                  Coming Soon
                </span>
                <span className="text-xs font-medium uppercase tracking-[0.2em] text-text-inverted/60">
                  Not Available
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.product.id === nextProps.product.id &&
      prevProps.product.available === nextProps.product.available &&
      prevProps.product.preOrder === nextProps.product.preOrder &&
      prevProps.isHighlighted === nextProps.isHighlighted &&
      prevProps.isSelected === nextProps.isSelected &&
      prevProps.hideCommerce === nextProps.hideCommerce &&
      prevProps.priority === nextProps.priority
    );
  }
);

ProductCard.displayName = 'ProductCard';
