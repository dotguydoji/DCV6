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
        className={`group flex-shrink-0 w-[320px] sm:w-[360px] laptop:w-[290px] xl:w-[320px] bg-[#e6ccb3] border rounded-lg overflow-hidden flex flex-col transition-all duration-300 active:scale-[0.98] shadow-2xl shadow-black/20 will-change-transform ${
          isHighlighted
            ? 'animate-highlight border-brand-yellow z-10 scale-[1.02]'
            : isSelected
              ? 'border-brand-yellow ring-2 ring-brand-yellow/30'
              : 'border-[rgba(26,29,30,0.1)] hover:border-brand-yellow/40'
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
            <div className="absolute left-3 top-3 z-10 rounded-full bg-brand-yellow px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-[#1a1d1e] shadow-lg shadow-black/30">
              Pre-order
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-[#e6ccb3] to-transparent opacity-40"></div>
        </div>

        <div className="p-5 laptop:p-5 flex flex-col flex-grow bg-[#e6ccb3]">
          <h3 className="font-poppins font-normal text-lg lg:text-2xl text-[#34393a] mb-1 leading-tight group-hover:text-[#1a1d1e] transition-colors duration-300 line-clamp-2 min-h-[2lh]">
            {product.title}
          </h3>
          <p className="text-xs normal-case text-[#5a5048] mb-2 flex-grow tracking-normal leading-relaxed line-clamp-2 opacity-80 font-normal">
            {product.description}
          </p>

          <div className="mt-auto pt-3 border-t border-[rgba(26,29,30,0.1)] bg-[#1a1d1e] rounded-b-lg -mx-5 -mb-5 px-5 pb-5 flex items-center justify-between h-[80px]">
            {isAvailable ? (
              <>
                {hideCommerce ? (
                  <div className="w-full flex items-center justify-start">
                    <span className="flex items-center justify-center w-12 h-12 border border-white/15 text-white/45">
                      <Download size={22} strokeWidth={2.5} />
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col">
                      {typeof product.originalPrice === 'number' && (
                        <span className="text-sm font-bold tracking-wide text-white/60 line-through">
                          P {product.originalPrice.toLocaleString()}
                        </span>
                      )}
                      <span className="f-price text-[#6b9a7d] drop-shadow-none font-semibold leading-none">
                        P {product.price.toLocaleString()}
                      </span>
                    </div>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleSelect(product, event);
                      }}
                      className={`flex items-center justify-center w-14 h-14 border border-white/20 rounded-none transition-all duration-300 ${
                        isSelected
                          ? 'text-brand-yellow border-brand-yellow bg-brand-yellow/10'
                          : 'text-white hover:text-brand-yellow hover:border-brand-yellow hover:bg-white/5'
                      }`}
                      type="button"
                      aria-label={isSelected ? `Remove ${product.title} from cart` : `Add ${product.title} to cart`}
                    >
                      {isSelected ? <Check size={30} strokeWidth={4} /> : <Plus size={30} strokeWidth={4} />}
                    </button>
                  </>
                )}
              </>
            ) : (
              <>
                <span className="text-sm font-black uppercase tracking-[0.2em] text-brand-yellow/90">
                  Coming Soon
                </span>
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">
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
