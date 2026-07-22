import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Heart,
  Keyboard,
  LayoutGrid,
  LibraryBig,
  LogOut,
  MessageCircle,
  Menu,
  NotebookPen,
  PlayCircle,
  RefreshCw,
  Search,
  X
} from 'lucide-react';
import { GoogleSignInButton } from './GoogleSignInButton';
import { MessengerJoinDialog } from './MessengerJoinDialog';
import { NoPdfAccessDialog } from './NoPdfAccessDialog';
import { ProductivitySubscribeDialog } from './ProductivitySubscribeDialog';
import { ThemeToggle } from './ThemeToggle';
import { getProductById, isProductivityFeatureProductId, PRODUCTIVITY_SUBSCRIPTION_PRODUCT_ID } from '../constants';
import { Product } from '../types';
import {
  clearCachedIdToken,
  getCachedIdToken,
  getIdTokenEmail,
  getIdTokenProfile,
  IdTokenProfile,
  setCachedIdToken,
  signOutOfGoogle
} from '../lib/googleIdentity';
import {
  getFavoriteIds,
  getRecentlyOpened,
  RecentlyOpenedEntry,
  toggleFavorite
} from '../lib/libraryPreferences';
import { getReadingProgress } from '../lib/pdfViewerPreferences';
import { fetchNewPdfReleases, fetchNewVideos, NewReleasePdf, NewReleaseVideo } from '../lib/newReleases';
import { fetchProductVideos, fetchVideoProductIds, PremiumVideoSummary } from '../lib/premiumVideos';
import { getCachedResponse, setCachedResponse } from '../lib/requestCache';
import { useGlobalScrollTilt } from '../lib/useScrollTilt';

const LIBRARY_CACHE_TTL_MS = 20 * 60 * 1000;
// Shorter than the productIds cache above on purpose - this drives a
// user-facing expiry warning, so it should go stale faster than the
// ownership list itself does.
const PRODUCTIVITY_SUBSCRIPTION_CACHE_TTL_MS = 5 * 60 * 1000;
const PRODUCTIVITY_EXPIRY_WARNING_DAYS = 7;

interface ProductivitySubscriptionInfo {
  expiresAt: string;
  daysRemaining: number;
}

type ViewState =
  | { status: 'restoring' }
  | { status: 'signed-out' }
  | { status: 'checking' }
  | { status: 'error'; message: string; idToken: string }
  | { status: 'rate-limited'; idToken: string }
  | { status: 'ready'; productIds: string[] };

type SortOption = 'title-asc' | 'title-desc' | 'recent';

const ALL_CATEGORY = 'All';
const ALL_LANGUAGES = 'all';
const ALL_LEVELS = 'all';

const formatLevel = (level: string) =>
  level
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const formatRelativeDate = (timestampMs: number): string => {
  const diffMs = Date.now() - timestampMs;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 'Opened today';
  if (diffDays === 1) return 'Opened yesterday';
  if (diffDays < 7) return `Opened ${diffDays} days ago`;
  return `Opened ${new Date(timestampMs).toLocaleDateString()}`;
};

interface FavoriteHeartProps {
  productId: string;
  isFavorited: boolean;
  onToggle: (productId: string) => void;
}

const FavoriteHeart: React.FC<FavoriteHeartProps> = ({ productId, isFavorited, onToggle }) => (
  <button
    type="button"
    onClick={(event) => {
      event.preventDefault();
      event.stopPropagation();
      onToggle(productId);
    }}
    aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
    aria-pressed={isFavorited}
    className={`flex items-center justify-center w-9 h-9 transition-colors ${
      isFavorited ? 'text-red-500' : 'text-text-secondary hover:text-red-400'
    }`}
  >
    <Heart className="w-6 h-6" strokeWidth={1.5} fill={isFavorited ? 'currentColor' : 'none'} />
  </button>
);

interface LibraryCardProps {
  product: Product;
  isFavorited: boolean;
  onToggleFavorite: (productId: string) => void;
  lastOpenedAt?: number;
  readingPercent?: number;
}

const LibraryCard: React.FC<LibraryCardProps> = ({
  product,
  isFavorited,
  onToggleFavorite,
  readingPercent
}) => (
  <a
    href={`/view/${encodeURIComponent(product.id)}`}
    data-product-id={product.id}
    className="group flex flex-col bg-surface border border-border-hairline rounded-sm overflow-hidden card-elevated card-tilt hover:border-border-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-border-strong/20"
  >
    <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface-secondary">
      <img
        src={product.thumbnail}
        alt=""
        className="w-full h-full object-cover transition-transform duration-700 ease-in-out group-hover:scale-110"
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
      />
    </div>
    <div className="p-5 flex flex-col flex-grow">
      <h3 className="font-poppins font-normal text-lg lg:text-xl text-text-primary mb-1 leading-tight line-clamp-2 min-h-[2lh]">
        {product.title}
      </h3>
      <p className="text-xs normal-case text-text-secondary mb-4 flex-grow tracking-normal leading-relaxed line-clamp-2 font-normal">
        {product.description}
      </p>

      <div className="mt-auto border-t border-border-hairline -mx-5 -mb-5 px-5 py-2.5 flex items-center justify-between gap-3">
        <div className="w-1/2 min-w-0 flex items-center justify-start gap-2">
          {typeof readingPercent === 'number' && (
            <>
              <div className="flex-1 h-2 rounded-full bg-surface-secondary overflow-hidden">
                <div
                  className="h-full bg-text-primary transition-all"
                  style={{ width: `${readingPercent}%` }}
                />
              </div>
              <span className="text-xs text-text-secondary shrink-0">{readingPercent}%</span>
            </>
          )}
        </div>
        <div className="w-1/2 flex items-center justify-end gap-2">
          {product.language && (
            <span className="f-small text-text-secondary border border-border-hairline rounded-sm px-2 py-0.5">
              {product.language === 'en' ? 'English' : 'Tagalog'}
            </span>
          )}
          <FavoriteHeart productId={product.id} isFavorited={isFavorited} onToggle={onToggleFavorite} />
        </div>
      </div>
    </div>
  </a>
);

export const MyLibraryPage: React.FC = () => {
  const [state, setState] = useState<ViewState>({ status: 'restoring' });
  const [profile, setProfile] = useState<IdTokenProfile | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // Desktop-only "More" dropdown, same pattern as the main site's Navbar.tsx -
  // groups Join Group Chat/Notebook/Typing Speed/Sign out under one button
  // so the header doesn't run out of room as more per-page actions get
  // added. Mobile keeps its own full hamburger sheet unchanged below.
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isMessengerDialogOpen, setIsMessengerDialogOpen] = useState(false);
  const [isNoPdfAccessDialogOpen, setIsNoPdfAccessDialogOpen] = useState(false);
  const [isProductivityDialogOpen, setIsProductivityDialogOpen] = useState(false);
  const [noPdfAccessMessage, setNoPdfAccessMessage] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORY);
  const [languageFilter, setLanguageFilter] = useState(ALL_LANGUAGES);
  const [levelFilter, setLevelFilter] = useState(ALL_LEVELS);
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [recentlyOpened, setRecentlyOpened] = useState<RecentlyOpenedEntry[]>([]);
  const [videoProductIds, setVideoProductIds] = useState<Set<string>>(new Set());
  const [productivitySubscription, setProductivitySubscription] = useState<ProductivitySubscriptionInfo | null>(null);
  const [premiumVideosByProduct, setPremiumVideosByProduct] = useState<Record<string, PremiumVideoSummary[]>>({});
  const [tutorialSearchQuery, setTutorialSearchQuery] = useState('');
  const [newVideos, setNewVideos] = useState<NewReleaseVideo[]>([]);
  const [newPdfReleases, setNewPdfReleases] = useState<NewReleasePdf[]>([]);
  const hasTriedCachedToken = useRef(false);

  // Prev/next scroll buttons for the category scroll-spy row, same pattern
  // as the main page's category tab bar (App.tsx) - only shown once the
  // tabs actually overflow this (much narrower, since it's one column of a
  // two-column layout) container's width.
  const categoryBarRef = useRef<HTMLDivElement>(null);
  const [categoryBarOverflows, setCategoryBarOverflows] = useState(false);

  useEffect(() => {
    const container = categoryBarRef.current;
    if (!container) return;

    const checkOverflow = () => {
      setCategoryBarOverflows(container.scrollWidth - container.clientWidth > 1);
    };

    checkOverflow();

    // Catches viewport/container resizing. Doesn't by itself catch the
    // category *list* changing length while the container's own box size
    // stays the same (its width comes from the flex layout, not its
    // content) - the second effect below (keyed on `categories`) covers that.
    const resizeObserver = new ResizeObserver(checkOverflow);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  const scrollCategoryBar = useCallback((direction: 'left' | 'right') => {
    if (categoryBarRef.current) {
      const scrollAmount = 200;
      categoryBarRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  }, []);

  // Public, cached 20 min (see premiumVideos.ts) - just enough to know which
  // owned products have any bonus videos at all, before spending a second,
  // buyer-gated request finding out their titles.
  useEffect(() => {
    fetchVideoProductIds().then(setVideoProductIds);
  }, []);

  // New Videos Uploaded / New PDF Releases - public, non-buyer-scoped
  // content (see newReleases.ts), fetched once on mount regardless of
  // sign-in state and cached client-side until the next 8:15 PM PHT.
  useEffect(() => {
    fetchNewVideos().then(setNewVideos);
    fetchNewPdfReleases().then(setNewPdfReleases);
  }, []);

  useGlobalScrollTilt();

  // Without this, the page underneath keeps scrolling while the menu sheet
  // is open (visually confusing on mobile especially, since the backdrop
  // makes it look like a modal that should block the page behind it).
  useEffect(() => {
    if (!isMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMenuOpen]);

  // One request in, one response with just the product ids the buyer owns -
  // no PDF URLs are fetched here. Opening an individual PDF still goes
  // through the existing /view/<id> gate, which re-verifies independently.
  // The response is cached briefly (see requestCache.ts), scoped to this
  // account's email, so reloading/revisiting shortly after doesn't re-hit
  // the function - this is just the owned-product list, never the actual
  // PDF access grant, so a short cache here doesn't weaken any real check.
  const fetchLibrary = useCallback(async (idToken: string) => {
    setState({ status: 'checking' });

    const email = getIdTokenEmail(idToken);
    const cacheKey = email ? `my-library:${email}` : null;
    const subscriptionCacheKey = email ? `my-library-productivity:${email}` : null;
    const cached = cacheKey ? getCachedResponse<string[]>(cacheKey) : null;

    if (cached) {
      setCachedIdToken(idToken);
      setProfile(getIdTokenProfile(idToken));
      setFavoriteIds(new Set(getFavoriteIds()));
      setRecentlyOpened(getRecentlyOpened());
      setProductivitySubscription(
        subscriptionCacheKey ? getCachedResponse<ProductivitySubscriptionInfo | null>(subscriptionCacheKey) ?? null : null
      );
      setState({ status: 'ready', productIds: cached });
      return;
    }

    try {
      const response = await fetch('/.netlify/functions/get-my-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
      });

      const data = await response.json();

      if (response.ok && data.authorized) {
        const productIds: string[] = data.productIds ?? [];
        const subscription: ProductivitySubscriptionInfo | null = data.productivitySubscription ?? null;
        if (cacheKey) setCachedResponse(cacheKey, productIds, LIBRARY_CACHE_TTL_MS);
        if (subscriptionCacheKey) setCachedResponse(subscriptionCacheKey, subscription, PRODUCTIVITY_SUBSCRIPTION_CACHE_TTL_MS);
        setCachedIdToken(idToken);
        setProfile(getIdTokenProfile(idToken));
        setFavoriteIds(new Set(getFavoriteIds()));
        setRecentlyOpened(getRecentlyOpened());
        setProductivitySubscription(subscription);
        setState({ status: 'ready', productIds });
      } else if (response.status === 429) {
        // Too many requests in a short window (our own rate limiter) -
        // not a real access denial, so don't sign the buyer out over it.
        setState({ status: 'rate-limited', idToken });
      } else if (response.status >= 500) {
        // A real server-side failure is not the same as an invalid sign-in -
        // silently dropping back to the sign-in screen here would leave the
        // buyer with zero explanation for why they got logged out.
        setState({ status: 'error', message: 'Something went wrong on our end. Please try again.', idToken });
      } else {
        clearCachedIdToken();
        setProfile(null);
        setState({ status: 'signed-out' });
      }
    } catch {
      setState({ status: 'error', message: 'Something went wrong. Please try again.', idToken });
    }
  }, []);

  useEffect(() => {
    if (hasTriedCachedToken.current) return;
    hasTriedCachedToken.current = true;

    const cachedToken = getCachedIdToken();
    if (cachedToken) {
      fetchLibrary(cachedToken);
    } else {
      setState({ status: 'signed-out' });
    }
  }, [fetchLibrary]);

  const handleSignOut = useCallback(() => {
    signOutOfGoogle();
    setProfile(null);
    setSearchQuery('');
    setActiveCategory(ALL_CATEGORY);
    setLanguageFilter(ALL_LANGUAGES);
    setLevelFilter(ALL_LEVELS);
    setState({ status: 'signed-out' });
  }, []);

  // Hover-to-open with a short close delay, plus click-outside/Escape -
  // identical behavior to Navbar.tsx's More dropdown.
  const openMoreMenu = useCallback(() => {
    if (moreMenuCloseTimeoutRef.current) {
      clearTimeout(moreMenuCloseTimeoutRef.current);
      moreMenuCloseTimeoutRef.current = null;
    }
    setIsMoreMenuOpen(true);
  }, []);

  const scheduleCloseMoreMenu = useCallback(() => {
    moreMenuCloseTimeoutRef.current = setTimeout(() => setIsMoreMenuOpen(false), 150);
  }, []);

  useEffect(() => {
    if (!isMoreMenuOpen) return;

    const handleClickOutsideMoreMenu = (event: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMoreMenuOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutsideMoreMenu);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutsideMoreMenu);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isMoreMenuOpen]);

  useEffect(() => {
    return () => {
      if (moreMenuCloseTimeoutRef.current) clearTimeout(moreMenuCloseTimeoutRef.current);
    };
  }, []);

  const handleToggleFavorite = useCallback((productId: string) => {
    setFavoriteIds(new Set(toggleFavorite(productId)));
  }, []);

  // Productivity feature grants (e.g. the Typing Speed) live in the
  // same productIds array as PDFs but aren't backed by an uploaded file -
  // excluded here so they never render as a "PDF" card or count toward the
  // PDF total; they get their own dedicated nav button instead (below).
  const ownedProducts = useMemo(() => {
    if (state.status !== 'ready') return [];
    return state.productIds
      .filter((id) => !isProductivityFeatureProductId(id))
      .map((id) => getProductById(id));
  }, [state]);

  const ownsProductivity = state.status === 'ready' && state.productIds.includes(PRODUCTIVITY_SUBSCRIPTION_PRODUCT_ID);

  // Shared gate for every Productivity-bundled feature's nav link (Typing
  // Speed Test, Notebook, and anything added later) - My Library already has
  // a fresh productIds list in state, so this just reuses `ownsProductivity`
  // instead of re-fetching like useProductivityFeatureLink does for Navbar's
  // standalone buttons.
  const navigateToProductivityFeature = useCallback(
    (path: string) => {
      if (ownsProductivity) {
        window.location.href = path;
      } else {
        setIsProductivityDialogOpen(true);
      }
    },
    [ownsProductivity]
  );

  const handleTypingSpeedClick = useCallback(() => {
    navigateToProductivityFeature('/typing-speed');
  }, [navigateToProductivityFeature]);

  const handleNotebookClick = useCallback(() => {
    navigateToProductivityFeature('/notebook');
  }, [navigateToProductivityFeature]);

  const ownedProductsById = useMemo(() => {
    const map = new Map<string, Product>();
    ownedProducts.forEach((product) => map.set(product.id, product));
    return map;
  }, [ownedProducts]);

  const openedAtById = useMemo(() => {
    const map = new Map<string, number>();
    recentlyOpened.forEach((entry) => {
      if (!map.has(entry.productId)) map.set(entry.productId, entry.openedAt);
    });
    return map;
  }, [recentlyOpened]);

  // Reading percentage lives in a separate store (saved by the PDF viewer
  // itself, keyed by product) - surfacing it here gives "Continue Reading"
  // and the library cards a real number instead of just a relative time.
  const readingPercentById = useMemo(() => {
    const map = new Map<string, number>();
    ownedProducts.forEach((product) => {
      const progress = getReadingProgress(product.id);
      if (progress && progress.pageCount > 0) {
        map.set(product.id, Math.round((progress.lastPage / progress.pageCount) * 100));
      }
    });
    return map;
  }, [ownedProducts]);

  const recentlyOpenedProducts = useMemo(
    () =>
      recentlyOpened
        .map((entry) => ownedProductsById.get(entry.productId))
        .filter((product): product is Product => Boolean(product)),
    [recentlyOpened, ownedProductsById]
  );

  // The single "Continue Reading" hero replaced the separate "Recently
  // Opened" shelf below it - showing the 3 most recent items here (newest
  // first, same ordering recentlyOpenedProducts already provides) covers
  // what that shelf used to do without a second, redundant section.
  const topRecentProducts = recentlyOpenedProducts.slice(0, 3);

  // Only fetches titles for products the buyer both owns AND that actually
  // have videos - never the full catalog. Each fetchProductVideos call
  // independently re-verifies ownership server-side (get-product-videos.ts),
  // same as if the buyer had opened each PDF's video panel directly.
  useEffect(() => {
    const idToken = getCachedIdToken();
    const productsWithVideos = ownedProducts.filter((product) => videoProductIds.has(product.id));
    if (!idToken || productsWithVideos.length === 0) {
      setPremiumVideosByProduct({});
      return;
    }

    let cancelled = false;
    Promise.all(
      productsWithVideos.map(async (product) => {
        const videos = await fetchProductVideos(idToken, product.id);
        return [product.id, videos] as const;
      })
    ).then((entries) => {
      if (!cancelled) setPremiumVideosByProduct(Object.fromEntries(entries));
    });

    return () => {
      cancelled = true;
    };
  }, [ownedProducts, videoProductIds]);

  // The Members Only Tutorials column's own search - filters by tutorial
  // title only (never touches the main library search/filters on the left,
  // they're deliberately independent per-column controls).
  const filteredTutorialsByProduct = useMemo(() => {
    const query = tutorialSearchQuery.trim().toLowerCase();
    if (!query) return premiumVideosByProduct;

    const filtered: Record<string, PremiumVideoSummary[]> = {};
    Object.entries(premiumVideosByProduct).forEach(([productId, videos]) => {
      const matches = videos.filter((video) => video.title.toLowerCase().includes(query));
      if (matches.length > 0) filtered[productId] = matches;
    });
    return filtered;
  }, [premiumVideosByProduct, tutorialSearchQuery]);

  const categories = useMemo(() => {
    const unique = Array.from(new Set(ownedProducts.map((product) => product.category)));
    return [ALL_CATEGORY, ...unique];
  }, [ownedProducts]);

  // Re-checks overflow when the category list itself changes length - the
  // ResizeObserver above only catches the container's own box resizing
  // (viewport changes), not its content growing/shrinking while the
  // container's width (set by the flex layout) stays the same.
  useEffect(() => {
    const container = categoryBarRef.current;
    if (!container) return;
    setCategoryBarOverflows(container.scrollWidth - container.clientWidth > 1);
  }, [categories]);

  const languages = useMemo(
    () => Array.from(new Set(ownedProducts.map((product) => product.language).filter(Boolean))) as string[],
    [ownedProducts]
  );

  const levels = useMemo(
    () => Array.from(new Set(ownedProducts.map((product) => product.level).filter(Boolean))) as string[],
    [ownedProducts]
  );

  const visibleProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const filtered = ownedProducts.filter((product) => {
      const matchesCategory = activeCategory === ALL_CATEGORY || product.category === activeCategory;
      const matchesLanguage = languageFilter === ALL_LANGUAGES || product.language === languageFilter;
      const matchesLevel = levelFilter === ALL_LEVELS || product.level === levelFilter;
      const matchesQuery = query === '' || product.title.toLowerCase().includes(query);
      return matchesCategory && matchesLanguage && matchesLevel && matchesQuery;
    });

    const compareBySort = (a: Product, b: Product) => {
      if (sortBy === 'title-asc') return a.title.localeCompare(b.title);
      if (sortBy === 'title-desc') return b.title.localeCompare(a.title);

      const aOpened = openedAtById.get(a.id) ?? 0;
      const bOpened = openedAtById.get(b.id) ?? 0;
      if (aOpened !== bOpened) return bOpened - aOpened;
      return a.title.localeCompare(b.title);
    };

    // Favorited PDFs are always pinned to the top of the list, rather than
    // living in a separate duplicated section - the chosen sort still
    // applies within the favorited group and the rest of the list.
    const sorted = [...filtered].sort((a, b) => {
      const aFavorite = favoriteIds.has(a.id);
      const bFavorite = favoriteIds.has(b.id);
      if (aFavorite !== bFavorite) return aFavorite ? -1 : 1;
      return compareBySort(a, b);
    });

    return sorted;
  }, [ownedProducts, activeCategory, languageFilter, levelFilter, searchQuery, sortBy, openedAtById, favoriteIds]);

  // FLIP animation for favorite-triggered reordering: cards jumping straight
  // to the front read as jarring, but re-animating an actual grid reflow
  // (height/grid-column changes) is expensive. Instead we let the reorder
  // happen instantly, then paper over it with a single cheap transform - on
  // the very next paint, each card is nudged back to its *previous* screen
  // position with transitions off, then released so it glides to its new
  // slot. Transform-only (no layout/paint cost) keeps this fine even on
  // low-spec devices, and cards with no position change (the common case
  // for any grid larger than one row) are skipped entirely.
  const libraryGridRef = useRef<HTMLDivElement>(null);
  const cardPositionsRef = useRef<Map<string, DOMRect>>(new Map());

  useLayoutEffect(() => {
    const grid = libraryGridRef.current;
    if (!grid) return;

    const cards = grid.querySelectorAll<HTMLElement>('[data-product-id]');
    const previousPositions = cardPositionsRef.current;
    const nextPositions = new Map<string, DOMRect>();

    cards.forEach((card) => {
      const id = card.dataset.productId;
      if (!id) return;
      const newRect = card.getBoundingClientRect();
      nextPositions.set(id, newRect);

      const prevRect = previousPositions.get(id);
      if (!prevRect) return;

      const deltaX = prevRect.left - newRect.left;
      const deltaY = prevRect.top - newRect.top;
      if (!deltaX && !deltaY) return;

      card.style.transition = 'none';
      card.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
      // Forces the browser to apply the transform above before the
      // transition is re-enabled next frame, otherwise it'd be batched
      // together with the reset and never actually animate.
      card.getBoundingClientRect();

      requestAnimationFrame(() => {
        card.style.transition = 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)';
        card.style.transform = '';
      });
    });

    cardPositionsRef.current = nextPositions;
  }, [visibleProducts]);

  if (state.status === 'ready') {
    return (
      <div className="min-h-screen font-sans selection:bg-surface-inverted selection:text-text-inverted relative">
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <div className="absolute top-[10%] left-[-10%] w-[50%] h-[50%] ambient-glow opacity-40"></div>
          <div className="absolute bottom-[20%] right-[-10%] w-[60%] h-[60%] ambient-glow opacity-30 rotate-180"></div>
        </div>

        {/* lg+ turns this into a fixed-viewport-height shell (header/main
            split the full 100vh between them, nothing here causes the page
            itself to scroll) so the two-column section below can flex to
            fill whatever's actually left, rather than sitting at a fixed px
            height that leaves a growing gap of empty space on taller
            screens. Below `lg` this stays plain block flow (unchanged) -
            the two columns stack full-width there anyway, where a rigid
            "fill the screen" shell would fight normal mobile scrolling
            instead of helping. */}
        <div className="relative z-10 lg:h-screen lg:flex lg:flex-col lg:overflow-hidden">
          <header className="sticky top-0 z-[60] bg-surface border-b border-border-hairline h-20 laptop:h-22 xl:h-24 transition-all shrink-0">
            <div className="max-w-[1600px] mx-auto px-4 lg:px-6 h-full flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                {profile?.picture ? (
                  <img
                    src={profile.picture}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="w-12 h-12 laptop:w-14 laptop:h-14 rounded-full border border-border-hairline shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 laptop:w-14 laptop:h-14 rounded-full bg-surface-secondary border border-border-hairline flex items-center justify-center shrink-0">
                    <LibraryBig size={22} className="text-text-primary" strokeWidth={1.5} />
                  </div>
                )}
                <div className="min-w-0">
                  <h1 className="text-base md:text-xl laptop:text-xl xl:text-2xl font-medium text-text-primary uppercase tracking-[0.2em] truncate">
                    {profile?.name ? `Welcome, ${profile.name}` : 'My Library'}
                  </h1>
                  <p className="f-small text-text-secondary truncate">
                    {ownedProducts.length} {ownedProducts.length === 1 ? 'PDF' : 'PDFs'} owned
                  </p>
                </div>
              </div>

              {/* Desktop nav - matches the home page Navbar's own mobile/desktop
                  split at the `lg` breakpoint, so tablet widths get the
                  hamburger menu instead of a cramped inline row. */}
              <div className="hidden lg:flex items-center gap-3 shrink-0">
                <a
                  href="/"
                  aria-label="Back to Doji's Library"
                  className="flex items-center justify-center w-11 h-11 laptop:w-12 laptop:h-12 shrink-0 rounded-sm border border-border-hairline text-text-primary hover:border-border-strong transition-colors"
                >
                  <ArrowLeft size={20} strokeWidth={1.5} />
                </a>

                <div
                  ref={moreMenuRef}
                  className="relative shrink-0"
                  onMouseEnter={openMoreMenu}
                  onMouseLeave={scheduleCloseMoreMenu}
                >
                  <button
                    type="button"
                    onClick={openMoreMenu}
                    aria-haspopup="true"
                    aria-expanded={isMoreMenuOpen}
                    aria-label="More"
                    className={`flex items-center gap-2 shrink-0 px-4 laptop:px-5 py-2.5 laptop:py-3 rounded-sm border text-sm laptop:text-base font-medium text-text-primary transition-colors ${
                      isMoreMenuOpen ? 'border-border-strong' : 'border-border-hairline hover:border-border-strong'
                    }`}
                  >
                    <LayoutGrid size={18} strokeWidth={1.5} />
                    More
                    <ChevronDown
                      size={16}
                      strokeWidth={1.5}
                      className={`transition-transform duration-200 ${isMoreMenuOpen ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {isMoreMenuOpen && (
                    <div
                      role="menu"
                      className="absolute top-full right-0 mt-2 w-64 bg-surface border border-border-hairline rounded-sm shadow-2xl z-[70] overflow-hidden"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setIsMoreMenuOpen(false);
                          if (ownedProducts.length > 0) {
                            setIsMessengerDialogOpen(true);
                          } else {
                            setNoPdfAccessMessage(undefined);
                            setIsNoPdfAccessDialogOpen(true);
                          }
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-surface-secondary transition-colors text-sm font-medium text-text-primary flex items-center gap-3 border-b border-border-hairline"
                      >
                        <MessageCircle size={18} strokeWidth={1.5} className="text-text-secondary shrink-0" />
                        Join Group Chat
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setIsMoreMenuOpen(false);
                          handleNotebookClick();
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-orange-500/10 transition-colors text-sm font-medium text-text-primary flex items-center gap-3 border-b border-border-hairline"
                      >
                        <NotebookPen size={18} strokeWidth={1.5} className="text-orange-500 shrink-0" />
                        Notebook
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setIsMoreMenuOpen(false);
                          handleTypingSpeedClick();
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-orange-500/10 transition-colors text-sm font-medium text-text-primary flex items-center gap-3 border-b border-border-hairline"
                      >
                        <Keyboard size={18} strokeWidth={1.5} className="text-orange-500 shrink-0" />
                        Typing Speed
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setIsMoreMenuOpen(false);
                          handleSignOut();
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-red-400/10 transition-colors text-sm font-medium text-red-400 flex items-center gap-3"
                      >
                        <LogOut size={18} strokeWidth={1.5} className="shrink-0" />
                        Sign out
                      </button>
                    </div>
                  )}
                </div>

                <ThemeToggle />
              </div>

              <div className="flex lg:hidden items-center gap-3">
                <ThemeToggle />
                <button
                  type="button"
                  onClick={() => setIsMenuOpen((prev) => !prev)}
                  aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
                  aria-expanded={isMenuOpen}
                  className={`flex items-center justify-center w-12 h-12 rounded border transition-all duration-300 active:scale-90 shrink-0 ${
                    isMenuOpen ? 'border-surface-inverted bg-surface-inverted text-text-inverted' : 'border-border-hairline bg-surface-secondary text-text-secondary'
                  }`}
                >
                  {isMenuOpen ? <X size={24} strokeWidth={1.5} /> : <Menu size={24} strokeWidth={1.5} />}
                </button>
              </div>
            </div>
          </header>

          {/* Full navigation panel, same pattern as the main site's hamburger
              menu (Navbar.tsx) - a full-width sheet that slides open below the
              header with a blurred backdrop. Hidden at `lg`+ - the desktop
              nav above covers the same links inline from that breakpoint up. */}
          <div
            className={`lg:hidden fixed left-0 right-0 top-20 z-50 overflow-hidden transition-all duration-500 ease-in-out bg-surface border-b border-border-hairline ${
              isMenuOpen ? 'max-h-96 opacity-100 shadow-lg' : 'max-h-0 opacity-0 pointer-events-none'
            }`}
          >
            {/* New items go above Sign out, never below it - Sign out stays
                the permanent last entry in this menu. */}
            <div className="max-w-5xl mx-auto px-4 py-4 flex flex-col gap-2">
              <a
                href="/"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3.5 rounded-sm border border-border-hairline text-text-primary font-medium hover:border-border-strong transition-colors"
              >
                <ArrowLeft size={20} strokeWidth={1.5} />
                Back to Doji's Library
              </a>
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  if (ownedProducts.length > 0) {
                    setIsMessengerDialogOpen(true);
                  } else {
                    setNoPdfAccessMessage(undefined);
                    setIsNoPdfAccessDialogOpen(true);
                  }
                }}
                className="flex items-center gap-3 px-4 py-3.5 rounded-sm border border-border-hairline text-text-primary font-medium hover:border-border-strong transition-colors"
              >
                <MessageCircle size={20} strokeWidth={1.5} />
                Join Messenger Group Chat
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  handleNotebookClick();
                }}
                className="flex items-center gap-3 px-4 py-3.5 rounded-sm border border-orange-500/30 text-text-primary font-medium hover:border-orange-500 transition-colors"
              >
                <NotebookPen size={20} strokeWidth={1.5} className="text-orange-500" />
                Notebook
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  handleTypingSpeedClick();
                }}
                className="flex items-center gap-3 px-4 py-3.5 rounded-sm border border-orange-500/30 text-text-primary font-medium hover:border-orange-500 transition-colors"
              >
                <Keyboard size={20} strokeWidth={1.5} className="text-orange-500" />
                Typing Speed
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  handleSignOut();
                }}
                className="flex items-center gap-3 px-4 py-3.5 rounded-sm border border-border-hairline text-red-400 font-medium hover:border-red-400/50 hover:bg-red-400/10 transition-colors"
              >
                <LogOut size={20} strokeWidth={1.5} />
                Sign out
              </button>
            </div>
          </div>

          {isMenuOpen && (
            <div
              className="lg:hidden fixed inset-0 z-40 bg-black/70 backdrop-blur-md"
              onClick={() => setIsMenuOpen(false)}
              role="presentation"
            />
          )}

          <MessengerJoinDialog open={isMessengerDialogOpen} onClose={() => setIsMessengerDialogOpen(false)} />
          <NoPdfAccessDialog
            open={isNoPdfAccessDialogOpen}
            onClose={() => setIsNoPdfAccessDialogOpen(false)}
            message={noPdfAccessMessage}
          />
          <ProductivitySubscribeDialog
            open={isProductivityDialogOpen}
            onClose={() => setIsProductivityDialogOpen(false)}
          />

          <main className="max-w-[1600px] mx-auto w-full px-4 lg:px-6 py-10 lg:py-6 lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
            {/* Notifications - currently just the Productivity subscription's
                7-day expiry warning (see PRODUCTIVITY_EXPIRY_WARNING_DAYS
                above and get-my-library.ts, which computes daysRemaining
                server-side from the admin-recorded subscription start date).
                My Library is the buyer's dashboard, so this is where any
                future account-level notice belongs too. */}
            {productivitySubscription && productivitySubscription.daysRemaining <= PRODUCTIVITY_EXPIRY_WARNING_DAYS && (
              <div className="mb-6 flex items-start gap-3 rounded-sm border border-orange-500/40 bg-orange-500/10 px-4 py-3.5 sm:px-5 sm:py-4">
                <Bell size={20} strokeWidth={1.5} className="text-orange-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm sm:text-base font-medium text-text-primary">
                    {productivitySubscription.daysRemaining === 0
                      ? 'Your Productivity subscription expires today.'
                      : productivitySubscription.daysRemaining === 1
                        ? 'Your Productivity subscription expires tomorrow.'
                        : `Your Productivity subscription expires in ${productivitySubscription.daysRemaining} days.`}
                  </p>
                  <p className="text-xs sm:text-sm text-text-secondary mt-1">
                    Renews on the same terms (₱59/month) - message us to renew and keep access to the Typing Speed
                    Test and other Productivity tools without interruption.
                  </p>
                </div>
              </div>
            )}

            {newVideos.length > 0 && (
              <section className="mb-6">
                <h2 className="f-small text-text-secondary mb-3">New Videos Uploaded</h2>
                <div className="flex gap-3 sm:gap-4 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
                  {newVideos.map((video) => (
                    <div
                      key={video.id}
                      className="flex-shrink-0 w-[260px] sm:w-[300px] bg-surface border border-border-hairline rounded-sm overflow-hidden card-elevated card-tilt flex flex-col"
                    >
                      <div className="relative aspect-video w-full overflow-hidden bg-surface-secondary">
                        <img
                          src={video.thumbnailUrl}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <PlayCircle size={40} className="text-white drop-shadow" strokeWidth={1.5} />
                        </div>
                      </div>
                      <div className="p-3.5 flex flex-col flex-grow">
                        <p className="text-sm font-medium text-text-primary line-clamp-1">{video.title}</p>
                        <p className="text-xs text-text-secondary mt-1 line-clamp-2 flex-grow">{video.description}</p>
                        <a
                          href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.youtubeId)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-orange-500 hover:text-orange-400 transition-colors"
                        >
                          Click Here to Watch <ChevronRight size={14} strokeWidth={2} />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {newPdfReleases.length > 0 && (
              <section className="mb-6">
                <h2 className="f-small text-text-secondary mb-3">New PDF Releases</h2>
                <div className="flex gap-3 sm:gap-4 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
                  {newPdfReleases.map((release) => (
                    <div
                      key={release.id}
                      className="flex-shrink-0 w-[260px] sm:w-[300px] bg-surface border border-border-hairline rounded-sm overflow-hidden card-elevated card-tilt flex flex-col"
                    >
                      <div className="relative aspect-video w-full overflow-hidden bg-surface-secondary">
                        <img
                          src={release.thumbnailUrl}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="p-3.5 flex flex-col flex-grow">
                        <p className="text-sm font-medium text-text-primary line-clamp-1">{release.title}</p>
                        <p className="text-xs text-text-secondary mt-1 line-clamp-2 flex-grow">{release.description}</p>
                        <a
                          href={`/?product=${encodeURIComponent(release.productId)}`}
                          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-orange-500 hover:text-orange-400 transition-colors"
                        >
                          Click Here to View <ChevronRight size={14} strokeWidth={2} />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {ownedProducts.length === 0 ? (
              <div className="text-center py-20 lg:py-0 lg:flex-1 lg:flex lg:flex-col lg:items-center lg:justify-center">
                <FileText size={44} className="mx-auto text-text-secondary mb-4" strokeWidth={1.5} />
                <p className="f-heading text-text-primary mb-2">You don't have any PDFs yet.</p>
                <p className="f-body text-text-secondary mb-6">
                  Once you purchase a note pack, it will show up here automatically.
                </p>
                <a href="/" className="f-body text-text-primary underline underline-offset-4">
                  Browse Doji's Library
                </a>
              </div>
            ) : (
              <>
                {topRecentProducts.length > 0 && (
                  <section className="mb-4 lg:mb-5">
                    <h2 className="f-small text-text-secondary mb-3">Recently Opened</h2>
                    {/* Fixed 3-column row (never a taller stacked list) -
                        topRecentProducts is already ordered most-recent-first
                        and capped at 3, so it drops directly into 3 equal
                        columns with the most recent on the left. Keeping this
                        section short is deliberate: it leaves enough
                        viewport height for All PDFs / Members Only Tutorials
                        below to still show a card or two without scrolling. */}
                    <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
                      {topRecentProducts.map((product) => (
                        <a
                          key={product.id}
                          href={`/view/${encodeURIComponent(product.id)}`}
                          className="group flex items-center gap-2 sm:gap-3 bg-surface border border-border-hairline rounded-sm p-2 sm:p-2.5 hover:border-border-strong transition-colors card-elevated min-w-0"
                        >
                          <div className="w-11 h-8 sm:w-16 sm:h-11 rounded-sm overflow-hidden shrink-0 bg-surface-secondary">
                            <img
                              src={product.thumbnail}
                              alt=""
                              className="w-full h-full object-cover"
                              loading="lazy"
                              decoding="async"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs sm:text-sm text-text-primary truncate">{product.title}</p>
                            <p className="hidden sm:block text-xs text-text-secondary truncate">
                              {formatRelativeDate(openedAtById.get(product.id) ?? Date.now())}
                            </p>
                          </div>
                        </a>
                      ))}
                    </div>
                  </section>
                )}

                {/* All PDFs (left) + Members Only Tutorials (right) - equal
                    fixed height, each managing its own vertical scroll
                    independently, so neither column's list length affects the
                    other's height or the page's overall height. */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-stretch lg:flex-1 lg:min-h-0">
                  <section className="flex flex-col h-[460px] sm:h-[560px] lg:h-full bg-surface border border-border-hairline rounded-sm overflow-hidden">
                    <div className="p-4 lg:p-5 pb-0 shrink-0">
                      <h2 className="f-small text-text-secondary mb-4">All PDFs</h2>

                      <div className="flex flex-col gap-3">
                        <div className="relative">
                          <Search
                            size={18}
                            strokeWidth={1.5}
                            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none"
                          />
                          <input
                            type="text"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder="Search your library..."
                            aria-label="Search your library"
                            className="w-full bg-surface border border-border-hairline rounded-sm pl-10 pr-9 py-2.5 f-body text-text-primary placeholder:text-text-secondary outline-none focus:border-border-strong transition-colors"
                          />
                          {searchQuery && (
                            <button
                              type="button"
                              onClick={() => setSearchQuery('')}
                              aria-label="Clear search"
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
                            >
                              <X size={17} strokeWidth={1.5} />
                            </button>
                          )}
                        </div>

                        <div className="flex gap-2 sm:gap-3">
                          <div className="relative flex-1 sm:flex-none">
                            <select
                              value={sortBy}
                              onChange={(event) => setSortBy(event.target.value as SortOption)}
                              aria-label="Sort by"
                              className="appearance-none w-full sm:w-auto min-w-0 bg-surface border border-border-hairline rounded-sm pl-4 pr-9 py-2.5 f-body text-text-primary outline-none focus:border-border-strong transition-colors"
                            >
                              <option value="recent">Recents</option>
                              <option value="title-asc">Title A–Z</option>
                              <option value="title-desc">Title Z–A</option>
                            </select>
                            <ChevronDown size={16} strokeWidth={1.5} className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
                          </div>

                          {languages.length > 1 && (
                            <div className="relative flex-1 sm:flex-none">
                              <select
                                value={languageFilter}
                                onChange={(event) => setLanguageFilter(event.target.value)}
                                aria-label="Filter by language"
                                className="appearance-none w-full sm:w-auto min-w-0 bg-surface border border-border-hairline rounded-sm pl-4 pr-9 py-2.5 f-body text-text-primary outline-none focus:border-border-strong transition-colors"
                              >
                                <option value={ALL_LANGUAGES}>Languages</option>
                                {languages.map((language) => (
                                  <option key={language} value={language}>
                                    {language === 'en' ? 'English' : 'Tagalog'}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown size={16} strokeWidth={1.5} className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
                            </div>
                          )}

                          {levels.length > 1 && (
                            <div className="relative flex-1 sm:flex-none">
                              <select
                                value={levelFilter}
                                onChange={(event) => setLevelFilter(event.target.value)}
                                aria-label="Filter by level"
                                className="appearance-none w-full sm:w-auto min-w-0 bg-surface border border-border-hairline rounded-sm pl-4 pr-9 py-2.5 f-body text-text-primary outline-none focus:border-border-strong transition-colors"
                              >
                                <option value={ALL_LEVELS}>Levels</option>
                                {levels.map((level) => (
                                  <option key={level} value={level}>
                                    {formatLevel(level)}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown size={16} strokeWidth={1.5} className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
                            </div>
                          )}
                        </div>

                        {categories.length > 2 && (
                          <div className="flex items-center gap-2 pb-4">
                            <div
                              ref={categoryBarRef}
                              className="flex items-center gap-2 overflow-x-auto no-scrollbar"
                            >
                              {categories.map((category) => (
                                <button
                                  key={category}
                                  type="button"
                                  onClick={() => setActiveCategory(category)}
                                  className={`shrink-0 px-4 py-2.5 rounded-sm f-small transition-all border ${
                                    activeCategory === category
                                      ? 'bg-surface-inverted border-surface-inverted text-text-inverted'
                                      : 'bg-transparent border-border-hairline text-text-secondary hover:text-text-primary hover:border-border-strong'
                                  }`}
                                >
                                  {category}
                                </button>
                              ))}
                            </div>

                            {categoryBarOverflows && (
                              <div className="flex items-center gap-1.5 shrink-0 pl-2">
                                <button
                                  type="button"
                                  onClick={() => scrollCategoryBar('left')}
                                  className="flex items-center justify-center w-8 h-8 rounded-sm bg-surface-secondary border border-border-hairline text-text-secondary hover:text-text-primary hover:border-border-strong transition-all active:scale-90"
                                  aria-label="Scroll categories left"
                                >
                                  <ChevronLeft size={16} strokeWidth={1.5} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => scrollCategoryBar('right')}
                                  className="flex items-center justify-center w-8 h-8 rounded-sm bg-surface-secondary border border-border-hairline text-text-secondary hover:text-text-primary hover:border-border-strong transition-all active:scale-90"
                                  aria-label="Scroll categories right"
                                >
                                  <ChevronRight size={16} strokeWidth={1.5} />
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto p-4 lg:p-5 pt-4 border-t border-border-hairline">
                      {visibleProducts.length === 0 ? (
                        <div className="text-center py-16">
                          <p className="text-text-secondary f-body">No PDFs match your search or filters.</p>
                        </div>
                      ) : (
                        <div ref={libraryGridRef} className="grid grid-cols-2 gap-4">
                          {visibleProducts.map((product) => (
                            <LibraryCard
                              key={product.id}
                              product={product}
                              isFavorited={favoriteIds.has(product.id)}
                              onToggleFavorite={handleToggleFavorite}
                              lastOpenedAt={openedAtById.get(product.id)}
                              readingPercent={readingPercentById.get(product.id)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="flex flex-col h-[460px] sm:h-[560px] lg:h-full bg-surface border border-border-hairline rounded-sm overflow-hidden">
                    <div className="p-4 lg:p-5 pb-4 shrink-0">
                      <h2 className="f-small text-text-secondary mb-4">Members Only Tutorials</h2>
                      <div className="relative">
                        <Search
                          size={18}
                          strokeWidth={1.5}
                          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none"
                        />
                        <input
                          type="text"
                          value={tutorialSearchQuery}
                          onChange={(event) => setTutorialSearchQuery(event.target.value)}
                          placeholder="Search tutorials..."
                          aria-label="Search members only tutorials"
                          className="w-full bg-surface border border-border-hairline rounded-sm pl-10 pr-9 py-2.5 f-body text-text-primary placeholder:text-text-secondary outline-none focus:border-border-strong transition-colors"
                        />
                        {tutorialSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setTutorialSearchQuery('')}
                            aria-label="Clear tutorial search"
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
                          >
                            <X size={17} strokeWidth={1.5} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto p-4 lg:p-5 pt-4 border-t border-border-hairline">
                      {Object.values(filteredTutorialsByProduct).every((videos) => videos.length === 0) ? (
                        <div className="text-center py-16">
                          <p className="text-text-secondary f-body">
                            {Object.values(premiumVideosByProduct).some((videos) => videos.length > 0)
                              ? 'No tutorials match your search.'
                              : 'No members only tutorials yet.'}
                          </p>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3">
                          {ownedProducts
                            .filter((product) => (filteredTutorialsByProduct[product.id]?.length ?? 0) > 0)
                            .map((product) => (
                              <div key={product.id} className="bg-surface-secondary border border-border-hairline rounded-sm p-4">
                                <a
                                  href={`/view/${encodeURIComponent(product.id)}`}
                                  className="text-sm font-medium text-text-primary hover:underline underline-offset-2"
                                >
                                  {product.title}
                                </a>
                                <ul className="mt-2.5 flex flex-col gap-2">
                                  {filteredTutorialsByProduct[product.id].map((video) => (
                                    <li key={video.id}>
                                      <a
                                        href={`/view/${encodeURIComponent(product.id)}`}
                                        className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
                                      >
                                        <PlayCircle size={14} strokeWidth={1.5} className="shrink-0" />
                                        <span className="truncate">{video.title}</span>
                                      </a>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              </>
            )}
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center font-sans relative px-6">
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[10%] left-[-10%] w-[50%] h-[50%] ambient-glow opacity-40"></div>
        <div className="absolute bottom-[20%] right-[-10%] w-[60%] h-[60%] ambient-glow opacity-30 rotate-180"></div>
      </div>

      <div className="absolute top-6 right-6 z-10">
        <ThemeToggle />
      </div>

      <div className="relative z-10 max-w-md w-full text-center">
        <LibraryBig size={44} className="mx-auto text-text-primary mb-5" strokeWidth={1.5} />
        <h1 className="f-heading text-text-primary mb-2">My Library</h1>
        <p className="text-text-secondary f-body mb-8">
          Sign in with the Gmail you used to purchase your notes to see everything you own.
        </p>

        {state.status === 'restoring' && (
          <div className="flex items-center justify-center gap-2 text-text-secondary f-body" aria-live="polite">
            <RefreshCw size={18} className="animate-spin" strokeWidth={1.5} />
            Checking your session…
          </div>
        )}

        {state.status === 'signed-out' && (
          <div className="flex justify-center">
            <GoogleSignInButton onSignIn={fetchLibrary} />
          </div>
        )}

        {state.status === 'checking' && (
          <div className="flex items-center justify-center gap-2 text-text-secondary f-body" aria-live="polite">
            <RefreshCw size={18} className="animate-spin" strokeWidth={1.5} />
            Loading your library…
          </div>
        )}

        {state.status === 'rate-limited' && (
          <div>
            <p className="text-red-400 font-medium f-body mb-4">
              Too many attempts in a short time. Please wait a moment and try again.
            </p>
            <button
              type="button"
              onClick={() => fetchLibrary(state.idToken)}
              className="inline-flex items-center gap-2 text-text-primary underline underline-offset-4 f-body"
            >
              <RefreshCw size={16} strokeWidth={1.5} />
              Try again
            </button>
          </div>
        )}

        {state.status === 'error' && (
          <div>
            <p className="text-red-400 font-medium f-body mb-4">{state.message}</p>
            <button
              type="button"
              onClick={() => fetchLibrary(state.idToken)}
              className="inline-flex items-center gap-2 text-text-primary underline underline-offset-4 f-body"
            >
              <RefreshCw size={16} strokeWidth={1.5} />
              Try again
            </button>
          </div>
        )}

        <a href="/" className="flex items-center justify-center gap-2 text-text-secondary underline underline-offset-4 mt-8 f-body">
          <ArrowLeft size={16} strokeWidth={1.5} />
          Back to Doji's Library
        </a>
      </div>
    </div>
  );
};
