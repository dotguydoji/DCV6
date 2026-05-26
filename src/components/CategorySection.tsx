import React, { useEffect, useRef, useState, useMemo } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { ProductCard } from './ProductCard';
import { Product, ProductLanguage, ProductLevel } from '../types';

type PendingFocus = {
  itemKey?: string;
  index?: number;
};

interface CategorySectionProps {
  name: string;
  products: Product[];
  isOpen: boolean;
  onToggle: () => void;
  highlightedProductId?: string | null;
  selectedProducts: Product[];
  selectedProductIds: Set<string>;
  onToggleSelect: (product: Product) => void;
}

const LEVEL_ORDER: ProductLevel[] = [
  'beginner',
  'intermediate',
  'advanced',
  'build-phase',
  'activities'
];

const LEVEL_LABEL: Record<ProductLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  'build-phase': 'Build Phase',
  activities: 'Activities'
};

const getProductFocusKey = (product: Product) => product.itemKey ?? product.id;

const getFocusIndex = (products: Product[], focus: PendingFocus | null) => {
  if (products.length === 0) return 0;
  if (!focus) return 0;

  if (focus.itemKey) {
    const matchedIndex = products.findIndex(
      (product) => getProductFocusKey(product) === focus.itemKey
    );

    if (matchedIndex >= 0) {
      return matchedIndex;
    }
  }

  if (typeof focus.index === 'number') {
    return Math.min(Math.max(focus.index, 0), products.length - 1);
  }

  return 0;
};

export const CategorySection = React.forwardRef<HTMLElement, CategorySectionProps>(
  ({ name, products, isOpen, onToggle, highlightedProductId, selectedProducts, selectedProductIds, onToggleSelect }, ref) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
    const pendingFocusRef = useRef<PendingFocus | null>(null);
    const [selectedLanguage, setSelectedLanguage] = useState<ProductLanguage | null>('en');
    const [selectedLevel, setSelectedLevel] = useState<ProductLevel | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(true);

    const availableLanguages = useMemo(
      () =>
        (['en', 'tl'] as const).filter((language) =>
          products.some((product) => product.language === language)
        ),
      [products]
    );
    const availableLevels = useMemo(
      () =>
        LEVEL_ORDER.filter((level) =>
          products.some((product) => product.level === level)
        ),
      [products]
    );
    const hasVersionToggle = availableLanguages.length > 1;
    const hasLevelToggle = availableLevels.length > 0;
    const defaultLanguage = availableLanguages.includes('en')
      ? 'en'
      : (availableLanguages[0] ?? null);
    const defaultLevel = hasLevelToggle ? availableLevels[0] : null;

    const filterProducts = (
      language: ProductLanguage | null,
      level: ProductLevel | null
    ) =>
      products.filter((product) => {
        if (language && product.language !== language) {
          return false;
        }

        if (hasLevelToggle && level && product.level !== level) {
          return false;
        }

        return true;
      });

    const visibleProducts = useMemo(
      () => filterProducts(selectedLanguage, selectedLevel),
      [products, selectedLanguage, selectedLevel, hasLevelToggle]
    );
    const itemCount = products.length;

    useEffect(() => {
      if (!isOpen) return;

      pendingFocusRef.current = { index: 0 };
      setSelectedLanguage(defaultLanguage);
      setSelectedLevel(defaultLevel);
    }, [defaultLanguage, defaultLevel, isOpen]);

    useEffect(() => {
      if (!isOpen || !highlightedProductId) return;

      const highlightedProduct = products.find((product) => product.id === highlightedProductId);
      if (!highlightedProduct) return;

      pendingFocusRef.current = {
        itemKey: getProductFocusKey(highlightedProduct)
      };
      setSelectedLanguage(highlightedProduct.language ?? defaultLanguage);
      setSelectedLevel(highlightedProduct.level ?? defaultLevel);
    }, [defaultLanguage, defaultLevel, highlightedProductId, isOpen, products]);

    useEffect(() => {
      if (!isOpen || !scrollRef.current || visibleProducts.length === 0) return;

      const container = scrollRef.current;
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;
      let lastActiveIndex = -1;
      const nextIndex = getFocusIndex(visibleProducts, pendingFocusRef.current);
      let rafId = 0;

      const updateScrollStates = () => {
        setCanScrollLeft(container.scrollLeft > 5);
        setCanScrollRight(container.scrollLeft < container.scrollWidth - container.clientWidth - 5);
      };

      pendingFocusRef.current = null;
      setActiveIndex(nextIndex);

      const navObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const target = entry.target as HTMLElement;
            const index = parseInt(target.dataset.index || '0', 10);

            if (index === 0) {
              setCanScrollLeft(!entry.isIntersecting || entry.intersectionRatio < 0.9);
            }

            if (index === visibleProducts.length - 1) {
              setCanScrollRight(!entry.isIntersecting || entry.intersectionRatio < 0.9);
            }
          });
        },
        {
          root: container,
          threshold: [0.1, 0.9, 1.0],
          rootMargin: '0px -5px 0px -5px'
        }
      );

      const activeObserver = new IntersectionObserver(
        (entries) => {
          const mostVisibleEntry = entries.reduce((max, entry) => {
            return entry.intersectionRatio > (max?.intersectionRatio || 0) ? entry : max;
          }, entries.find((entry) => entry.isIntersecting) || null);

          if (mostVisibleEntry && mostVisibleEntry.intersectionRatio > 0.7) {
            const newIndex = parseInt((mostVisibleEntry.target as HTMLElement).dataset.index || '0', 10);

            if (debounceTimer) {
              clearTimeout(debounceTimer);
            }

            debounceTimer = setTimeout(() => {
              if (newIndex !== lastActiveIndex) {
                lastActiveIndex = newIndex;
                setActiveIndex(newIndex);
              }
            }, 50);
          }
        },
        {
          root: container,
          threshold: [0.5, 0.7, 0.9]
        }
      );

      const cards = container.querySelectorAll('.product-card-item');
      cards.forEach((card) => {
        navObserver.observe(card);
        activeObserver.observe(card);
      });

      container.addEventListener('scroll', updateScrollStates, { passive: true });

      rafId = window.requestAnimationFrame(() => {
        const target = cardRefs.current[nextIndex];
        const containerStyle = window.getComputedStyle(container);
        const paddingLeft = parseInt(containerStyle.paddingLeft || '0', 10) || 0;

        container.scrollTo({
          left: target ? target.offsetLeft - paddingLeft : 0,
          behavior: 'auto'
        });

        updateScrollStates();
      });

      return () => {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        if (rafId) {
          window.cancelAnimationFrame(rafId);
        }
        navObserver.disconnect();
        activeObserver.disconnect();
        container.removeEventListener('scroll', updateScrollStates);
      };
    }, [isOpen, selectedLanguage, selectedLevel, visibleProducts.length]);

    const scroll = (direction: 'left' | 'right') => {
      const container = scrollRef.current;
      if (!container) return;

      const clientWidth = container.clientWidth;
      const scrollAmount = direction === 'left' ? -clientWidth * 0.8 : clientWidth * 0.8;

      container.scrollBy({
        left: scrollAmount,
        behavior: 'smooth'
      });
    };

    const jumpToCard = (index: number) => {
      const container = scrollRef.current;
      const target = cardRefs.current[index];
      if (target && container) {
        const containerStyle = window.getComputedStyle(container);
        const paddingLeft = parseInt(containerStyle.paddingLeft || '0', 10) || 0;

        container.scrollTo({
          left: target.offsetLeft - paddingLeft,
          behavior: 'smooth'
        });
      }
    };

    const storeCurrentFocus = () => {
      const currentProduct = visibleProducts[activeIndex] ?? visibleProducts[0];
      pendingFocusRef.current = currentProduct
        ? {
            itemKey: getProductFocusKey(currentProduct),
            index: activeIndex
          }
        : {
            index: activeIndex
          };
    };

    const handleLanguageChange = (nextLanguage: ProductLanguage) => {
      if (nextLanguage === selectedLanguage) return;
      storeCurrentFocus();
      setSelectedLanguage(nextLanguage);
    };

    const handleLevelChange = (nextLevel: ProductLevel) => {
      if (nextLevel === selectedLevel) return;
      storeCurrentFocus();
      setSelectedLevel(nextLevel);
    };

    return (
      <section
        ref={ref}
        className="transition-all rounded-xl overflow-hidden bg-[#333333] border border-white/5 shadow-2xl mb-8 lg:mb-12 will-change-transform"
      >
        <div className="category-header px-6 lg:px-8 py-3 lg:py-5 laptop:py-6 bg-black/40 border-b border-white/5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between group gap-4">
            <button
              onClick={onToggle}
              className="flex-grow flex items-center gap-4 text-left outline-none group/title"
              aria-expanded={isOpen}
            >
              <h2 className="f-heading font-normal text-white group-hover/title:text-brand-yellow transition-colors uppercase tracking-tighter">
                {name}
              </h2>
              <div
                className={`text-brand-gray transition-transform duration-300 p-1 border border-transparent rounded-full ${
                  isOpen ? 'rotate-180 text-brand-yellow bg-brand-yellow/5' : 'group-hover/title:text-white'
                }`}
              >
                <ChevronDown size={28} strokeWidth={2.5} />
              </div>
            </button>

            <div className="flex items-center justify-between sm:justify-end gap-6">
              <div className="hidden sm:flex flex-col items-end">
                <span className="f-small bg-black/60 text-yellow-300 px-3 py-1.5 rounded-sm border border-white/5 font-extrabold whitespace-nowrap shadow-xl text-lg">
                  {itemCount} <span className="opacity-50">ITEMS</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div
          className={`overflow-hidden transition-all duration-500 ease-out will-change-[max-height,opacity] ${
            isOpen ? 'max-h-[3200px] opacity-100 p-4 lg:p-6' : 'max-h-0 opacity-0 pointer-events-none'
          }`}
        >
          {hasVersionToggle && (
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <span className="text-sm font-bold text-white/70 tracking-wide">Versions:</span>
              <button
                type="button"
                onClick={() => handleLanguageChange('en')}
                disabled={!availableLanguages.includes('en')}
                aria-pressed={selectedLanguage === 'en'}
                className={`text-sm font-extrabold uppercase tracking-wider px-3 py-1 rounded-sm border transition-all ${
                  selectedLanguage === 'en'
                    ? 'bg-brand-yellow text-black border-brand-yellow shadow-[0_0_18px_rgba(255,107,0,0.3)]'
                    : availableLanguages.includes('en')
                      ? 'bg-black text-white border-white/10 hover:border-brand-yellow hover:text-brand-yellow'
                      : 'bg-black/40 text-white/30 border-white/5 cursor-not-allowed'
                }`}
                style={{ textShadow: selectedLanguage === 'en' ? 'none' : '0 0 3px rgba(0,0,0,0.8), 0 0 1px #000' }}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => handleLanguageChange('tl')}
                disabled={!availableLanguages.includes('tl')}
                aria-pressed={selectedLanguage === 'tl'}
                className={`text-sm font-extrabold uppercase tracking-wider px-3 py-1 rounded-sm border transition-all ${
                  selectedLanguage === 'tl'
                    ? 'bg-brand-yellow text-black border-brand-yellow shadow-[0_0_18px_rgba(255,107,0,0.3)]'
                    : availableLanguages.includes('tl')
                      ? 'bg-black text-white border-white/10 hover:border-brand-yellow hover:text-brand-yellow'
                      : 'bg-black/40 text-white/30 border-white/5 cursor-not-allowed'
                }`}
                style={{ textShadow: selectedLanguage === 'tl' ? 'none' : '0 0 3px rgba(0,0,0,0.8), 0 0 1px #000' }}
              >
                Tagalog
              </button>
            </div>
          )}

          {hasLevelToggle && (
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <span className="text-sm font-bold text-white/70 tracking-wide">Levels:</span>
              {availableLevels.map((level, levelIndex) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => handleLevelChange(level)}
                  aria-pressed={selectedLevel === level}
                  className={`text-sm font-extrabold uppercase tracking-wider px-3 py-1 rounded-sm border transition-all ${
                    selectedLevel === level
                      ? 'bg-brand-yellow text-black border-brand-yellow shadow-[0_0_18px_rgba(255,107,0,0.3)]'
                      : 'bg-black text-white border-white/10 hover:border-brand-yellow hover:text-brand-yellow'
                  }`}
                  style={{ textShadow: selectedLevel === level ? 'none' : '0 0 3px rgba(0,0,0,0.8), 0 0 1px #000' }}
                >
                  <span className="md:hidden">{levelIndex + 1}</span>
                  <span className="hidden md:inline">{LEVEL_LABEL[level]}</span>
                </button>
              ))}
            </div>
          )}

          {visibleProducts.length > 0 ? (
            <>
              <div className="relative">
                <div
                  ref={scrollRef}
                  className="flex gap-4 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-4 pt-2 scroll-smooth max-lg:px-[calc(50vw-140px-24px)] sm:max-lg:px-[calc(50vw-160px-24px)] lg:px-2 will-change-transform"
                >
                  {visibleProducts.map((product, idx) => (
                    <div
                      key={product.id}
                      className="product-card-item flex-shrink-0 snap-center lg:snap-start"
                      data-index={idx}
                      ref={(el) => {
                        cardRefs.current[idx] = el;
                      }}
                    >
                      <ProductCard
                        product={product}
                        isHighlighted={product.id === highlightedProductId}
                        isSelected={selectedProductIds.has(product.id)}
                        onToggleSelect={onToggleSelect}
                      />
                    </div>
                  ))}
                  <div className="flex-shrink-0 w-1 lg:hidden"></div>
                </div>
              </div>

              <div className="flex justify-center items-center gap-3 mt-3 laptop:mt-4">
                {visibleProducts.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => jumpToCard(index)}
                    className={`transition-all duration-300 rounded-full h-1 ${
                      activeIndex === index
                        ? 'bg-brand-yellow w-10 shadow-[0_0_10px_rgba(255,107,0,0.5)]'
                        : 'bg-white/10 w-2 hover:bg-white/30'
                    }`}
                    aria-label={`Go to item ${index + 1}`}
                  />
                ))}
              </div>

              <div className="flex justify-center items-center gap-2 mt-3">
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    scroll('left');
                  }}
                  disabled={!canScrollLeft}
                  className={`flex items-center justify-center w-10 h-10 laptop:w-12 laptop:h-12 rounded-sm bg-black border transition-all active:scale-90 ${
                    !canScrollLeft
                      ? 'opacity-10 border-gray-900 text-gray-800 cursor-not-allowed'
                      : 'border-gray-800 text-brand-gray hover:text-brand-yellow hover:border-brand-yellow hover:bg-brand-yellow/5'
                  }`}
                  aria-label="Previous"
                >
                  <ChevronLeft size={20} strokeWidth={3} />
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    scroll('right');
                  }}
                  disabled={!canScrollRight}
                  className={`flex items-center justify-center w-10 h-10 laptop:w-12 laptop:h-12 rounded-sm bg-black border transition-all active:scale-90 ${
                    !canScrollRight
                      ? 'opacity-10 border-gray-900 text-gray-800 cursor-not-allowed'
                      : 'border-gray-800 text-brand-gray hover:text-brand-yellow hover:border-brand-yellow hover:bg-brand-yellow/5'
                  }`}
                  aria-label="Next"
                >
                  <ChevronRight size={20} strokeWidth={3} />
                </button>
              </div>
            </>
          ) : (
            <div className="min-h-[180px] flex items-center justify-center rounded-lg border border-white/5 bg-black/20 text-center px-6">
              <div>
                <p className="text-white font-bold uppercase tracking-[0.2em] text-sm">Coming Soon</p>
                <p className="text-brand-gray/70 mt-2 max-w-md">
                  Items for this category are still being prepared.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    );
  }
);

CategorySection.displayName = 'CategorySection';
