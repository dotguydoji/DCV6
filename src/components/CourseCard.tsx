import React, { memo, useCallback, useEffect, useRef } from 'react';
import { Check, FileText, Lock, Play, Plus, Video } from 'lucide-react';
import { Product } from '../types';

interface CourseCardProps {
  product: Product;
  isHighlighted?: boolean;
  isSelected: boolean;
  onToggleSelect: (product: Product, event?: React.MouseEvent) => void;
  hideCommerce?: boolean;
}

export const CourseCard = memo(
  ({ product, isHighlighted, isSelected, onToggleSelect, hideCommerce = false }: CourseCardProps) => {
    const cardRef = useRef<HTMLDivElement>(null);
    const isAvailable = product.available !== false;

    useEffect(() => {
      if (isHighlighted && cardRef.current) {
        const t = window.setTimeout(() => {
          cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }, 300);
        return () => window.clearTimeout(t);
      }
    }, [isHighlighted]);

    const handleToggle = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onToggleSelect(product, e);
      },
      [product, onToggleSelect]
    );

    return (
      <div
        ref={cardRef}
        className={`group flex-shrink-0 w-[82vw] sm:w-[480px] laptop:w-full flex flex-col bg-[#141414] border rounded-lg overflow-hidden transition-all duration-300 shadow-2xl shadow-black/50 will-change-transform ${
          isHighlighted
            ? 'animate-highlight border-brand-yellow z-10 scale-[1.02]'
            : isSelected
              ? 'border-brand-yellow ring-2 ring-brand-yellow/20'
              : 'border-white/10 hover:border-brand-yellow/40'
        }`}
      >
        {/* Thumbnail */}
        <div className="relative aspect-[16/9] md:aspect-auto md:h-[200px] overflow-hidden bg-black shrink-0">
          <img
            src={product.thumbnail}
            alt={product.title}
            className="w-full h-full object-cover opacity-50 transition-transform duration-700 group-hover:scale-105 will-change-transform"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-black/30 to-transparent" />

          {/* Course badge — top left */}
          <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-brand-yellow px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-black shadow-lg">
            <Play size={9} fill="currentColor" strokeWidth={0} />
            Course
          </div>

          {/* Pre-register badge — top right */}
          {product.preOrder && (
            <div className="absolute right-3 top-3 z-10 rounded-full bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-black shadow-lg">
              Pre-register
            </div>
          )}

          {/* Play button overlay */}
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="w-11 h-11 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center border border-white/20 group-hover:bg-brand-yellow group-hover:border-brand-yellow transition-all duration-300">
              <Play
                size={16}
                fill="white"
                className="ml-0.5 text-white group-hover:fill-black group-hover:text-black transition-colors duration-300"
              />
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-4 pt-4 pb-3 flex flex-col flex-grow min-h-0">
          <h3 className="font-poppins font-bold text-base lg:text-xl text-white leading-tight mb-1 group-hover:text-brand-yellow transition-colors duration-300">
            {product.title}
          </h3>

          <p className="text-sm text-brand-gray/50 leading-relaxed line-clamp-2 tracking-normal normal-case mb-3">
            {product.description}
          </p>

          {/* Materials list */}
          {product.materials && product.materials.length > 0 && (
            <div className="overflow-y-auto no-scrollbar rounded-sm border border-white/5 bg-black/40 max-h-[260px]">
              {product.materials.map((material, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 px-3 py-3 ${
                    i < product.materials!.length - 1 ? 'border-b border-white/5' : ''
                  }`}
                >
                  <Lock size={13} className="shrink-0 text-white/25" />
                  {material.type === 'video' ? (
                    <Video size={13} className="shrink-0 text-brand-yellow/70" />
                  ) : (
                    <FileText size={13} className="shrink-0 text-sky-400/80" />
                  )}
                  <span className="text-sm text-white/60 truncate font-medium leading-snug">
                    {material.title}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Price bar */}
        <div className="px-4 py-4 bg-black border-t border-white/5 flex items-center justify-between h-[72px] shrink-0">
          {isAvailable ? (
            hideCommerce ? (
              <div className="w-full flex items-center justify-start">
                <span className="flex items-center justify-center w-11 h-11 border border-white/15 text-white/40">
                  <Play size={20} strokeWidth={2} />
                </span>
              </div>
            ) : (
              <>
                <span className="f-price text-green-400 text-2xl lg:text-3xl font-semibold leading-none drop-shadow-none">
                  P {product.price.toLocaleString()}
                </span>
                <button
                  onClick={handleToggle}
                  type="button"
                  aria-label={isSelected ? `Remove ${product.title} from cart` : `Add ${product.title} to cart`}
                  className={`flex items-center justify-center w-12 h-12 border rounded-none transition-all duration-300 ${
                    isSelected
                      ? 'text-brand-yellow border-brand-yellow bg-brand-yellow/10'
                      : 'text-white border-white/20 hover:text-brand-yellow hover:border-brand-yellow hover:bg-white/5'
                  }`}
                >
                  {isSelected ? <Check size={28} strokeWidth={4} /> : <Plus size={28} strokeWidth={4} />}
                </button>
              </>
            )
          ) : (
            <div className="flex items-center justify-between w-full">
              <span className="text-sm font-black uppercase tracking-[0.2em] text-brand-yellow/90">
                Coming Soon
              </span>
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/30">
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
    prev.hideCommerce === next.hideCommerce
);

CourseCard.displayName = 'CourseCard';
