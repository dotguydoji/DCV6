import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowLeftCircle,
  Clock,
  FileText,
  Heart,
  LibraryBig,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  X
} from 'lucide-react';
import { GoogleSignInButton } from './GoogleSignInButton';
import { getProductById } from '../constants';
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
import { getCachedResponse, setCachedResponse } from '../lib/requestCache';

const LIBRARY_CACHE_TTL_MS = 15 * 60 * 1000;

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

// Bare icon (no circular background), larger, bright red when active - same
// on every screen size, not just mobile.
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
      isFavorited ? 'text-red-500' : 'text-white hover:text-red-400'
    }`}
  >
    <Heart className="w-6 h-6" fill={isFavorited ? 'currentColor' : 'none'} />
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
  lastOpenedAt,
  readingPercent
}) => (
  <a
    href={`/view/${encodeURIComponent(product.id)}`}
    className="group relative flex flex-col bg-[#242829] border border-white/10 rounded-sm overflow-hidden transition-all duration-300 hover:bg-brand-yellow hover:border-brand-yellow hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(0,0,0,0.4)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-yellow"
  >
    <div className="relative aspect-[16/9] w-full overflow-hidden bg-black/20">
      <img
        src={product.thumbnail}
        alt=""
        className="w-full h-full object-cover"
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
      />
    </div>
    <div className="p-4">
      <h3 className="text-base sm:text-lg font-bold text-white truncate mb-1 transition-colors duration-300 group-hover:text-[#1a1d1e]">
        {product.title}
      </h3>
      <p className="text-sm text-brand-muted line-clamp-2 mb-2 transition-colors duration-300 group-hover:text-[#1a1d1e]/70">
        {product.description}
      </p>
      <div className="flex items-center gap-1.5 flex-wrap">
        {product.level && (
          <span className="text-xs font-bold uppercase tracking-wide text-brand-muted border border-white/10 rounded-sm px-2 py-0.5 transition-colors duration-300 group-hover:text-[#1a1d1e]/70 group-hover:border-[#1a1d1e]/20">
            {formatLevel(product.level)}
          </span>
        )}
        {product.language && (
          <span className="text-xs font-bold uppercase tracking-wide text-brand-muted border border-white/10 rounded-sm px-2 py-0.5 transition-colors duration-300 group-hover:text-[#1a1d1e]/70 group-hover:border-[#1a1d1e]/20">
            {product.language === 'en' ? 'English' : 'Tagalog'}
          </span>
        )}
      </div>
      {lastOpenedAt && (
        <p className="text-xs text-brand-muted mt-2 transition-colors duration-300 group-hover:text-[#1a1d1e]/70">
          {formatRelativeDate(lastOpenedAt)}
        </p>
      )}

      {/* Reading progress takes exactly the left half of the row, the
          favorite heart sits on the right half - same row, no overlap. */}
      <div className="flex items-center justify-between gap-3 mt-2">
        <div className="w-1/2 flex items-center gap-2">
          {typeof readingPercent === 'number' && (
            <>
              <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden transition-colors duration-300 group-hover:bg-[#1a1d1e]/10">
                <div
                  className="h-full bg-brand-yellow transition-colors duration-300 group-hover:bg-[#1a1d1e]"
                  style={{ width: `${readingPercent}%` }}
                />
              </div>
              <span className="text-xs font-bold text-brand-muted shrink-0 transition-colors duration-300 group-hover:text-[#1a1d1e]/70">
                {readingPercent}%
              </span>
            </>
          )}
        </div>
        <div className="w-1/2 flex justify-end">
          <FavoriteHeart productId={product.id} isFavorited={isFavorited} onToggle={onToggleFavorite} />
        </div>
      </div>
    </div>
  </a>
);

interface ShelfProps {
  title: string;
  products: Product[];
  favoriteIds: Set<string>;
  onToggleFavorite: (productId: string) => void;
  openedAtById: Map<string, number>;
  readingPercentById: Map<string, number>;
}

const Shelf: React.FC<ShelfProps> = ({
  title,
  products,
  favoriteIds,
  onToggleFavorite,
  openedAtById,
  readingPercentById
}) => {
  if (products.length === 0) return null;

  return (
    <section className="mb-8">
      <h2 className="text-base font-bold uppercase tracking-[0.15em] text-brand-muted mb-3">{title}</h2>
      <div className="flex gap-4 overflow-x-auto no-scrollbar pb-1">
        {products.map((product) => (
          <div key={product.id} className="w-[220px] shrink-0">
            <LibraryCard
              product={product}
              isFavorited={favoriteIds.has(product.id)}
              onToggleFavorite={onToggleFavorite}
              lastOpenedAt={openedAtById.get(product.id)}
              readingPercent={readingPercentById.get(product.id)}
            />
          </div>
        ))}
      </div>
    </section>
  );
};

export const MyLibraryPage: React.FC = () => {
  const [state, setState] = useState<ViewState>({ status: 'restoring' });
  const [profile, setProfile] = useState<IdTokenProfile | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORY);
  const [languageFilter, setLanguageFilter] = useState(ALL_LANGUAGES);
  const [levelFilter, setLevelFilter] = useState(ALL_LEVELS);
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [recentlyOpened, setRecentlyOpened] = useState<RecentlyOpenedEntry[]>([]);
  const hasTriedCachedToken = useRef(false);

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
    const cached = cacheKey ? getCachedResponse<string[]>(cacheKey) : null;

    if (cached) {
      setCachedIdToken(idToken);
      setProfile(getIdTokenProfile(idToken));
      setFavoriteIds(new Set(getFavoriteIds()));
      setRecentlyOpened(getRecentlyOpened());
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
        if (cacheKey) setCachedResponse(cacheKey, productIds, LIBRARY_CACHE_TTL_MS);
        setCachedIdToken(idToken);
        setProfile(getIdTokenProfile(idToken));
        setFavoriteIds(new Set(getFavoriteIds()));
        setRecentlyOpened(getRecentlyOpened());
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

  const handleToggleFavorite = useCallback((productId: string) => {
    setFavoriteIds(new Set(toggleFavorite(productId)));
  }, []);

  const ownedProducts = useMemo(() => {
    if (state.status !== 'ready') return [];
    return state.productIds.map((id) => getProductById(id));
  }, [state]);

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

  const continueReadingProduct = recentlyOpenedProducts[0];

  const categories = useMemo(() => {
    const unique = Array.from(new Set(ownedProducts.map((product) => product.category)));
    return [ALL_CATEGORY, ...unique];
  }, [ownedProducts]);

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

  if (state.status === 'ready') {
    return (
      <div className="min-h-screen bg-[#16181a] text-white">
        <header className="sticky top-0 z-50 h-24 flex items-center bg-[#1a1d1e] border-b border-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
          <div className="max-w-5xl w-full mx-auto flex items-center justify-between gap-4 px-6">
            <div className="flex items-center gap-4 min-w-0">
              {profile?.picture ? (
                <img
                  src={profile.picture}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 border-brand-yellow/60 shrink-0"
                />
              ) : (
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-brand-yellow/10 border-2 border-brand-yellow/40 flex items-center justify-center shrink-0">
                  <LibraryBig size={26} className="text-brand-yellow" />
                </div>
              )}
              <div className="min-w-0">
                <h1 className="text-xl sm:text-3xl font-bold truncate">
                  {profile?.name ? `Welcome back, ${profile.name}` : 'My Library'}
                </h1>
                <p className="text-brand-muted text-sm sm:text-base">
                  {ownedProducts.length} {ownedProducts.length === 1 ? 'PDF' : 'PDFs'} in your library
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isMenuOpen}
              className={`flex items-center justify-center w-12 h-12 rounded-lg border transition-all duration-300 active:scale-90 shrink-0 ${
                isMenuOpen
                  ? 'border-brand-yellow bg-brand-yellow/15 text-brand-yellow'
                  : 'border-white/10 text-brand-muted hover:border-brand-yellow/50 hover:text-brand-yellow'
              }`}
            >
              {isMenuOpen ? <X size={26} /> : <Menu size={26} />}
            </button>
          </div>
        </header>

        {/* Full navigation panel, same pattern as the main site's hamburger
            menu (Navbar.tsx) - a full-width sheet that slides open below the
            header with a blurred backdrop, not a small anchored dropdown.
            Built as a plain list so more items can be added later without
            restructuring anything. */}
        <div
          className={`fixed left-0 right-0 top-24 z-50 overflow-hidden transition-all duration-500 ease-in-out bg-[#1a1d1e] border-b border-white/10 ${
            isMenuOpen ? 'max-h-80 opacity-100 shadow-2xl' : 'max-h-0 opacity-0 pointer-events-none'
          }`}
        >
          <div className="max-w-5xl mx-auto px-6 py-4 flex flex-col gap-2">
            <a
              href="/"
              onClick={() => setIsMenuOpen(false)}
              className="flex items-center gap-3 px-4 py-3.5 rounded-sm border border-white/10 text-white font-bold hover:border-brand-yellow/50 hover:text-brand-yellow transition-colors"
            >
              <ArrowLeftCircle size={20} />
              Back to Doji's Library
            </a>
            <button
              type="button"
              onClick={() => {
                setIsMenuOpen(false);
                handleSignOut();
              }}
              className="flex items-center gap-3 px-4 py-3.5 rounded-sm border border-white/10 text-red-400 font-bold hover:border-red-400/50 hover:bg-red-400/10 transition-colors"
            >
              <LogOut size={20} />
              Sign out
            </button>
          </div>
        </div>

        {isMenuOpen && (
          <div
            className="fixed inset-0 z-40 bg-[#1a1d1e]/85 backdrop-blur-md animate-in fade-in duration-400"
            onClick={() => setIsMenuOpen(false)}
            role="presentation"
          />
        )}

        <div className="max-w-5xl mx-auto px-6 py-10">
          {ownedProducts.length === 0 ? (
            <div className="text-center py-20">
              <FileText size={44} className="mx-auto text-brand-muted mb-4" />
              <p className="text-xl font-bold mb-2">You don't have any PDFs yet.</p>
              <p className="text-brand-muted text-base mb-6">
                Once you purchase a note pack, it will show up here automatically.
              </p>
              <a href="/" className="text-brand-yellow underline text-base">
                Browse Doji's Library
              </a>
            </div>
          ) : (
            <>
              {continueReadingProduct && (
                <section className="mb-8">
                  <h2 className="text-base font-bold uppercase tracking-[0.15em] text-brand-muted mb-3">
                    Continue Reading
                  </h2>
                  <a
                    href={`/view/${encodeURIComponent(continueReadingProduct.id)}`}
                    className="group flex items-center gap-5 bg-[#242829] border border-white/10 rounded-sm p-4 hover:border-brand-yellow/60 transition-colors"
                  >
                    <div className="w-24 h-16 sm:w-32 sm:h-20 rounded-sm overflow-hidden shrink-0 bg-black/20">
                      <img
                        src={continueReadingProduct.thumbnail}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-base sm:text-lg font-bold truncate">{continueReadingProduct.title}</p>
                      <p className="text-sm text-brand-muted">
                        {formatRelativeDate(openedAtById.get(continueReadingProduct.id) ?? Date.now())}
                        {typeof readingPercentById.get(continueReadingProduct.id) === 'number' &&
                          ` · ${readingPercentById.get(continueReadingProduct.id)}% read`}
                      </p>
                    </div>
                    {/* Mobile: a bare clock icon signals "recently opened"
                        without needing room for a text label. Desktop has
                        space, so it shows the full "Continue Reading" text
                        instead, with no icon. */}
                    <Clock size={20} className="sm:hidden text-brand-yellow shrink-0" />
                    <span className="hidden sm:block text-base font-bold uppercase tracking-wide text-brand-yellow shrink-0">
                      Continue Reading
                    </span>
                  </a>
                </section>
              )}

              <Shelf
                title="Recently Opened"
                products={recentlyOpenedProducts.slice(1, 9)}
                favoriteIds={favoriteIds}
                onToggleFavorite={handleToggleFavorite}
                openedAtById={openedAtById}
                readingPercentById={readingPercentById}
              />

              <section>
                <h2 className="text-base font-bold uppercase tracking-[0.15em] text-brand-muted mb-3">All PDFs</h2>

                <div className="flex flex-col gap-3 mb-5">
                  <div className="relative">
                    <Search
                      size={18}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-muted pointer-events-none"
                    />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search your library..."
                      aria-label="Search your library"
                      className="w-full bg-[#242829] border border-white/10 rounded-sm pl-10 pr-9 py-2.5 text-base text-white placeholder:text-brand-muted outline-none focus:border-brand-yellow/60 transition-colors"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        aria-label="Clear search"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted hover:text-white"
                      >
                        <X size={17} />
                      </button>
                    )}
                  </div>

                  {/* On mobile these three sit in one compact row (equal
                      width via flex-1) instead of each stacking full-width -
                      on sm+ they revert to their original natural width
                      next to each other. */}
                  <div className="flex gap-2 sm:gap-3">
                    <select
                      value={sortBy}
                      onChange={(event) => setSortBy(event.target.value as SortOption)}
                      aria-label="Sort by"
                      className="flex-1 sm:flex-none min-w-0 bg-[#242829] border border-white/10 rounded-sm px-2 sm:px-3 py-2 sm:py-2.5 text-sm sm:text-base text-white outline-none focus:border-brand-yellow/60 transition-colors"
                    >
                      <option value="recent">Recently Opened</option>
                      <option value="title-asc">Title A–Z</option>
                      <option value="title-desc">Title Z–A</option>
                    </select>

                    {languages.length > 1 && (
                      <select
                        value={languageFilter}
                        onChange={(event) => setLanguageFilter(event.target.value)}
                        aria-label="Filter by language"
                        className="flex-1 sm:flex-none min-w-0 bg-[#242829] border border-white/10 rounded-sm px-2 sm:px-3 py-2 sm:py-2.5 text-sm sm:text-base text-white outline-none focus:border-brand-yellow/60 transition-colors"
                      >
                        <option value={ALL_LANGUAGES}>All Languages</option>
                        {languages.map((language) => (
                          <option key={language} value={language}>
                            {language === 'en' ? 'English' : 'Tagalog'}
                          </option>
                        ))}
                      </select>
                    )}

                    {levels.length > 1 && (
                      <select
                        value={levelFilter}
                        onChange={(event) => setLevelFilter(event.target.value)}
                        aria-label="Filter by level"
                        className="flex-1 sm:flex-none min-w-0 bg-[#242829] border border-white/10 rounded-sm px-2 sm:px-3 py-2 sm:py-2.5 text-sm sm:text-base text-white outline-none focus:border-brand-yellow/60 transition-colors"
                      >
                        <option value={ALL_LEVELS}>All Levels</option>
                        {levels.map((level) => (
                          <option key={level} value={level}>
                            {formatLevel(level)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {categories.length > 2 && (
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                      {categories.map((category) => (
                        <button
                          key={category}
                          type="button"
                          onClick={() => setActiveCategory(category)}
                          className={`shrink-0 px-3.5 py-2.5 rounded-sm text-sm font-bold uppercase tracking-wide transition-colors ${
                            activeCategory === category
                              ? 'bg-brand-yellow text-[#1a1d1e]'
                              : 'border border-white/10 text-brand-muted hover:text-white hover:border-white/20'
                          }`}
                        >
                          {category}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {visibleProducts.length === 0 ? (
                  <div className="text-center py-16">
                    <p className="text-brand-muted text-base">No PDFs match your search or filters.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
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
              </section>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#16181a] text-white px-6">
      <div className="max-w-md w-full text-center">
        <LibraryBig size={44} className="mx-auto text-brand-yellow mb-5" />
        <h1 className="text-3xl font-bold mb-2">My Library</h1>
        <p className="text-brand-muted text-base mb-8">
          Sign in with the Gmail you used to purchase your notes to see everything you own.
        </p>

        {state.status === 'restoring' && (
          <div className="flex items-center justify-center gap-2 text-brand-muted text-base" aria-live="polite">
            <RefreshCw size={18} className="animate-spin" />
            Checking your session…
          </div>
        )}

        {state.status === 'signed-out' && (
          <div className="flex justify-center">
            <GoogleSignInButton onSignIn={fetchLibrary} />
          </div>
        )}

        {state.status === 'checking' && (
          <div className="flex items-center justify-center gap-2 text-brand-muted text-base" aria-live="polite">
            <RefreshCw size={18} className="animate-spin" />
            Loading your library…
          </div>
        )}

        {state.status === 'rate-limited' && (
          <div>
            <p className="text-red-400 font-bold text-base mb-4">
              Too many attempts in a short time. Please wait a moment and try again.
            </p>
            <button
              type="button"
              onClick={() => fetchLibrary(state.idToken)}
              className="inline-flex items-center gap-2 text-brand-yellow underline text-base"
            >
              <RefreshCw size={16} />
              Try again
            </button>
          </div>
        )}

        {state.status === 'error' && (
          <div>
            <p className="text-red-400 font-bold text-base mb-4">{state.message}</p>
            <button
              type="button"
              onClick={() => fetchLibrary(state.idToken)}
              className="inline-flex items-center gap-2 text-brand-yellow underline text-base"
            >
              <RefreshCw size={16} />
              Try again
            </button>
          </div>
        )}

        <a href="/" className="flex items-center justify-center gap-2 text-brand-muted underline mt-8 text-base">
          <ArrowLeft size={16} />
          Back to Doji's Library
        </a>
      </div>
    </div>
  );
};
