import React, { useEffect, useRef, useState, useMemo } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, FileText, Play } from 'lucide-react';
import { CourseCard } from './CourseCard';
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
  hideCommerce?: boolean;
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
    if (matchedIndex >= 0) return matchedIndex;
  }

  if (typeof focus.index === 'number') {
    return Math.min(Math.max(focus.index, 0), products.length - 1);
  }

  return 0;
};

export const CategorySection = React.forwardRef<HTMLElement, CategorySectionProps>(
  ({ name, products, isOpen, onToggle, highlightedProductId, selectedProducts, selectedProductIds, onToggleSelect, hideCommerce = false }, ref) => {
    const mobileScrollRef = useRef<HTMLDivElement>(null);
    const desktopScrollRef = useRef<HTMLDivElement>(null);
    const mobileCardRefs = useRef<(HTMLDivElement | null)[]>([]);
    const desktopCardRefs = useRef<(HTMLDivElement | null)[]>([]);
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
      () => LEVEL_ORDER.filter((level) => products.some((product) => product.level === level)),
      [products]
    );
    const hasVersionToggle = availableLanguages.length > 1;
    const hasLevelToggle = availableLevels.length > 0;
    const defaultLanguage = availableLanguages.includes('en')
      ? 'en'
      : (availableLanguages[0] ?? null);
    const defaultLevel = hasLevelToggle ? availableLevels[0] : null;

    const isCourseCategory = products.length > 0 && products.every((p) => p.isCourse);

    const filterProducts = (language: ProductLanguage | null, level: ProductLevel | null) =>
      products.filter((product) => {
        if (language && product.language !== language) return false;
        if (hasLevelToggle && level && product.level !== level) return false;
        return true;
      });

    const visibleProducts = useMemo(
      () => (isCourseCategory ? products : filterProducts(selectedLanguage, selectedLevel)),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [products, selectedLanguage, selectedLevel, hasLevelToggle, isCourseCategory]
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
      pendingFocusRef.current = { itemKey: getProductFocusKey(highlightedProduct) };
      setSelectedLanguage(highlightedProduct.language ?? defaultLanguage);
      setSelectedLevel(highlightedProduct.level ?? defaultLevel);
    }, [defaultLanguage, defaultLevel, highlightedProductId, isOpen, products]);

    // Mobile carousel scroll effect
    useEffect(() => {
      if (!isOpen || !mobileScrollRef.current || visibleProducts.length === 0) return;

      const container = mobileScrollRef.current;
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
        { root: container, threshold: [0.1, 0.9, 1.0], rootMargin: '0px -5px 0px -5px' }
      );

      const activeObserver = new IntersectionObserver(
        (entries) => {
          const mostVisibleEntry = entries.reduce((max, entry) => {
            return entry.intersectionRatio > (max?.intersectionRatio || 0) ? entry : max;
          }, entries.find((entry) => entry.isIntersecting) || null);

          if (mostVisibleEntry && mostVisibleEntry.intersectionRatio > 0.7) {
            const newIndex = parseInt((mostVisibleEntry.target as HTMLElement).dataset.index || '0', 10);
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              if (newIndex !== lastActiveIndex) {
                lastActiveIndex = newIndex;
                setActiveIndex(newIndex);
              }
            }, 50);
          }
        },
        { root: container, threshold: [0.5, 0.7, 0.9] }
      );

      const cards = container.querySelectorAll('.mobile-card-item');
      cards.forEach((card) => {
        navObserver.observe(card);
        activeObserver.observe(card);
      });

      container.addEventListener('scroll', updateScrollStates, { passive: true });

      rafId = window.requestAnimationFrame(() => {
        const target = mobileCardRefs.current[nextIndex];
        const containerStyle = window.getComputedStyle(container);
        const paddingLeft = parseInt(containerStyle.paddingLeft || '0', 10) || 0;
        container.scrollTo({
          left: target ? target.offsetLeft - paddingLeft : 0,
          behavior: 'auto'
        });
        updateScrollStates();
      });

      return () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        if (rafId) window.cancelAnimationFrame(rafId);
        navObserver.disconnect();
        activeObserver.disconnect();
        container.removeEventListener('scroll', updateScrollStates);
      };
    }, [isOpen, selectedLanguage, selectedLevel, visibleProducts.length]);

    // Desktop highlight scroll effect
    useEffect(() => {
      if (!isOpen || !highlightedProductId || !desktopScrollRef.current) return;
      const index = visibleProducts.findIndex((p) => p.id === highlightedProductId);
      if (index < 0) return;
      const rafId = window.requestAnimationFrame(() => {
        desktopCardRefs.current[index]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
      return () => window.cancelAnimationFrame(rafId);
    }, [isOpen, highlightedProductId, visibleProducts]);

    const scroll = (direction: 'left' | 'right') => {
      const container = mobileScrollRef.current;
      if (!container) return;
      container.scrollBy({
        left: direction === 'left' ? -container.clientWidth * 0.8 : container.clientWidth * 0.8,
        behavior: 'smooth'
      });
    };

    const jumpToCard = (index: number) => {
      const container = mobileScrollRef.current;
      const target = mobileCardRefs.current[index];
      if (target && container) {
        const containerStyle = window.getComputedStyle(container);
        const paddingLeft = parseInt(containerStyle.paddingLeft || '0', 10) || 0;
        container.scrollTo({ left: target.offsetLeft - paddingLeft, behavior: 'smooth' });
      }
    };

    const storeCurrentFocus = () => {
      const currentProduct = visibleProducts[activeIndex] ?? visibleProducts[0];
      pendingFocusRef.current = currentProduct
        ? { itemKey: getProductFocusKey(currentProduct), index: activeIndex }
        : { index: activeIndex };
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
        className={`transition-all rounded-xl overflow-hidden border mt-4 mb-8 lg:mt-5 lg:mb-12 will-change-transform ${
          isCourseCategory
            ? 'bg-[#D95F00] border-[#D95F00] shadow-2xl'
            : 'bg-[#333333] border-white/5 shadow-2xl'
        }`}
      >
        <div className={`category-header px-6 lg:px-8 py-3 lg:py-5 laptop:py-6 border-b ${
          isCourseCategory
            ? 'bg-transparent border-black/15'
            : 'bg-black/40 border-white/5'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between group gap-4">
            <button
              onClick={onToggle}
              className="flex-grow flex items-center gap-4 text-left outline-none group/title"
              aria-expanded={isOpen}
            >
              <h2 className={`f-heading font-normal transition-colors uppercase tracking-tighter ${
                isCourseCategory
                  ? 'text-black group-hover/title:text-black/70'
                  : 'text-white group-hover/title:text-brand-yellow'
              }`}>
                {name}
              </h2>
              <div
                className={`transition-transform duration-300 p-1 border border-transparent rounded-full ${
                  isCourseCategory
                    ? isOpen
                      ? 'rotate-180 text-black bg-black/10'
                      : 'text-black/60 group-hover/title:text-black'
                    : isOpen
                      ? 'rotate-180 text-brand-yellow bg-brand-yellow/5'
                      : 'text-brand-gray group-hover/title:text-white'
                }`}
              >
                <ChevronDown size={28} strokeWidth={2.5} />
              </div>
              {/* Content-type label */}
              {isCourseCategory ? (
                <span className="hidden sm:flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.18em] text-black border border-black/20 bg-black/10 px-2.5 py-1 rounded-sm">
                  <Play size={9} fill="currentColor" strokeWidth={0} />
                  Video Course
                </span>
              ) : (
                <span className="hidden sm:flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.14em] text-white/25 border border-white/8 bg-black/20 px-2.5 py-1 rounded-sm">
                  <FileText size={9} strokeWidth={2} />
                  PDF
                </span>
              )}
            </button>

            <div className="flex items-center justify-between sm:justify-end gap-6">
              <div className="hidden sm:flex flex-col items-end">
                <span className={`f-small px-3 py-1.5 rounded-sm border font-extrabold whitespace-nowrap shadow-xl text-xl ${
                  isCourseCategory
                    ? 'bg-black/10 text-black border-black/15'
                    : 'bg-black/60 text-yellow-300 border-white/5'
                }`}>
                  {itemCount} <span className="opacity-50">ITEMS</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div
          className={`transition-all duration-500 ease-out will-change-[max-height,opacity] ${
            isOpen ? 'overflow-visible max-h-[3200px] opacity-100 p-4 lg:p-6' : 'overflow-hidden max-h-0 opacity-0 pointer-events-none'
          }`}
        >
          {hasVersionToggle && (
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <span className="text-base font-bold text-white/70 tracking-wide">Versions:</span>
              <button
                type="button"
                onClick={() => handleLanguageChange('en')}
                disabled={!availableLanguages.includes('en')}
                aria-pressed={selectedLanguage === 'en'}
                className={`text-base font-extrabold uppercase tracking-wider px-3 py-1 rounded-sm border transition-all ${
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
                className={`text-base font-extrabold uppercase tracking-wider px-3 py-1 rounded-sm border transition-all ${
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
              <span className="text-base font-bold text-white/70 tracking-wide">Levels:</span>
              {availableLevels.map((level, levelIndex) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => handleLevelChange(level)}
                  aria-pressed={selectedLevel === level}
                  className={`text-base font-extrabold uppercase tracking-wider px-3 py-1 rounded-sm border transition-all ${
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
              {/* Mobile: horizontal carousel */}
              <div className="md:hidden">
                <div className="relative">
                  <div
                    ref={mobileScrollRef}
                    className="flex gap-4 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-4 pt-2 scroll-smooth max-lg:px-[calc(50vw-140px-24px)] sm:max-lg:px-[calc(50vw-160px-24px)] will-change-transform"
                  >
                    {visibleProducts.map((product, idx) => (
                      <div
                        key={product.id}
                        className="mobile-card-item flex-shrink-0 snap-center"
                        data-index={idx}
                        ref={(el) => { mobileCardRefs.current[idx] = el; }}
                      >
                        {isCourseCategory ? (
                          <CourseCard
                            product={product}
                            isHighlighted={product.id === highlightedProductId}
                            isSelected={selectedProductIds.has(product.id)}
                            onToggleSelect={onToggleSelect}
                            hideCommerce={hideCommerce}
                          />
                        ) : (
                          <ProductCard
                            product={product}
                            isHighlighted={product.id === highlightedProductId}
                            isSelected={selectedProductIds.has(product.id)}
                            onToggleSelect={onToggleSelect}
                            hideCommerce={hideCommerce}
                          />
                        )}
                      </div>
                    ))}
                    <div className="flex-shrink-0 w-1"></div>
                  </div>
                </div>

                <div className="flex justify-center items-center gap-3 mt-3">
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
                    onClick={(e) => { e.stopPropagation(); scroll('left'); }}
                    disabled={!canScrollLeft}
                    className={`flex items-center justify-center w-10 h-10 rounded-sm bg-black border transition-all active:scale-90 ${
                      !canScrollLeft
                        ? 'opacity-10 border-gray-900 text-gray-800 cursor-not-allowed'
                        : 'border-gray-800 text-brand-gray hover:text-brand-yellow hover:border-brand-yellow hover:bg-brand-yellow/5'
                    }`}
                    aria-label="Previous"
                  >
                    <ChevronLeft size={20} strokeWidth={3} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); scroll('right'); }}
                    disabled={!canScrollRight}
                    className={`flex items-center justify-center w-10 h-10 rounded-sm bg-black border transition-all active:scale-90 ${
                      !canScrollRight
                        ? 'opacity-10 border-gray-900 text-gray-800 cursor-not-allowed'
                        : 'border-gray-800 text-brand-gray hover:text-brand-yellow hover:border-brand-yellow hover:bg-brand-yellow/5'
                    }`}
                    aria-label="Next"
                  >
                    <ChevronRight size={20} strokeWidth={3} />
                  </button>
                </div>
              </div>

              {/* Tablet / Desktop: vertical scrolling grid */}
              <div className="hidden md:block">
                <div
                  ref={desktopScrollRef}
                  className={isCourseCategory ? '' : 'overflow-y-auto max-h-[820px] no-scrollbar'}
                >
                  <div className={`grid gap-4 lg:gap-6 ${isCourseCategory ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'}`}>
                    {visibleProducts.map((product, idx) => (
                      <div
                        key={product.id}
                        className="product-card-item min-w-0 [&>*]:!w-full"
                        data-index={idx}
                        ref={(el) => { desktopCardRefs.current[idx] = el; }}
                      >
                        {isCourseCategory ? (
                          <CourseCard
                            product={product}
                            isHighlighted={product.id === highlightedProductId}
                            isSelected={selectedProductIds.has(product.id)}
                            onToggleSelect={onToggleSelect}
                            hideCommerce={hideCommerce}
                          />
                        ) : (
                          <ProductCard
                            product={product}
                            isHighlighted={product.id === highlightedProductId}
                            isSelected={selectedProductIds.has(product.id)}
                            onToggleSelect={onToggleSelect}
                            hideCommerce={hideCommerce}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="min-h-[180px] flex items-center justify-center rounded-lg border border-white/5 bg-black/20 text-center px-6">
              <div>
                <p className="text-white font-bold uppercase tracking-[0.2em] text-base">Coming Soon</p>
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
