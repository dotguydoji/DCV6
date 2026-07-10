import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  EventBus,
  PDFFindController,
  PDFLinkService,
  PDFViewer,
  ScrollMode
} from 'pdfjs-dist/web/pdf_viewer.mjs';
import 'pdfjs-dist/web/pdf_viewer.css';
import {
  ArrowLeft,
  Bookmark as BookmarkIcon,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  MoreVertical,
  Search,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { Product } from '../types';
import { useVisualViewportHeight } from '../lib/useVisualViewportHeight';
import {
  addBookmark,
  Bookmark,
  getBookmarks,
  getReadingProgress,
  getViewerPrefs,
  isPageBookmarked,
  removeBookmark,
  saveReadingProgress,
  saveViewerPrefs
} from '../lib/pdfViewerPreferences';
import { PdfThumbnailPanel } from './pdf-viewer/PdfThumbnailPanel';
import { PdfBookmarksPanel } from './pdf-viewer/PdfBookmarksPanel';
import { PdfMoreMenu } from './pdf-viewer/PdfMoreMenu';
import { PdfInfoModal } from './pdf-viewer/PdfInfoModal';
import { PdfLoadingOverlay } from './pdf-viewer/PdfLoadingOverlay';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

// 'retry' covers anything transient (network hiccup, our own rate limit, a
// server error) - worth trying again shortly. 'denied' means the server
// explicitly said no (session gone, or access itself was revoked) - no
// point retrying that automatically.
export type RefreshUrlResult = { ok: true; url: string } | { ok: false; reason: 'retry' | 'denied' };

interface PdfViewerProps {
  fileUrl: string;
  product: Product;
  onRefreshUrl: () => Promise<RefreshUrlResult>;
}

const EXIT_PATH = '/my-library';

// Must match SIGNED_URL_TTL_SECONDS in netlify/functions/get-pdf.ts - if
// that value ever changes, update this to match, so the proactive refresh
// below still fires comfortably before the actual signed URL expires.
const SIGNED_URL_LIFETIME_MS = 5 * 60 * 1000;
// How long before the signed URL's real expiry to proactively fetch a
// fresh one - leaves a safety margin for the refresh call itself to
// complete before the old URL would actually stop working.
const REFRESH_BEFORE_EXPIRY_MS = 60 * 1000;
// Backoff between refresh attempts after a transient failure (rate limit,
// server hiccup, network blip) - short enough to recover well within the
// remaining margin above, not so short it hammers the function.
const REFRESH_RETRY_DELAY_MS = 30 * 1000;

// A browser tab that already had an old cached copy of a page (from before
// a Cache-Control fix was deployed, or just heuristic caching absent one)
// can keep treating that old copy as "fresh enough" and skip revalidating -
// which serves an index.html pointing at JS/CSS filenames that no longer
// exist after a newer deploy (net::ERR_ABORTED 404s). Appending a unique
// query string makes this a genuinely new URL to the browser's cache, so it
// can never reuse a stale entry here, regardless of any cache header history.
const getExitUrl = () => `${EXIT_PATH}?_=${Date.now()}`;

export const PdfViewer: React.FC<PdfViewerProps> = ({ fileUrl, product, onRefreshUrl }) => {
  const { title, id: productId } = product;

  // The signed URL actually being used to load/fetch the document - starts
  // as the one handed down from PdfGatePage, but gets silently swapped out
  // for a fresh one before the old one expires (see the refresh effect
  // below), instead of ever forcing the buyer back to My Library.
  const [activeUrl, setActiveUrl] = useState(fileUrl);
  const onRefreshUrlRef = useRef(onRefreshUrl);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeUrlIssuedAtRef = useRef(Date.now());

  useEffect(() => {
    onRefreshUrlRef.current = onRefreshUrl;
  }, [onRefreshUrl]);

  // Proactively fetches a fresh signed URL shortly before the current one
  // would expire, and swaps it in - which retriggers the document-loading
  // effect below with the new URL, restoring the exact page/rotation/scroll
  // mode automatically (that restore logic already exists for reopening a
  // PDF and doesn't need to change for this). A genuine denial (access was
  // actually revoked) surfaces a clear message instead of retrying forever;
  // anything transient (rate limit, network blip, server hiccup) just
  // retries shortly after instead of giving up.
  useEffect(() => {
    let cancelled = false;
    activeUrlIssuedAtRef.current = Date.now();

    async function attemptRefresh() {
      const result = await onRefreshUrlRef.current();
      if (cancelled) return;

      // Narrowed via `'url' in result` rather than `if (result.ok)` - the
      // two are equivalent given RefreshUrlResult's shape, but the local
      // toolchain's TS checker was observed failing to narrow the `ok`
      // discriminant once both union branches carry an extra field each
      // (reproduced even against a clean, separately-fetched TypeScript
      // install, so it's an environment quirk, not a real type error) -
      // this form checks out cleanly and is exactly as type-safe.
      if ('url' in result) {
        setActiveUrl(result.url);
        return;
      }

      if (result.reason === 'denied') {
        setLoadError('Your access to this PDF is no longer available. Please go back to My Library.');
        return;
      }

      refreshTimeoutRef.current = setTimeout(attemptRefresh, REFRESH_RETRY_DELAY_MS);
    }

    const msUntilRefresh = () =>
      Math.max(0, SIGNED_URL_LIFETIME_MS - REFRESH_BEFORE_EXPIRY_MS - (Date.now() - activeUrlIssuedAtRef.current));

    refreshTimeoutRef.current = setTimeout(attemptRefresh, msUntilRefresh());

    // Mobile browsers throttle/suspend timers on a backgrounded tab, so the
    // scheduled refresh above may never fire on time if the buyer switches
    // away and back - catching up the instant the tab is visible again
    // covers that case instead of leaving a dead URL in place until the
    // buyer happens to trigger a page fetch.
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (msUntilRefresh() > 0) return;

      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
      attemptRefresh();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeUrl]);

  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const pdfViewerRef = useRef<PDFViewer | null>(null);
  const findControllerRef = useRef<PDFFindController | null>(null);
  const eventBusRef = useRef<EventBus | null>(null);
  const loadingTaskRef = useRef<ReturnType<typeof pdfjsLib.getDocument> | null>(null);
  const pdfDocumentRef = useRef<PDFDocumentProxy | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [pageCount, setPageCount] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Drives the loading overlay only - has no bearing on how the PDF itself
  // loads/renders. loadProgress tracks real bytes fetched (PDF.js's own
  // onProgress callback); isFirstPageRendered flips once the first page has
  // actually painted, which is what the overlay waits for before revealing
  // the real viewer underneath.
  const [loadProgress, setLoadProgress] = useState(0);
  const [isFirstPageRendered, setIsFirstPageRendered] = useState(false);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [matchIndex, setMatchIndex] = useState<number | null>(null);

  // --- New reading-experience state (additive - none of this touches the
  // rendering/search engine setup below) ---
  const [pageInputValue, setPageInputValue] = useState('1');
  const [isThumbnailPanelOpen, setIsThumbnailPanelOpen] = useState(false);
  const [isBookmarksPanelOpen, setIsBookmarksPanelOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Rotation/scroll-mode persist per product (same as bookmarks/reading
  // progress) instead of always resetting to defaults on reopen.
  const [scrollMode, setScrollMode] = useState<'continuous' | 'single'>(
    () => getViewerPrefs(productId).scrollMode
  );
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(() => getViewerPrefs(productId).rotation);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => getBookmarks(productId));
  const [showBookInfo, setShowBookInfo] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const viewportHeight = useVisualViewportHeight();

  useEffect(() => {
    setPageInputValue(String(pageNumber));
  }, [pageNumber]);

  useEffect(() => {
    if (!containerRef.current || !viewerRef.current) return;

    const eventBus = new EventBus();
    eventBusRef.current = eventBus;
    const linkService = new PDFLinkService({ eventBus });
    const findController = new PDFFindController({ eventBus, linkService });
    findControllerRef.current = findController;

    const pdfViewer = new PDFViewer({
      container: containerRef.current,
      viewer: viewerRef.current,
      eventBus,
      linkService,
      findController,
      annotationMode: pdfjsLib.AnnotationMode.ENABLE,
      annotationEditorMode: pdfjsLib.AnnotationEditorType.DISABLE,
      // PDF.js reserves ~40px of horizontal space at page-width fit to make
      // room for a potential scrollbar/border - on narrow mobile screens
      // that reads as a visible side margin. This is PDF.js's own supported
      // option for that, applied only on mobile so desktop is untouched.
      removePageBorders: window.innerWidth < 640
    });
    linkService.setViewer(pdfViewer);
    pdfViewerRef.current = pdfViewer;

    eventBus.on('pagesinit', () => {
      // Fit to the container's actual width instead of a fixed zoom level,
      // so pages render sharp and readable on any screen size, including
      // mobile - PDF.js keeps this in sync automatically on resize too.
      // Guarded: on some mobile browsers the container can transiently
      // report a zero width right after a reload (address bar animating
      // in/out), which can throw here - fall back to a safe fixed scale
      // rather than letting that escape uncaught.
      try {
        pdfViewer.currentScaleValue = 'page-width';
      } catch {
        pdfViewer.currentScale = 1;
      }
    });
    eventBus.on('pagechanging', (evt: { pageNumber: number }) => {
      setPageNumber(evt.pageNumber);
    });
    eventBus.on(
      'updatefindmatchescount',
      (evt: { matchesCount: { total: number; current: number } }) => {
        setMatchCount(evt.matchesCount.total);
        setMatchIndex(evt.matchesCount.total > 0 ? evt.matchesCount.current : null);
      }
    );
    eventBus.on('updatefindcontrolstate', (evt: { matchesCount?: { total: number; current: number } }) => {
      if (evt.matchesCount) {
        setMatchCount(evt.matchesCount.total);
        setMatchIndex(evt.matchesCount.total > 0 ? evt.matchesCount.current : null);
      } else {
        setMatchCount(0);
        setMatchIndex(null);
      }
    });

    // Additive: persist reading progress (last page reached) whenever the
    // page changes - a second, independent listener for the same event,
    // so the existing pagechanging listener above is untouched.
    eventBus.on('pagechanging', (evt: { pageNumber: number }) => {
      if (pdfDocumentRef.current) {
        saveReadingProgress(productId, evt.pageNumber, pdfDocumentRef.current.numPages);
      }
    });

    // Additive: drives the loading overlay only - fires once the first
    // page has actually painted, which is the real "ready to look at"
    // signal (unlike the document promise resolving, which only means the
    // file's structure was parsed, not that anything has rendered yet).
    let firstPageRendered = false;
    eventBus.on('pagerendered', () => {
      if (firstPageRendered) return;
      firstPageRendered = true;
      setIsFirstPageRendered(true);
    });

    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    setLoadProgress(0);
    setIsFirstPageRendered(false);

    // disableAutoFetch stops PDF.js from silently downloading the rest of
    // the file in the background after the first pages render - for large
    // (16-50MB) PDFs that background fetch competes for bandwidth with
    // whatever the buyer is actively trying to view. Range-request-based
    // per-page fetching (already supported by R2's CORS setup here) stays
    // fully enabled either way, so pages still load progressively as read.
    const loadingTask = pdfjsLib.getDocument({ url: activeUrl, disableAutoFetch: true });
    loadingTaskRef.current = loadingTask;

    // Additive: purely feeds the loading overlay's percentage - has no
    // effect on how or what actually gets fetched.
    loadingTask.onProgress = (data: { loaded: number; total: number }) => {
      if (cancelled || !data.total) return;
      setLoadProgress(Math.min(100, Math.round((data.loaded / data.total) * 100)));
    };

    loadingTask.promise
      .then((pdfDocument) => {
        if (cancelled) return;
        pdfViewer.setDocument(pdfDocument);
        linkService.setDocument(pdfDocument, null);
        setPageCount(pdfDocument.numPages);
        setPageNumber(1);
        setIsLoading(false);

        // Additive: keep a reference for the thumbnail panel, and resume
        // from wherever the buyer last left off, if we have it saved.
        pdfDocumentRef.current = pdfDocument;
        const progress = getReadingProgress(productId);
        const savedPrefs = getViewerPrefs(productId);
        eventBus.on('pagesinit', () => {
          if (progress && progress.lastPage > 1 && progress.lastPage <= pdfDocument.numPages) {
            pdfViewer.currentPageNumber = progress.lastPage;
          }
          if (savedPrefs.rotation !== 0) {
            pdfViewer.pagesRotation = savedPrefs.rotation;
          }
          if (savedPrefs.scrollMode === 'single') {
            pdfViewer.scrollMode = ScrollMode.PAGE;
          }
          // Runs after the unconditional 'page-width' listener registered
          // above (same event, later registration = later call), so this
          // correctly overrides that default whenever a real saved value
          // exists - including on the silent mid-session refresh, which is
          // exactly what keeps a manually-chosen zoom level from resetting.
          try {
            pdfViewer.currentScaleValue = savedPrefs.scaleValue;
          } catch {
            // Malformed/stale stored value (e.g. from an older app version) -
            // harmless to ignore, the earlier listener already applied a
            // safe default.
          }
        });
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError('This PDF link has expired. Please go back and open it again.');
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      loadingTaskRef.current?.destroy();
      loadingTaskRef.current = null;
      pdfViewerRef.current = null;
      findControllerRef.current = null;
      eventBusRef.current = null;
      pdfDocumentRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUrl]);

  const goToPage = useCallback(
    (next: number) => {
      const clamped = Math.min(Math.max(next, 1), Math.max(pageCount, 1));
      if (pdfViewerRef.current) {
        pdfViewerRef.current.currentPageNumber = clamped;
      }
    },
    [pageCount]
  );

  const dispatchFind = useCallback((query: string, findAgain: boolean, findPrevious = false) => {
    eventBusRef.current?.dispatch('find', {
      source: findControllerRef.current,
      type: findAgain ? 'again' : '',
      query,
      caseSensitive: false,
      entireWord: false,
      highlightAll: true,
      findPrevious
    });
  }, []);

  const handleSearchSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      if (!searchQuery.trim()) return;
      dispatchFind(searchQuery, false);
    },
    [searchQuery, dispatchFind]
  );

  // Debounced so fast typing doesn't trigger a full-document search on
  // every single keystroke (real, avoidable jank on a large PDF) - the
  // search itself (dispatchFind) is completely unchanged, this only paces
  // how often it's called while live-typing.
  const handleSearchInputChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      if (!value.trim()) return;
      searchDebounceRef.current = setTimeout(() => dispatchFind(value, false), 250);
    },
    [dispatchFind]
  );

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, []);

  // --- New handlers (Tier 1 / Tier 2 features) ---

  const handlePageInputSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const next = parseInt(pageInputValue, 10);
      if (!Number.isNaN(next)) goToPage(next);
    },
    [pageInputValue, goToPage]
  );

  // Persists whatever PDF.js's zoom currently is, so it survives both a
  // silent mid-session refresh (see the refresh effect above) and actually
  // reopening the PDF later - keeps rotation/scrollMode untouched by always
  // reading their current state rather than guessing.
  const persistScaleValue = useCallback(
    (scaleValue: string) => {
      saveViewerPrefs(productId, { rotation, scrollMode, scaleValue });
    },
    [productId, rotation, scrollMode]
  );

  const handleFitWidth = useCallback(() => {
    if (pdfViewerRef.current) pdfViewerRef.current.currentScaleValue = 'page-width';
    persistScaleValue('page-width');
    setIsMoreMenuOpen(false);
  }, [persistScaleValue]);

  const handleFitPage = useCallback(() => {
    if (pdfViewerRef.current) pdfViewerRef.current.currentScaleValue = 'page-fit';
    persistScaleValue('page-fit');
    setIsMoreMenuOpen(false);
  }, [persistScaleValue]);

  const handleZoomIn = useCallback(() => {
    if (!pdfViewerRef.current) return;
    pdfViewerRef.current.increaseScale();
    persistScaleValue(String(pdfViewerRef.current.currentScale));
  }, [persistScaleValue]);

  const handleZoomOut = useCallback(() => {
    if (!pdfViewerRef.current) return;
    pdfViewerRef.current.decreaseScale();
    persistScaleValue(String(pdfViewerRef.current.currentScale));
  }, [persistScaleValue]);

  const handleRotate = useCallback(() => {
    if (pdfViewerRef.current) {
      const next = ((pdfViewerRef.current.pagesRotation + 90) % 360) as 0 | 90 | 180 | 270;
      pdfViewerRef.current.pagesRotation = next;
      setRotation(next);
      saveViewerPrefs(productId, {
        rotation: next,
        scrollMode,
        scaleValue: pdfViewerRef.current.currentScaleValue
      });
    }
    setIsMoreMenuOpen(false);
  }, [productId, scrollMode]);

  const handleToggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      rootRef.current?.requestFullscreen();
    }
    setIsMoreMenuOpen(false);
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const handleToggleScrollMode = useCallback(() => {
    if (!pdfViewerRef.current) return;
    const next = scrollMode === 'continuous' ? 'single' : 'continuous';
    pdfViewerRef.current.scrollMode = next === 'single' ? ScrollMode.PAGE : ScrollMode.VERTICAL;
    setScrollMode(next);
    saveViewerPrefs(productId, {
      rotation,
      scrollMode: next,
      scaleValue: pdfViewerRef.current.currentScaleValue
    });
    setIsMoreMenuOpen(false);
  }, [scrollMode, rotation, productId]);

  const handleToggleBookmark = useCallback(() => {
    if (isPageBookmarked(productId, pageNumber)) {
      const target = bookmarks.find((bookmark) => bookmark.page === pageNumber);
      if (target) setBookmarks(removeBookmark(productId, target.id));
    } else {
      setBookmarks(addBookmark(productId, pageNumber));
    }
  }, [productId, pageNumber, bookmarks]);

  const handleRemoveBookmark = useCallback(
    (id: string) => {
      setBookmarks(removeBookmark(productId, id));
    },
    [productId]
  );

  const handleExit = useCallback(() => {
    // Navigating away while still in fullscreen (e.g. after using the Full
    // Screen toggle) can leave the browser stuck mid-fullscreen-transition
    // across the page unload - a known way to end up with a black/blank
    // screen that a plain reload doesn't fix. Always exit fullscreen first
    // and let it settle before navigating.
    if (document.fullscreenElement) {
      // .catch() here (not just .finally()) so a browser refusing/failing
      // the exit request never surfaces as an unhandled promise rejection -
      // navigation still needs to happen either way.
      document
        .exitFullscreen()
        .catch(() => {})
        .finally(() => {
          window.location.href = getExitUrl();
        });
    } else {
      window.location.href = getExitUrl();
    }
  }, []);

  // Keyboard shortcuts (desktop) - additive, doesn't touch search/render logic
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (event.key === 'ArrowRight') goToPage(pageNumber + 1);
      else if (event.key === 'ArrowLeft') goToPage(pageNumber - 1);
      else if (event.key === '+' || event.key === '=') handleZoomIn();
      else if (event.key === '-') handleZoomOut();
      else if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
        event.preventDefault();
        setIsSearchOpen(true);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goToPage, pageNumber, handleZoomIn, handleZoomOut]);

  const currentIsBookmarked = isPageBookmarked(productId, pageNumber);
  const readingPercent = pageCount > 0 ? Math.round((pageNumber / pageCount) * 100) : 0;
  // Overlay stays up until the first page has actually painted - if loading
  // failed, the existing error message takes over instead (never gets stuck
  // behind the overlay forever).
  const showLoadingOverlay = !loadError && (isLoading || !isFirstPageRendered);

  return (
    <div
      ref={rootRef}
      className={`flex flex-col bg-[#1a1d1e] text-white ${viewportHeight === null ? 'h-full' : ''}`}
      style={viewportHeight !== null ? { height: viewportHeight } : undefined}
    >
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-4 border-b border-white/10 bg-[#1a1d1e]">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={handleExit}
            aria-label="Back to My Library"
            className="flex items-center justify-center w-9 h-9 shrink-0 rounded-sm border border-white/10 text-brand-gray hover:text-brand-yellow hover:border-brand-yellow transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-base sm:text-lg font-bold truncate">{title}</h1>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setIsThumbnailPanelOpen((prev) => !prev)}
            aria-label="Page thumbnails"
            className={`hidden sm:flex items-center justify-center w-10 h-10 rounded-sm border transition-colors ${
              isThumbnailPanelOpen
                ? 'border-brand-yellow text-brand-yellow'
                : 'border-white/10 text-brand-gray hover:text-brand-yellow hover:border-brand-yellow'
            }`}
          >
            <LayoutGrid size={18} />
          </button>
          <button
            type="button"
            onClick={() => setIsSearchOpen((prev) => !prev)}
            aria-label="Search in document"
            className="flex items-center justify-center w-10 h-10 rounded-sm border border-white/10 text-brand-gray hover:text-brand-yellow hover:border-brand-yellow transition-colors"
          >
            <Search size={18} />
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={handleToggleBookmark}
              aria-label={currentIsBookmarked ? 'Remove bookmark' : 'Add bookmark'}
              aria-pressed={currentIsBookmarked}
              className={`flex items-center justify-center w-10 h-10 rounded-sm border transition-colors ${
                currentIsBookmarked
                  ? 'border-brand-yellow text-brand-yellow'
                  : 'border-white/10 text-brand-gray hover:text-brand-yellow hover:border-brand-yellow'
              }`}
            >
              <BookmarkIcon size={18} fill={currentIsBookmarked ? 'currentColor' : 'none'} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setIsBookmarksPanelOpen((prev) => !prev)}
            aria-label="View bookmarks"
            className="hidden sm:flex items-center justify-center px-2 h-10 rounded-sm border border-white/10 text-xs font-bold text-brand-gray hover:text-brand-yellow hover:border-brand-yellow transition-colors"
          >
            {bookmarks.length}
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsMoreMenuOpen((prev) => !prev)}
              aria-label="More options"
              className={`flex items-center justify-center w-10 h-10 rounded-sm border transition-colors ${
                isMoreMenuOpen
                  ? 'border-brand-yellow text-brand-yellow'
                  : 'border-white/10 text-brand-gray hover:text-brand-yellow hover:border-brand-yellow'
              }`}
            >
              <MoreVertical size={18} />
            </button>
            {isMoreMenuOpen && (
              <PdfMoreMenu
                scrollMode={scrollMode}
                isFullscreen={isFullscreen}
                onFitWidth={handleFitWidth}
                onFitPage={handleFitPage}
                onRotate={handleRotate}
                onToggleFullscreen={handleToggleFullscreen}
                onToggleScrollMode={handleToggleScrollMode}
                onShowBookInfo={() => {
                  setShowBookInfo(true);
                  setIsMoreMenuOpen(false);
                }}
                onReportProblem={() => {
                  window.open(product.desktopUrl, '_blank', 'noopener,noreferrer');
                  setIsMoreMenuOpen(false);
                }}
                onShowShortcuts={() => {
                  setShowShortcuts(true);
                  setIsMoreMenuOpen(false);
                }}
                onExit={handleExit}
              />
            )}
            {isBookmarksPanelOpen && (
              <PdfBookmarksPanel
                bookmarks={bookmarks}
                onSelectPage={(page) => {
                  goToPage(page);
                  setIsBookmarksPanelOpen(false);
                }}
                onRemove={handleRemoveBookmark}
                onClose={() => setIsBookmarksPanelOpen(false)}
              />
            )}
          </div>
        </div>
      </div>

      {isSearchOpen && (
        <div className="border-b border-white/10 bg-[#242829] px-4 sm:px-5 py-4 shrink-0">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => handleSearchInputChange(event.target.value)}
              placeholder="Search inside this PDF..."
              className="flex-1 bg-[#1a1d1e] border border-white/10 rounded-sm px-4 py-2.5 text-white placeholder:text-brand-muted focus:border-brand-yellow outline-none"
            />
            <button
              type="button"
              onClick={() => dispatchFind(searchQuery, true, true)}
              aria-label="Previous match"
              disabled={!matchCount}
              className="flex items-center justify-center w-10 h-10 rounded-sm border border-white/10 text-brand-gray hover:text-brand-yellow hover:border-brand-yellow disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => dispatchFind(searchQuery, true, false)}
              aria-label="Next match"
              disabled={!matchCount}
              className="flex items-center justify-center w-10 h-10 rounded-sm border border-white/10 text-brand-gray hover:text-brand-yellow hover:border-brand-yellow disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronRight size={18} />
            </button>
            <button
              type="button"
              onClick={() => {
                if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
                setIsSearchOpen(false);
                setSearchQuery('');
                setMatchCount(null);
                setMatchIndex(null);
                dispatchFind('', false);
              }}
              aria-label="Close search"
              className="p-2.5 text-brand-gray hover:text-white"
            >
              <X size={18} />
            </button>
          </form>

          {searchQuery.trim() && (
            <p className="mt-2 text-sm text-brand-muted">
              {matchCount === null
                ? ''
                : matchCount === 0
                  ? 'No matches found.'
                  : `Match ${matchIndex} of ${matchCount}`}
            </p>
          )}
        </div>
      )}

      <div className="flex-1 relative overflow-hidden flex min-h-0">
        {isThumbnailPanelOpen && (
          <PdfThumbnailPanel
            pdfDocument={pdfDocumentRef.current}
            currentPage={pageNumber}
            onSelectPage={goToPage}
            onClose={() => setIsThumbnailPanelOpen(false)}
          />
        )}

        <div className="flex-1 relative overflow-hidden">
          {/* PDF.js's PDFViewer requires this exact container to be absolutely
              positioned - this wrapper just gives it a sized box to fill. */}
          <div
            ref={containerRef}
            className={`pdfViewerContainer absolute inset-0 overflow-auto bg-[#1a1d1e] transition-[filter] duration-500 ${
              showLoadingOverlay ? 'blur-md pointer-events-none' : ''
            }`}
          >
            {isLoading && <p className="text-brand-muted text-center mt-20">Loading your PDF…</p>}
            {loadError && <p className="text-red-400 text-center mt-20">{loadError}</p>}
            <div ref={viewerRef} className="pdfViewer" />
          </div>

          {showLoadingOverlay && (
            <PdfLoadingOverlay percent={isLoading ? loadProgress : Math.max(loadProgress, 95)} />
          )}
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 border-t border-white/10 bg-[#1a1d1e] shrink-0">
        <button
          type="button"
          onClick={() => goToPage(pageNumber - 1)}
          disabled={pageNumber <= 1}
          aria-label="Previous page"
          className="flex items-center justify-center w-9 h-9 rounded-sm border border-white/10 text-brand-gray hover:text-brand-yellow hover:border-brand-yellow disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <ChevronLeft size={18} />
        </button>

        <form onSubmit={handlePageInputSubmit} className="flex items-center gap-1.5 text-sm font-bold text-brand-muted">
          <span>Page</span>
          <input
            type="text"
            inputMode="numeric"
            value={pageInputValue}
            onChange={(event) => setPageInputValue(event.target.value.replace(/[^0-9]/g, ''))}
            onBlur={handlePageInputSubmit}
            aria-label="Jump to page"
            className="w-12 bg-[#242829] border border-white/10 rounded-sm px-1.5 py-1 text-center text-white outline-none focus:border-brand-yellow"
          />
          <span>of {pageCount || '…'}</span>
          <span className="hidden sm:inline text-brand-yellow ml-1">· {readingPercent}%</span>
        </form>

        <button
          type="button"
          onClick={() => goToPage(pageNumber + 1)}
          disabled={pageNumber >= pageCount}
          aria-label="Next page"
          className="flex items-center justify-center w-9 h-9 rounded-sm border border-white/10 text-brand-gray hover:text-brand-yellow hover:border-brand-yellow disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <ChevronRight size={18} />
        </button>

        <div className="flex items-center gap-2 ml-2 pl-2 border-l border-white/10">
          <button
            type="button"
            onClick={handleZoomOut}
            aria-label="Zoom out"
            className="flex items-center justify-center w-9 h-9 rounded-sm border border-white/10 text-brand-gray hover:text-brand-yellow hover:border-brand-yellow transition-colors"
          >
            <ZoomOut size={16} />
          </button>
          <button
            type="button"
            onClick={handleZoomIn}
            aria-label="Zoom in"
            className="flex items-center justify-center w-9 h-9 rounded-sm border border-white/10 text-brand-gray hover:text-brand-yellow hover:border-brand-yellow transition-colors"
          >
            <ZoomIn size={16} />
          </button>
        </div>
      </div>

      <div className="px-5 py-3 bg-brand-yellow/10 border-t border-brand-yellow/20 text-center shrink-0">
        <p className="text-xs text-brand-yellow font-bold uppercase tracking-[0.2em]">
          For your personal use only, please do not share or redistribute.
        </p>
      </div>

      {showBookInfo && (
        <PdfInfoModal title="Book Information" onClose={() => setShowBookInfo(false)}>
          <p className="text-white font-bold mb-2">{product.title}</p>
          <p className="mb-3">{product.description}</p>
          <p>Category: {product.category}</p>
          {product.level && <p>Level: {product.level}</p>}
          {product.language && <p>Language: {product.language === 'en' ? 'English' : 'Tagalog'}</p>}
          <p className="mt-2">Pages: {pageCount}</p>
        </PdfInfoModal>
      )}

      {showShortcuts && (
        <PdfInfoModal title="Keyboard Shortcuts" onClose={() => setShowShortcuts(false)}>
          <ul className="space-y-2">
            <li>← / → — Previous / Next page</li>
            <li>+ / - — Zoom in / out</li>
            <li>Ctrl/Cmd + F — Search in document</li>
          </ul>
        </PdfInfoModal>
      )}
    </div>
  );
};
