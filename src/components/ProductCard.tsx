import React, { memo, useCallback, useEffect, useRef } from 'react';
import { Check, Plus } from 'lucide-react';
import { Product } from '../types';

interface ProductCardProps {
  product: Product;
  isHighlighted?: boolean;
  isSelected: boolean;
  onToggleSelect: (product: Product, event?: React.MouseEvent) => void;
}

export const ProductCard = memo(
  ({ product, isHighlighted, isSelected, onToggleSelect }: ProductCardProps) => {
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
        className={`group flex-shrink-0 w-[320px] sm:w-[360px] laptop:w-[290px] xl:w-[320px] bg-[#F5F5DC] border rounded-lg overflow-hidden flex flex-col transition-all duration-300 active:scale-[0.98] shadow-2xl shadow-black/20 will-change-transform ${
          isHighlighted
            ? 'animate-highlight border-yellow-600 z-10 scale-[1.02]'
            : isSelected
              ? 'border-yellow-600 ring-2 ring-yellow-600/30'
              : 'border-black/5 hover:border-yellow-600/40'
        }`}
      >
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-gray-950/50">
          <img
            src={product.thumbnail}
            alt={product.title}
            className="w-full h-full object-cover transition-transform duration-700 ease-in-out group-hover:scale-110 will-change-transform"
            loading="lazy"
            decoding="async"
            onLoad={handleImageLoad}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#F5F5DC] to-transparent opacity-40"></div>
        </div>

        <div className="p-5 laptop:p-5 flex flex-col flex-grow bg-[#F5F5DC]">
          <h3 className="f-body font-poppins font-medium text-black mb-1 leading-tight group-hover:text-yellow-600 transition-colors duration-300 truncate">
            {product.title}
          </h3>
          <p className="f-small normal-case text-gray-600/80 mb-4 flex-grow tracking-normal leading-relaxed line-clamp-2 opacity-80">
            {product.description}
          </p>

          <div className="mt-auto pt-3 border-t border-black/10 bg-black rounded-b-lg -mx-5 -mb-5 px-5 pb-5 flex items-center justify-between h-[80px]">
            {isAvailable ? (
              <>
                <div className="flex flex-col">
                  {typeof product.originalPrice === 'number' && (
                    <span className="text-xs font-bold tracking-wide text-white/45 line-through">
                      P {product.originalPrice.toLocaleString()}
                    </span>
                  )}
                  <span className="f-price text-green-400 drop-shadow-none text-2xl lg:text-3xl font-semibold leading-none">
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
                      ? 'text-yellow-400 border-yellow-400 bg-yellow-400/10'
                      : 'text-white hover:text-yellow-400 hover:border-yellow-400 hover:bg-white/5'
                  }`}
                  type="button"
                  aria-label={isSelected ? `Remove ${product.title} from cart` : `Add ${product.title} to cart`}
                >
                  {isSelected ? <Check size={30} strokeWidth={4} /> : <Plus size={30} strokeWidth={4} />}
                </button>
              </>
            ) : (
              <>
                <span className="text-sm font-black uppercase tracking-[0.2em] text-brand-yellow/90">
                  Coming Soon
                </span>
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">
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
      prevProps.isHighlighted === nextProps.isHighlighted &&
      prevProps.isSelected === nextProps.isSelected
    );
  }
);

ProductCard.displayName = 'ProductCard';
