import React, { useState, useRef, useEffect, useMemo, useCallback, Suspense } from 'react';
import { Navbar } from './components/Navbar';
import { CategorySection } from './components/CategorySection';
import { NotFoundPage } from './components/NotFoundPage';
import { lazyWithReload } from './lazyWithReload';

const FAQSection = lazyWithReload(() => import('./components/FAQSection').then((m) => ({ default: m.FAQSection })));
const CartModal = lazyWithReload(() => import('./components/CartModal').then((m) => ({ default: m.CartModal })));
const OrderSubmittedModal = lazyWithReload(() =>
  import('./components/OrderSubmittedModal').then((m) => ({ default: m.OrderSubmittedModal }))
);
const ChatWidget = lazyWithReload(() => import('./components/ChatWidget').then((m) => ({ default: m.ChatWidget })));
const PdfGatePage = lazyWithReload(() => import('./components/PdfGatePage').then((m) => ({ default: m.PdfGatePage })));
const MyLibraryPage = lazyWithReload(() => import('./components/MyLibraryPage').then((m) => ({ default: m.MyLibraryPage })));
const NotebookPage = lazyWithReload(() => import('./components/NotebookPage').then((m) => ({ default: m.NotebookPage })));
const TypingSpeedPage = lazyWithReload(() => import('./components/TypingSpeedPage').then((m) => ({ default: m.TypingSpeedPage })));
import { PRODUCTS, CATEGORIES, SITE_CONTENT, AI_COURSES_CATEGORY, PRODUCTIVITY_APPS_CATEGORY, getProductById } from "./constants";
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
  width: number;
  height: number;
  thumbnail: string;
}

// Kept in sync with the .fly-to-cart animation-duration in index.css - the
// cart bounce is timed to land exactly when the flying thumbnail arrives,
// and the item is only removed from the DOM once its animation is done.
const FLY_TO_CART_DURATION_MS = 700;

const normalizePathname = (pathname: string) => {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
};

const VIEW_PATH_PATTERN = /^\/view\/(.+)$/;
const MY_LIBRARY_PATH = '/my-library';
const NOTEBOOK_PATH = '/notebook';
const TYPING_SPEED_PATH = '/typing-speed';

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

  const isTypingSpeedPath = useMemo(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return normalizePathname(window.location.pathname) === TYPING_SPEED_PATH;
  }, []);

  const isNotFound = useMemo(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    const pathname = normalizePathname(window.location.pathname);
    if (pathname === '/' || pathname === '/index.html' || pathname === '/index.htm') {
      return false;
    }

    return (
      !VIEW_PATH_PATTERN.test(pathname) &&
      pathname !== MY_LIBRARY_PATH &&
      pathname !== NOTEBOOK_PATH &&
      pathname !== TYPING_SPEED_PATH
    );
  }, []);

  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({
    [CATEGORIES[0]]: true
  });
  const [activeCategory, setActiveCategory] = useState<string | null>(CATEGORIES[0]);
  const [highlightedProductId, setHighlightedProductId] = useState<string | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isOrderSubmittedOpen, setIsOrderSubmittedOpen] = useState(false);
  const [flyingItems, setFlyingItems] = useState<FlyingItem[]>([]);
  const [cartBounceKey, setCartBounceKey] = useState(0);
  const [isAdminRecordingMode, setIsAdminRecordingMode] = useState(false);

  const categoryRefs = useRef<Record<string, HTMLElement | null>>({});
  const catContainerRef = useRef<HTMLDivElement>(null);
  const catButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [catBarOverflows, setCatBarOverflows] = useState(false);
  const cartButtonRef = useRef<HTMLButtonElement>(null);
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
      // Whichever element the click actually landed on (the card itself, or
      // the small Plus/Check button nested inside it) - walk up to the
      // card's own root so the flight always starts from the product
      // thumbnail, not from whatever tiny element was clicked.
      const clickedEl = event.target as HTMLElement;
      const cardEl = clickedEl.closest('[data-flyable-card]') as HTMLElement | null;
      const thumbnailEl = cardEl?.querySelector('img') ?? null;
      const startRect = (thumbnailEl ?? cardEl ?? clickedEl).getBoundingClientRect();
      const cartRect = cartButtonRef.current?.getBoundingClientRect();

      if (cartRect && startRect.width > 0 && startRect.height > 0) {
        const flyingItem: FlyingItem = {
          id: `${product.id}-${Date.now()}`,
          startX: startRect.left,
          startY: startRect.top,
          width: startRect.width,
          height: startRect.height,
          thumbnail: product.thumbnail
        };

        setFlyingItems(prev => [...prev, flyingItem]);

        setTimeout(() => {
          setCartBounceKey(prev => prev + 1);
        }, FLY_TO_CART_DURATION_MS);

        setTimeout(() => {
          setFlyingItems(prev => prev.filter(item => item.id !== flyingItem.id));
        }, FLY_TO_CART_DURATION_MS);
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
      setIsAdminRecordingMode((prev) => !prev);
    };

    window.addEventListener('keydown', handleAdminRecordingToggle);
    return () => window.removeEventListener('keydown', handleAdminRecordingToggle);
  }, []);

  useEffect(() => {
    if (isAdminRecordingMode) {
      setIsCartOpen(false);
    }
  }, [isAdminRecordingMode]);

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

    // Replace (not merge) so any other open category auto-closes, matching
    // toggleCategory's single-open-category-at-a-time behavior.
    setOpenCategories({ [catName]: true });
    // Must match toggleCategory's 600ms delay, not be shorter: closing the
    // previously-open category and expanding this one both animate over
    // CategorySection's own 500ms max-height/opacity transition
    // (`duration-500` in CategorySection.tsx). Measuring the target's
    // position with getBoundingClientRect() before that settles reads a
    // mid-animation (wrong) layout, overshooting the scroll - the exact
    // "have to click twice" bug this delay fixes.
    scrollToCategorySoon(catName, 600);
  }, [openCategories, scrollToCategory, scrollToCategorySoon]);

  const handleSearchSelect = useCallback((product: Product) => {
    setHighlightedProductId(product.id);
    jumpToCategory(product.category);
    setTimeout(() => setHighlightedProductId(null), 3500);
  }, [jumpToCategory]);

  // Deep link for My Library's New PDF Releases section ("Click Here to
  // View") - a real cross-page navigation to /?product=<id> (not client-side
  // routing; this codebase has none, see normalizePathname/pdfProductId
  // above), so this effect is what picks the id back up once the homepage
  // has actually loaded and jumps to/highlights that exact card, the same
  // way clicking a search result already does. Only ever acts on the
  // homepage itself - a stray ?product= on another route is a no-op.
  useEffect(() => {
    if (pdfProductId || isMyLibraryPath || isNotebookPath || isTypingSpeedPath || isNotFound) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const targetId = params.get('product');
    if (!targetId) {
      return;
    }

    // Strip the param immediately regardless of whether the id resolved, so
    // a refresh/back-navigation never re-triggers the highlight, and a
    // garbage/typo'd id doesn't linger visibly in the address bar.
    const url = new URL(window.location.href);
    url.searchParams.delete('product');
    window.history.replaceState({}, '', url.toString());

    const product = getProductById(targetId);
    if (!product) {
      return;
    }

    handleSearchSelect(product);
  }, [pdfProductId, isMyLibraryPath, isNotebookPath, isTypingSpeedPath, isNotFound, handleSearchSelect]);

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

  if (isTypingSpeedPath) {
    return (
      <Suspense fallback={<RouteLoadingScreen />}>
        <TypingSpeedPage />
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
                const isProductivityTab = cat === PRODUCTIVITY_APPS_CATEGORY;
                return (
                  <button
                    key={cat}
                    ref={el => { catButtonRefs.current[cat] = el; }}
                    onClick={() => jumpToCategory(cat)}
                    className={`inline-flex items-center justify-center px-6 py-3 rounded-sm transition-all border font-poppins text-sm md:text-base ${
                      activeCategory === cat
                        ? isProductivityTab
                          ? 'bg-orange-500 border-orange-500 text-white'
                          : 'bg-surface-inverted border-surface-inverted text-text-inverted'
                        : isProductivityTab
                          ? 'bg-transparent border-orange-500/40 text-orange-500 hover:border-orange-500 hover:text-orange-500'
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

        <Suspense fallback={null}>
          <ChatWidget onProductSelect={handleSearchSelect} />
        </Suspense>

        {flyingItems.map(item => {
          const cartRect = cartButtonRef.current?.getBoundingClientRect();
          if (!cartRect) return null;

          // Deltas are measured center-to-center (not corner-to-corner) so
          // the shrinking thumbnail actually converges on the cart icon's
          // center, regardless of how large the source thumbnail is.
          const startCenterX = item.startX + item.width / 2;
          const startCenterY = item.startY + item.height / 2;
          const cartCenterX = cartRect.left + cartRect.width / 2;
          const cartCenterY = cartRect.top + cartRect.height / 2;
          const flyEndX = cartCenterX - startCenterX;
          const flyEndY = cartCenterY - startCenterY;
          // The arc's peak dips above the straight-line path by an amount
          // proportional to the travel distance, so a short hop (adjacent
          // card) and a long one (top of the page) both read as a natural
          // throw rather than either barely lifting or overshooting wildly.
          const arcLift = Math.min(140, Math.max(40, Math.abs(flyEndY) * 0.35));
          // Lands at roughly the cart icon's own on-screen size, whatever
          // the source thumbnail's actual dimensions were.
          const endScale = Math.min(0.9, Math.max(0.08, (cartRect.width * 0.7) / item.width));

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
                width: item.width,
                height: item.height,
                '--fly-end-x': `${flyEndX}px`,
                '--fly-end-y': `${flyEndY}px`,
                '--fly-arc-lift': `${arcLift}px`,
                '--fly-end-scale': endScale
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
            onOrderSubmitted={() => {
              setIsCartOpen(false);
              setIsOrderSubmittedOpen(true);
            }}
          />
        </Suspense>
      )}

      {isOrderSubmittedOpen && !isAdminRecordingMode && (
        <Suspense fallback={null}>
          <OrderSubmittedModal open={isOrderSubmittedOpen} onClose={() => setIsOrderSubmittedOpen(false)} />
        </Suspense>
      )}
    </div>
  );
};

export default App;
