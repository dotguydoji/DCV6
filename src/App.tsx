import React, { useState, useRef, useEffect, useMemo, useCallback, Suspense } from 'react';
import { Navbar } from './components/Navbar';
import { CategorySection } from './components/CategorySection';
import { NotFoundPage } from './components/NotFoundPage';
import { lazyWithReload } from './lazyWithReload';

const FAQSection = lazyWithReload(() => import('./components/FAQSection').then((m) => ({ default: m.FAQSection })));
const CartModal = lazyWithReload(() => import('./components/CartModal').then((m) => ({ default: m.CartModal })));
const ChatWidget = lazyWithReload(() => import('./components/ChatWidget').then((m) => ({ default: m.ChatWidget })));
const PdfGatePage = lazyWithReload(() => import('./components/PdfGatePage').then((m) => ({ default: m.PdfGatePage })));
const MyLibraryPage = lazyWithReload(() => import('./components/MyLibraryPage').then((m) => ({ default: m.MyLibraryPage })));
import { PRODUCTS, CATEGORIES, SITE_CONTENT, AI_COURSES_CATEGORY, getProductById } from "./constants";
import { Product } from './types';
import { ChevronLeft, ChevronRight, ShoppingCart } from 'lucide-react';

interface FlyingItem {
  id: string;
  startX: number;
  startY: number;
  thumbnail: string;
}

const ADMIN_PASSWORD_KEY = 92;
const ADMIN_PASSWORD_CODES = [104, 100, 108, 106, 105, 108, 24, 31, 28, 29, 24, 17, 21, 18, 15];

const getAdminRecordingPassword = () =>
  ADMIN_PASSWORD_CODES.map((code) => String.fromCharCode(code ^ ADMIN_PASSWORD_KEY)).join('');

const normalizePathname = (pathname: string) => {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
};

const VIEW_PATH_PATTERN = /^\/view\/(.+)$/;
const MY_LIBRARY_PATH = '/my-library';

/**
 * Shown while a lazy-loaded route's code is still downloading. Without
 * this, a slow/stalled chunk fetch (much more common on a live CDN than
 * local dev, where everything loads instantly from disk) rendered nothing
 * at all - indistinguishable from a real crash, with no way to tell it was
 * still just loading.
 */
const RouteLoadingScreen: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-[#1a1d1e] text-brand-muted">
    Loading…
  </div>
);

const App: React.FC = () => {
  const pdfProductId = useMemo(() => {
    if (typeof window === 'undefined') {
      return null;
    }

    const pathname = normalizePathname(window.location.pathname);
    const match = pathname.match(VIEW_PATH_PATTERN);
    return match ? decodeURIComponent(match[1]) : null;
  }, []);

  const isMyLibraryPath = useMemo(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return normalizePathname(window.location.pathname) === MY_LIBRARY_PATH;
  }, []);

  const isNotFound = useMemo(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    const pathname = normalizePathname(window.location.pathname);
    if (pathname === '/' || pathname === '/index.html' || pathname === '/index.htm') {
      return false;
    }

    return !VIEW_PATH_PATTERN.test(pathname) && pathname !== MY_LIBRARY_PATH;
  }, []);

  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({
    [CATEGORIES[0]]: true
  });
  const [activeCategory, setActiveCategory] = useState<string | null>(CATEGORIES[0]);
  const [highlightedProductId, setHighlightedProductId] = useState<string | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [flyingItems, setFlyingItems] = useState<FlyingItem[]>([]);
  const [cartBounceKey, setCartBounceKey] = useState(0);
  const [isAdminRecordingMode, setIsAdminRecordingMode] = useState(false);
  const [isAdminPromptOpen, setIsAdminPromptOpen] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminPasswordError, setAdminPasswordError] = useState('');

  const categoryRefs = useRef<Record<string, HTMLElement | null>>({});
  const catContainerRef = useRef<HTMLDivElement>(null);
  const catButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const cartButtonRef = useRef<HTMLButtonElement>(null);
  const adminPasswordInputRef = useRef<HTMLInputElement>(null);

  const activeCategoryRef = useRef<string | null>(CATEGORIES[0]);

  const selectedProductIds = useMemo(
    () => new Set(selectedProducts.map((product) => product.id)),
    [selectedProducts]
  );
  const productsByCategory = useMemo(
    () =>
      CATEGORIES.reduce<Record<string, Product[]>>((acc, category) => {
        acc[category] = PRODUCTS.filter((product) => product.category === category);
        return acc;
      }, {}),
    []
  );

  const handleToggleSelect = useCallback((product: Product, event?: React.MouseEvent) => {
    if (product.available === false) {
      return;
    }

    if (!selectedProductIds.has(product.id) && event) {
      const startRect = (event.target as HTMLElement).getBoundingClientRect();
      const cartRect = cartButtonRef.current?.getBoundingClientRect();
      
      if (cartRect) {
        const flyingItem: FlyingItem = {
          id: `${product.id}-${Date.now()}`,
          startX: startRect.left,
          startY: startRect.top,
          thumbnail: product.thumbnail
        };
        
        setFlyingItems(prev => [...prev, flyingItem]);

        setTimeout(() => {
          setCartBounceKey(prev => prev + 1);
        }, 1000);

        setTimeout(() => {
          setFlyingItems(prev => prev.filter(item => item.id !== flyingItem.id));
        }, 1000);
      }
    }
    
    setSelectedProducts(prev => {
      const isSelected = prev.some(p => p.id === product.id);
      if (isSelected) {
        return prev.filter(p => p.id !== product.id);
      } else {
        return [...prev, product];
      }
    });
  }, [selectedProductIds]);

  useEffect(() => {
    activeCategoryRef.current = activeCategory;
  }, [activeCategory]);

  useEffect(() => {
    const handleAdminRecordingToggle = (event: KeyboardEvent) => {
      if (!event.altKey || event.key !== '0') {
        return;
      }

      event.preventDefault();

      if (isAdminRecordingMode) {
        setIsAdminRecordingMode(false);
        setIsAdminPromptOpen(false);
        setAdminPasswordInput('');
        setAdminPasswordError('');
        return;
      }

      setIsAdminPromptOpen(true);
      setAdminPasswordInput('');
      setAdminPasswordError('');
    };

    window.addEventListener('keydown', handleAdminRecordingToggle);
    return () => window.removeEventListener('keydown', handleAdminRecordingToggle);
  }, [isAdminRecordingMode]);

  useEffect(() => {
    if (isAdminRecordingMode) {
      setIsCartOpen(false);
    }
  }, [isAdminRecordingMode]);

  useEffect(() => {
    if (!isAdminPromptOpen) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      adminPasswordInputRef.current?.focus();
    }, 10);

    return () => window.clearTimeout(timeoutId);
  }, [isAdminPromptOpen]);

  useEffect(() => {
    if (!isAdminPromptOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeAdminPrompt();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isAdminPromptOpen]);

  // Scoped to admin recording mode only - this used to run unconditionally
  // for every visitor, blocking right-click and DevTools shortcuts sitewide
  // with zero real security benefit (DevTools remain one click away via the
  // browser's own menu; view-source isn't blocked by page JS at all) while
  // genuinely costing real users things like right-click translate menus.
  // Its only real purpose is reducing accidental on-screen clutter/inspection
  // while the owner is actively screen-recording with prices hidden.
  useEffect(() => {
    if (!isAdminRecordingMode) {
      return;
    }

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    const handleBlockedShortcuts = (event: KeyboardEvent) => {
      const lowerKey = event.key.toLowerCase();
      const isShortcutBlocked =
        event.key === 'F12' ||
        (event.ctrlKey && event.shiftKey && ['i', 'j', 'c'].includes(lowerKey)) ||
        (event.ctrlKey && lowerKey === 'u');

      if (isShortcutBlocked) {
        event.preventDefault();
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleBlockedShortcuts);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleBlockedShortcuts);
    };
  }, [isAdminRecordingMode]);

  const closeAdminPrompt = useCallback(() => {
    setIsAdminPromptOpen(false);
    setAdminPasswordInput('');
    setAdminPasswordError('');
  }, []);

  const handleAdminPasswordSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (adminPasswordInput === getAdminRecordingPassword()) {
        setIsAdminRecordingMode(true);
        closeAdminPrompt();
        return;
      }

      setAdminPasswordError('Incorrect password.');
      setAdminPasswordInput('');
      window.setTimeout(() => adminPasswordInputRef.current?.focus(), 10);
    },
    [adminPasswordInput, closeAdminPrompt]
  );

  useEffect(() => {
    const observerOptions = {
      root: null,
      rootMargin: '-180px 0px -60% 0px',
      threshold: 0
    };

    const observerCallback: IntersectionObserverCallback = (entries) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const categoryName = entry.target.getAttribute('data-category');
          if (categoryName && categoryName !== activeCategoryRef.current) {
            setActiveCategory(categoryName);
          }
        }
      });
    };

    const observer = new IntersectionObserver(observerCallback, observerOptions);

    CATEGORIES.forEach((catName) => {
      const element = categoryRefs.current[catName];
      if (element) {
        element.setAttribute('data-category', catName);
        observer.observe(element);
      }
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (activeCategory && catContainerRef.current) {
      const activeBtn = catButtonRefs.current[activeCategory];
      const container = catContainerRef.current;
      
      if (activeBtn) {
        const targetScroll = activeBtn.offsetLeft - 24;
        container.scrollTo({
          left: targetScroll,
          behavior: 'smooth'
        });
      }
    }
  }, [activeCategory]);

  const scrollCatBar = useCallback((direction: 'left' | 'right') => {
    if (catContainerRef.current) {
      const scrollAmount = 300;
      catContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  }, []);

  const scrollToCategory = useCallback((catName: string) => {
    const element = categoryRefs.current[catName];
    if (element) {
      const headerElement = element.querySelector('.category-header');
      const targetElement = headerElement || element;
      
      const offset = window.innerWidth >= 1024 ? 200 : 176;
      const elementRect = targetElement.getBoundingClientRect();
      const elementPosition = elementRect.top + window.scrollY;
      const offsetPosition = elementPosition - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  }, []);

  const toggleCategory = useCallback((catName: string) => {
    const isOpening = !openCategories[catName];
    
    setOpenCategories(prev => {
      if (isOpening) {
        return { [catName]: true };
      }
      const newState = { ...prev };
      delete newState[catName];
      return newState;
    });

    if (isOpening) {
      setTimeout(() => scrollToCategory(catName), 600);
    }
  }, [openCategories, scrollToCategory]);

  const jumpToCategory = useCallback((catName: string) => {
    if (openCategories[catName]) {
      scrollToCategory(catName);
      return;
    }

    setOpenCategories(prev => ({ ...prev, [catName]: true }));
    setTimeout(() => scrollToCategory(catName), 50);
  }, [openCategories, scrollToCategory]);

  const handleSearchSelect = useCallback((product: Product) => {
    setHighlightedProductId(product.id);
    jumpToCategory(product.category);
    setTimeout(() => setHighlightedProductId(null), 3500);
  }, [jumpToCategory]);

  useEffect(() => {
    if (!isNotFound) {
      return;
    }

    const previousTitle = document.title;
    const robotsMeta = document.querySelector('meta[name="robots"]');
    const previousRobots = robotsMeta?.getAttribute('content') ?? null;

    document.title = "404 | Doji's Library";
    if (robotsMeta) {
      robotsMeta.setAttribute('content', 'noindex, nofollow');
    }

    return () => {
      document.title = previousTitle;
      if (robotsMeta && previousRobots !== null) {
        robotsMeta.setAttribute('content', previousRobots);
      }
    };
  }, [isNotFound]);

  if (isNotFound) {
    return <NotFoundPage />;
  }

  if (pdfProductId) {
    const product = getProductById(pdfProductId);
    return (
      <Suspense fallback={<RouteLoadingScreen />}>
        <PdfGatePage product={product} productId={pdfProductId} />
      </Suspense>
    );
  }

  if (isMyLibraryPath) {
    return (
      <Suspense fallback={<RouteLoadingScreen />}>
        <MyLibraryPage />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen font-sans selection:bg-brand-yellow selection:text-black relative">
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-[200] -translate-y-24 focus:translate-y-0 bg-brand-yellow text-[#1a1d1e] px-4 py-3 rounded-sm font-bold uppercase tracking-wider transition-transform"
      >
        Skip to content
      </a>
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[10%] left-[-10%] w-[50%] h-[50%] ambient-glow opacity-40"></div>
        <div className="absolute bottom-[20%] right-[-10%] w-[60%] h-[60%] ambient-glow opacity-30 rotate-180"></div>
      </div>

      <div className="relative z-10">
        <Navbar onSearchSelect={handleSearchSelect} />
        
        <div className="sticky top-20 laptop:top-[88px] xl:top-24 z-50 bg-[#1a1d1e] border-b border-white/5 shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <div className="max-w-[1600px] mx-auto px-4 lg:px-6 flex items-center">
            <div 
              ref={catContainerRef}
              className="flex-grow flex gap-6 whitespace-nowrap overflow-x-auto no-scrollbar py-4 lg:py-5 relative"
            >
              {CATEGORIES.map(cat => {
                const isCourseTab = cat === AI_COURSES_CATEGORY;
                return (
                  <button
                    key={cat}
                    ref={el => { catButtonRefs.current[cat] = el; }}
                    onClick={() => jumpToCategory(cat)}
                    className={`inline-flex items-center justify-center px-6 py-3 rounded-sm transition-all border font-poppins text-sm md:text-base ${
                      activeCategory === cat
                        ? 'bg-brand-yellow/15 border-brand-yellow text-brand-yellow'
                        : isCourseTab
                          ? 'bg-brand-yellow/5 border-brand-yellow/30 text-brand-yellow/60 hover:text-brand-yellow hover:border-brand-yellow'
                          : 'bg-transparent border-white/10 text-brand-muted hover:text-white hover:border-white/30'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>

            <div className="hidden lg:flex items-center gap-2 pl-6 ml-6 border-l border-white/5">
              <button 
                onClick={() => scrollCatBar('left')}
                className="flex items-center justify-center w-10 h-10 rounded-sm bg-black border border-white/10 text-brand-gray hover:text-brand-yellow hover:border-brand-yellow transition-all active:scale-90"
                aria-label="Scroll left"
              >
                <ChevronLeft size={20} strokeWidth={3} />
              </button>
              <button 
                onClick={() => scrollCatBar('right')}
                className="flex items-center justify-center w-10 h-10 rounded-sm bg-black border border-white/10 text-brand-gray hover:text-brand-yellow hover:border-brand-yellow transition-all active:scale-90"
                aria-label="Scroll right"
              >
                <ChevronRight size={20} strokeWidth={3} />
              </button>
            </div>
          </div>
        </div>
        
        <header className="relative w-full py-8 md:py-12 lg:py-16 laptop:py-20 bg-[#1a1d1e] overflow-hidden">
          <div className="hero-dots"></div>
          <div className="absolute -top-20 -right-20 w-[280px] h-[280px] rounded-full border border-[rgba(230,204,179,0.28)] pointer-events-none"></div>
          <div className="absolute -bottom-16 -left-16 w-[200px] h-[200px] rounded-full border border-[rgba(230,204,179,0.28)] pointer-events-none"></div>
          <div className="max-w-[1600px] mx-auto px-4 lg:px-6">
            <div className="relative z-20 border-l-4 lg:border-l-8 border-brand-yellow pl-8 lg:pl-12 py-2 lg:py-4">
              <h1 className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl laptop:text-8xl font-normal text-[#e6ccb3] leading-[1.1] tracking-tighter drop-shadow-2xl">
                {SITE_CONTENT.hero.mainTitle}
              </h1>
              <p className="f-small text-[#8a7d6f] mt-6 lg:mt-10 font-normal tracking-[0.4em] opacity-40">
                {SITE_CONTENT.hero.subTitle}
              </p>
            </div>
          </div>
        </header>

        <main id="main-content" className="max-w-[1600px] mx-auto px-4 lg:px-6 pb-40">

          <div className="relative">
            {CATEGORIES.map(categoryName => (
              <CategorySection 
                key={categoryName}
                ref={el => { categoryRefs.current[categoryName] = el; }}
                name={categoryName}
                isOpen={!!openCategories[categoryName]}
                onToggle={() => toggleCategory(categoryName)}
                products={productsByCategory[categoryName] ?? []}
                highlightedProductId={highlightedProductId}
                selectedProducts={selectedProducts}
                selectedProductIds={selectedProductIds}
                onToggleSelect={handleToggleSelect}
                hideCommerce={isAdminRecordingMode}
              />
            ))}
          </div>

          <Suspense fallback={null}>
            <FAQSection />
          </Suspense>
        </main>

        <footer className="border-t border-white/5 bg-[#1a1d1e] py-24 md:py-40 px-4 lg:px-6 relative z-10">
          <div className="max-w-[1600px] mx-auto flex flex-col items-center md:items-start text-center md:text-left gap-16">
            <div className="space-y-8 flex flex-col items-center md:items-start w-full">
              <div className="text-2xl font-normal text-white uppercase tracking-[0.4em] border-b-2 border-brand-yellow w-fit pb-2">
                {SITE_CONTENT.brandName}
              </div>
              <p className="f-body text-brand-muted leading-relaxed max-w-md font-normal">
                {SITE_CONTENT.footer.description}
              </p>
            </div>
          </div>
          
          <div className="max-w-[1600px] mx-auto mt-24 md:mt-40 pt-12 border-t border-white/5 flex flex-col items-center gap-10 text-center md:flex-row md:justify-between">
            <p className="f-small text-brand-muted font-normal">{SITE_CONTENT.footer.copyright}</p>
          </div>
        </footer>

        {!isAdminRecordingMode && (
          <button
            ref={cartButtonRef}
            onClick={() => setIsCartOpen(true)}
            key={cartBounceKey}
            className="fixed bottom-6 right-6 z-[99] bg-white text-[#1a1d1e] p-4 rounded-full shadow-2xl hover:bg-white/80 transition-all duration-300 active:scale-95 group cart-bounce"
            aria-label="Open cart"
          >
            <ShoppingCart size={28} strokeWidth={2.5} />
            {selectedProducts.length > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full h-7 w-7 flex items-center justify-center text-xs font-bold border-2 border-[#1e2122]">
                {selectedProducts.length}
              </span>
            )}
          </button>
        )}

        {!isAdminRecordingMode && (
          <Suspense fallback={null}>
            <ChatWidget />
          </Suspense>
        )}

        {flyingItems.map(item => {
          const cartRect = cartButtonRef.current?.getBoundingClientRect();
          if (!cartRect) return null;
          
          const flyEndX = cartRect.left + cartRect.width / 2 - item.startX;
          const flyEndY = cartRect.top + cartRect.height / 2 - item.startY;
          
          return (
            <img
              key={item.id}
              src={item.thumbnail}
              alt=""
              className="fly-to-cart"
              loading="eager"
              decoding="async"
              referrerPolicy="no-referrer"
              style={{
                left: item.startX,
                top: item.startY,
                '--fly-end-x': `${flyEndX}px`,
                '--fly-end-y': `${flyEndY}px`
              } as React.CSSProperties}
            />
          );
        })}
      </div>

      {isCartOpen && !isAdminRecordingMode && (
        <Suspense fallback={null}>
          <CartModal
            isOpen={isCartOpen && !isAdminRecordingMode}
            onClose={() => setIsCartOpen(false)}
            selectedProducts={selectedProducts}
            onToggleSelect={handleToggleSelect}
            hideCommerce={isAdminRecordingMode}
          />
        </Suspense>
      )}

      {isAdminPromptOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={closeAdminPrompt}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-modal-title"
            className="relative w-full max-w-md rounded-lg border border-white/10 bg-[#2a2e2f] shadow-2xl overflow-hidden"
          >
            <div className="border-b border-white/10 bg-[#1a1d1e] px-6 py-4">
              <h2 id="admin-modal-title" className="text-xl font-black uppercase tracking-[0.18em] text-white">
                Admin Access
              </h2>
              <p className="mt-2 text-base text-brand-muted">
                Enter the admin password to hide prices and the cart icon.
              </p>
            </div>

            <form onSubmit={handleAdminPasswordSubmit} className="px-6 py-5">
              <label className="block text-sm font-bold uppercase tracking-[0.18em] text-white/60 mb-2">
                Password
              </label>
              <input
                ref={adminPasswordInputRef}
                type="password"
                value={adminPasswordInput}
                onChange={(event) => {
                  setAdminPasswordInput(event.target.value);
                  if (adminPasswordError) {
                    setAdminPasswordError('');
                  }
                }}
                className="w-full rounded-sm border border-white/10 bg-black px-4 py-3 text-white outline-none transition-all focus:border-brand-yellow"
                autoComplete="off"
              />

              <div className="min-h-6 pt-2 text-base text-red-400">
                {adminPasswordError}
              </div>

              <div className="mt-4 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeAdminPrompt}
                  className="rounded-sm border border-white/10 bg-transparent px-4 py-2 text-base font-bold uppercase tracking-[0.14em] text-white/70 transition-colors hover:border-white/30 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-sm border border-brand-yellow bg-brand-yellow px-4 py-2 text-base font-bold uppercase tracking-[0.14em] text-black transition-all hover:bg-transparent hover:text-brand-yellow"
                >
                  Unlock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
