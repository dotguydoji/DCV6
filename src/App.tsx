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
const NotebookPage = lazyWithReload(() => import('./components/NotebookPage').then((m) => ({ default: m.NotebookPage })));
import { PRODUCTS, CATEGORIES, SITE_CONTENT, AI_COURSES_CATEGORY, getProductById } from "./constants";
import { Product } from './types';
import { ChevronLeft, ChevronRight, ShoppingCart } from 'lucide-react';
import { useScrollReveal } from './lib/useScrollReveal';
import { useGlobalScrollTilt } from './lib/useScrollTilt';
import { scheduleScrollUnlessUserIntervenes } from './lib/scrollGuard';
import { startAuthSessionKeepAlive } from './lib/googleIdentity';

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
const NOTEBOOK_PATH = '/notebook';

/**
 * Shown while a lazy-loaded route's code is still downloading. Without
 * this, a slow/stalled chunk fetch (much more common on a live CDN than
 * local dev, where everything loads instantly from disk) rendered nothing
 * at all - indistinguishable from a real crash, with no way to tell it was
 * still just loading.
 */
const RouteLoadingScreen: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-surface text-text-secondary">
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

  const isNotebookPath = useMemo(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return normalizePathname(window.location.pathname) === NOTEBOOK_PATH;
  }, []);

  const isNotFound = useMemo(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    const pathname = normalizePathname(window.location.pathname);
    if (pathname === '/' || pathname === '/index.html' || pathname === '/index.htm') {
      return false;
    }

    return !VIEW_PATH_PATTERN.test(pathname) && pathname !== MY_LIBRARY_PATH && pathname !== NOTEBOOK_PATH;
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
  const [catBarOverflows, setCatBarOverflows] = useState(false);
  const cartButtonRef = useRef<HTMLButtonElement>(null);
  const adminPasswordInputRef = useRef<HTMLInputElement>(null);
  const footerRevealRef = useScrollReveal<HTMLElement>();
  useGlobalScrollTilt();

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

  // App is the single always-mounted root for every route (see the
  // pathname-based branches below) - running this here, unconditionally,
  // is what makes the background session renewal apply everywhere (mid-read
  // in the PDF viewer, browsing My Library, etc.), not just on whichever
  // page happens to render a sign-in button.
  useEffect(() => startAuthSessionKeepAlive(), []);

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

  // The prev/next scroll buttons next to the category tab bar are only
  // useful once the tabs actually overflow the available width - on a wide
  // enough screen every tab already fits, so the buttons had nothing to do
  // and were just clutter. ResizeObserver (rather than a plain window
  // resize listener) also catches width changes from things like a
  // sidebar/font load, not just the window itself.
  useEffect(() => {
    const container = catContainerRef.current;
    if (!container) return;

    const checkOverflow = () => {
      setCatBarOverflows(container.scrollWidth - container.clientWidth > 1);
    };

    checkOverflow();

    const resizeObserver = new ResizeObserver(checkOverflow);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
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

  // Schedules an auto-scroll to a just-opened/jumped-to category, but backs
  // off entirely if the visitor starts scrolling manually before it fires -
  // see scrollGuard.ts for why.
  const scrollToCategorySoon = useCallback(
    (catName: string, delayMs: number) => scheduleScrollUnlessUserIntervenes(() => scrollToCategory(catName), delayMs),
    [scrollToCategory]
  );

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
      scrollToCategorySoon(catName, 600);
    }
  }, [openCategories, scrollToCategorySoon]);

  const jumpToCategory = useCallback((catName: string) => {
    if (openCategories[catName]) {
      scrollToCategory(catName);
      return;
    }

    setOpenCategories(prev => ({ ...prev, [catName]: true }));
    scrollToCategorySoon(catName, 50);
  }, [openCategories, scrollToCategory, scrollToCategorySoon]);

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

  if (isNotebookPath) {
    return (
      <Suspense fallback={<RouteLoadingScreen />}>
        <NotebookPage />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen font-sans selection:bg-surface-inverted selection:text-text-inverted relative">
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-[200] -translate-y-24 focus:translate-y-0 bg-surface-inverted text-text-inverted px-4 py-3 rounded-sm font-bold uppercase tracking-wider transition-transform"
      >
        Skip to content
      </a>
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[10%] left-[-10%] w-[50%] h-[50%] ambient-glow opacity-40"></div>
        <div className="absolute bottom-[20%] right-[-10%] w-[60%] h-[60%] ambient-glow opacity-30 rotate-180"></div>
      </div>

      <div className="relative z-10">
        <Navbar onSearchSelect={handleSearchSelect} />
        
        <div className="sticky top-20 laptop:top-[88px] xl:top-24 z-50 bg-surface border-b border-border-hairline">
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
                        ? 'bg-surface-inverted border-surface-inverted text-text-inverted'
                        : isCourseTab
                          ? 'bg-transparent border-border-strong text-text-secondary hover:text-text-primary hover:border-border-strong'
                          : 'bg-transparent border-border-hairline text-text-secondary hover:text-text-primary hover:border-border-strong'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>

            {catBarOverflows && (
            <div className="hidden lg:flex items-center gap-2 pl-6 ml-6 border-l border-border-hairline">
              <button
                onClick={() => scrollCatBar('left')}
                className="flex items-center justify-center w-10 h-10 rounded-sm bg-surface-secondary border border-border-hairline text-text-secondary hover:text-text-primary hover:border-border-strong transition-all active:scale-90"
                aria-label="Scroll left"
              >
                <ChevronLeft size={20} strokeWidth={1.5} />
              </button>
              <button
                onClick={() => scrollCatBar('right')}
                className="flex items-center justify-center w-10 h-10 rounded-sm bg-surface-secondary border border-border-hairline text-text-secondary hover:text-text-primary hover:border-border-strong transition-all active:scale-90"
                aria-label="Scroll right"
              >
                <ChevronRight size={20} strokeWidth={1.5} />
              </button>
            </div>
            )}
          </div>
        </div>

        <header className="relative w-full py-8 md:py-12 lg:py-16 laptop:py-20 bg-surface overflow-hidden">
          <div className="hero-grid"></div>
          <div className="absolute -top-20 -right-20 w-[280px] h-[280px] rounded-full border border-border-hairline pointer-events-none"></div>
          <div className="absolute -bottom-16 -left-16 w-[200px] h-[200px] rounded-full border border-border-hairline pointer-events-none"></div>
          <div className="max-w-[1600px] mx-auto px-4 lg:px-6 relative">
            <div className="hidden lg:flex animate-hero-in absolute top-0 right-4 xl:right-10 items-center gap-3 text-text-secondary">
              <span className="text-xs font-medium uppercase tracking-[0.3em]">
                {String(CATEGORIES.length).padStart(2, '0')} Categories
              </span>
              <div className="h-px w-10 bg-border-hairline"></div>
            </div>
            <div className="animate-hero-in relative z-20 border-l-4 lg:border-l-8 border-text-primary pl-8 lg:pl-12 py-2 lg:py-4">
              <h1 className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl laptop:text-8xl font-normal text-text-primary leading-[1.1] tracking-tighter">
                {SITE_CONTENT.hero.mainTitle}
              </h1>
              <div className="flex items-center gap-4 mt-6 lg:mt-10 animate-hero-in-delayed">
                <div className="h-px w-8 bg-border-strong"></div>
                <p className="f-small text-text-secondary font-normal tracking-[0.4em]">
                  {SITE_CONTENT.hero.subTitle}
                </p>
              </div>
            </div>
          </div>
        </header>

        <main id="main-content" className="max-w-[1600px] mx-auto px-4 lg:px-6 pb-40">

          <div className="relative">
            {CATEGORIES.map((categoryName, categoryIndex) => (
              <CategorySection
                key={categoryName}
                ref={el => { categoryRefs.current[categoryName] = el; }}
                name={categoryName}
                index={categoryIndex}
                total={CATEGORIES.length}
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

        <footer ref={footerRevealRef} className="reveal border-t border-border-hairline bg-surface py-24 md:py-40 px-4 lg:px-6 relative z-10">
          <div className="max-w-[1600px] mx-auto flex flex-col items-center md:items-start text-center md:text-left gap-16">
            <div className="space-y-8 flex flex-col items-center md:items-start w-full">
              <div className="text-2xl font-normal text-text-primary uppercase tracking-[0.4em] border-b-2 border-text-primary w-fit pb-2">
                {SITE_CONTENT.brandName}
              </div>
              <p className="f-body text-text-secondary leading-relaxed max-w-md font-normal">
                {SITE_CONTENT.footer.description}
              </p>
            </div>
          </div>

          <div className="max-w-[1600px] mx-auto mt-24 md:mt-40 pt-12 border-t border-border-hairline flex flex-col items-center gap-10 text-center md:flex-row md:justify-between">
            <p className="f-small text-text-secondary font-normal">{SITE_CONTENT.footer.copyright}</p>
          </div>
        </footer>

        {!isAdminRecordingMode && (
          <button
            ref={cartButtonRef}
            onClick={() => setIsCartOpen(true)}
            key={cartBounceKey}
            className="fixed bottom-6 right-6 z-[99] bg-surface-inverted text-text-inverted p-4 rounded-full shadow-lg hover:opacity-90 transition-all duration-300 active:scale-95 group cart-bounce"
            aria-label="Open cart"
          >
            <ShoppingCart size={28} strokeWidth={1.5} />
            {selectedProducts.length > 0 && (
              <span className="absolute -top-2 -right-2 bg-surface text-text-primary rounded-full h-7 w-7 flex items-center justify-center text-xs font-bold border-2 border-surface-inverted">
                {selectedProducts.length}
              </span>
            )}
          </button>
        )}

        {!isAdminRecordingMode && (
          <Suspense fallback={null}>
            <ChatWidget onProductSelect={handleSearchSelect} />
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
            className="relative w-full max-w-md rounded-lg border border-border-hairline bg-surface-secondary shadow-2xl overflow-hidden"
          >
            <div className="border-b border-border-hairline bg-surface px-6 py-4">
              <h2 id="admin-modal-title" className="text-xl font-black uppercase tracking-[0.18em] text-text-primary">
                Admin Access
              </h2>
              <p className="mt-2 text-base text-text-secondary">
                Enter the admin password to hide prices and the cart icon.
              </p>
            </div>

            <form onSubmit={handleAdminPasswordSubmit} className="px-6 py-5">
              <label className="block text-sm font-bold uppercase tracking-[0.18em] text-text-secondary mb-2">
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
                className="w-full rounded-sm border border-border-hairline bg-surface px-4 py-3 text-text-primary outline-none transition-all focus:border-border-strong"
                autoComplete="off"
              />

              <div className="min-h-6 pt-2 text-base text-red-400">
                {adminPasswordError}
              </div>

              <div className="mt-4 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeAdminPrompt}
                  className="rounded-sm border border-border-hairline bg-transparent px-4 py-2 text-base font-bold uppercase tracking-[0.14em] text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-sm border border-surface-inverted bg-surface-inverted px-4 py-2 text-base font-bold uppercase tracking-[0.14em] text-text-inverted transition-all hover:opacity-90"
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
