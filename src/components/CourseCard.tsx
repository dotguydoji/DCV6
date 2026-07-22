import React, { memo, useCallback, useEffect, useRef } from 'react';
import { Check, FileText, Lock, Play, Plus, Video } from 'lucide-react';
import { Product } from '../types';
import { scheduleScrollUnlessUserIntervenes } from '../lib/scrollGuard';

interface CourseCardProps {
  product: Product;
  isHighlighted?: boolean;
  isSelected: boolean;
  onToggleSelect: (product: Product, event?: React.MouseEvent) => void;
  hideCommerce?: boolean;
  priority?: boolean;
}

export const CourseCard = memo(
  ({ product, isHighlighted, isSelected, onToggleSelect, hideCommerce = false, priority = false }: CourseCardProps) => {
    const cardRef = useRef<HTMLDivElement>(null);
    const isAvailable = product.available !== false;

    useEffect(() => {
      if (!isHighlighted || !cardRef.current) return;

      // Backs off if the visitor starts scrolling manually before this
      // fires - see scrollGuard.ts for why.
      return scheduleScrollUnlessUserIntervenes(() => {
        cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }, 300);
    }, [isHighlighted]);

    const handleToggle = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onToggleSelect(product, e);
      },
      [product, onToggleSelect]
    );

    // Clicking anywhere on the card adds/removes it from the cart, not just
    // the small Plus/Check button - inert for download-only (hideCommerce)
    // and unavailable ("Coming Soon") cards, same gate the button already had.
    const canAddToCart = isAvailable && !hideCommerce;
    const handleCardClick = useCallback(
      (e: React.MouseEvent) => {
        if (!canAddToCart) return;
        onToggleSelect(product, e);
      },
      [canAddToCart, onToggleSelect, product]
    );

    return (
      <div
        ref={cardRef}
        data-flyable-card
        onClick={handleCardClick}
        style={{ '--card-scale': isHighlighted ? 1.02 : 1 } as React.CSSProperties}
        className={`group flex-shrink-0 w-[82vw] sm:w-[480px] laptop:w-full flex flex-col bg-surface border rounded-sm overflow-hidden will-change-transform card-elevated card-tilt ${
          canAddToCart ? 'cursor-pointer' : ''
        } ${
          isHighlighted
            ? 'animate-highlight border-border-strong z-10'
            : isSelected
              ? 'border-border-strong ring-2 ring-border-strong/20'
              : 'border-border-hairline'
        }`}
      >
        {/* Thumbnail */}
        <div className="relative aspect-[16/9] md:aspect-auto md:h-[200px] overflow-hidden bg-black shrink-0">
          <img
            src={product.thumbnail}
            alt={product.title}
            className="w-full h-full object-cover opacity-50 transition-transform duration-700 group-hover:scale-105 will-change-transform"
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
            decoding="async"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-surface to-transparent" />

          {/* Course badge — top left */}
          <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-surface-inverted px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-text-inverted">
            <Play size={9} fill="currentColor" strokeWidth={0} />
            Course
          </div>

          {/* Pre-register badge — top right */}
          {product.preOrder && (
            <div className="absolute right-3 top-3 z-10 rounded-full bg-surface-inverted px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-text-inverted">
              Pre-register
            </div>
          )}

          {/* Play button overlay - fixed black/white (not theme tokens),
              sits on top of the photo thumbnail like a conventional video
              play control, not page chrome that needs to react to theme. */}
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="w-11 h-11 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center border border-white/20 group-hover:bg-white group-hover:border-white transition-all duration-300">
              <Play
                size={16}
                fill="white"
                className="ml-0.5 text-white group-hover:fill-black group-hover:text-black transition-colors duration-300"
              />
            </div>
          </div>
        </div>

        {/* Body */}
        <div className={`px-4 pt-4 pb-3 flex flex-col flex-grow min-h-0 transition-colors duration-300 ${isSelected ? 'bg-surface-inverted' : ''}`}>
          <h3 className={`font-poppins font-normal text-lg lg:text-2xl leading-tight mb-1 transition-colors duration-300 ${isSelected ? 'text-text-inverted' : 'text-text-primary'}`}>
            {product.title}
          </h3>

          <p className={`text-base leading-relaxed line-clamp-2 tracking-normal normal-case mb-3 transition-colors duration-300 ${isSelected ? 'text-text-inverted/70' : 'text-text-secondary'}`}>
            {product.description}
          </p>

          {/* Materials list */}
          {product.materials && product.materials.length > 0 && (
            <div className="overflow-y-auto no-scrollbar rounded-sm border border-border-hairline bg-surface-inverted/5 max-h-[260px]">
              {product.materials.map((material, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 px-3 py-3 ${
                    i < product.materials!.length - 1 ? 'border-b border-border-hairline' : ''
                  }`}
                >
                  <Lock size={13} className="shrink-0 text-text-primary/25" />
                  {material.type === 'video' ? (
                    <Video size={13} className="shrink-0 text-text-primary/70" />
                  ) : (
                    <FileText size={13} className="shrink-0 text-text-primary/70" />
                  )}
                  <span className="text-base text-text-primary/60 truncate font-medium leading-snug">
                    {material.title}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Price bar */}
        <div
          className={`px-4 py-2.5 border-t border-border-hairline flex items-center justify-between shrink-0 transition-colors duration-300 ${
            isSelected ? 'bg-black dark:bg-white' : 'bg-white dark:bg-black'
          }`}
        >
          {isAvailable ? (
            hideCommerce ? (
              <div className="w-full flex items-center justify-start">
                <span
                  className={`flex items-center justify-center w-10 h-10 border ${
                    isSelected
                      ? 'border-white/15 text-white/40 dark:border-black/15 dark:text-black/40'
                      : 'border-black/15 text-black/40 dark:border-white/15 dark:text-white/40'
                  }`}
                >
                  <Play size={18} strokeWidth={1.5} />
                </span>
              </div>
            ) : (
              <>
                <span
                  className={`f-price font-semibold leading-none ${
                    isSelected ? 'text-white dark:text-black' : 'text-black dark:text-white'
                  }`}
                >
                  <span className="text-[0.5em]">P</span> {product.price.toLocaleString()}
                </span>
                <button
                  onClick={handleToggle}
                  type="button"
                  aria-label={isSelected ? `Remove ${product.title} from cart` : `Add ${product.title} to cart`}
                  className={`flex items-center justify-center w-11 h-11 border rounded-none transition-all duration-300 ${
                    isSelected
                      ? 'text-white border-white bg-white/10 dark:text-black dark:border-black dark:bg-black/10'
                      : 'text-black/70 border-black/20 hover:text-black hover:border-black hover:bg-black/5 dark:text-white/70 dark:border-white/20 dark:hover:text-white dark:hover:border-white dark:hover:bg-white/5'
                  }`}
                >
                  {isSelected ? <Check size={22} strokeWidth={2} /> : <Plus size={22} strokeWidth={3} />}
                </button>
              </>
            )
          ) : (
            <div className="flex items-center justify-between w-full">
              <span className="text-sm font-semibold uppercase tracking-[0.2em] text-black dark:text-white">
                Coming Soon
              </span>
              <span className="text-xs font-medium uppercase tracking-[0.2em] text-black/60 dark:text-white/60">
                Not Available
              </span>
            </div>
          )}
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.product.id === next.product.id &&
    prev.product.available === next.product.available &&
    prev.product.preOrder === next.product.preOrder &&
    prev.isHighlighted === next.isHighlighted &&
    prev.isSelected === next.isSelected &&
    prev.hideCommerce === next.hideCommerce &&
    prev.priority === next.priority
);

CourseCard.displayName = 'CourseCard';
