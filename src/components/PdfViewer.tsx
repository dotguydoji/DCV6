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
  NotebookPen,
  PlayCircle,
  Search,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { Product } from '../types';
import { getCachedIdToken } from '../lib/googleIdentity';
import { fetchProductVideos, fetchVideoProductIds, PremiumVideoSummary } from '../lib/premiumVideos';
import { ThemeToggle } from './ThemeToggle';
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
import { PdfNotebookPanel } from './pdf-viewer/PdfNotebookPanel';
import { PdfVideoPanel } from './pdf-viewer/PdfVideoPanel';
import { createRefreshableRangeTransport, probeContentLength } from '../lib/pdfRangeTransport';
import { useIdleTimeout } from '../lib/useIdleTimeout';
import { IdleWarningModal } from './IdleWarningModal';

const REAL_PDF_WORKER_SRC = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

// The dedicated PDF worker runs in its own separate global scope (not the
// main thread), so src/polyfills.ts's Promise.withResolvers polyfill -
// installed on the *main thread's* Promise - never reaches it. On pre-17.4
// Safari, the worker's own internal use of Promise.withResolvers throws
// silently inside its own async message handlers rather than as a clean,
// bubbling top-level script error - the main thread never sees an 'error'
// event to recover from, it just never gets a response for whatever it
// asked the worker to do, hanging the loading percentage forever instead
// of crashing. Wrapping the real worker script in a tiny blob module that
// installs the same polyfill first, then dynamically imports the real
// script into that same worker global (so the patched Promise is the one
// the real code sees), fixes this without needing to fork/patch the
// vendored pdf.worker.min.mjs file itself. Same technique pdf.js's own
// PDFWorker._createCDNWrapper already uses for cross-origin worker URLs.
const WORKER_WRAPPER_SOURCE = `
if (typeof Promise.withResolvers !== 'function') {
  Promise.withResolvers = function () {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}
await import(${JSON.stringify(REAL_PDF_WORKER_SRC)});
`;

pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(
  new Blob([WORKER_WRAPPER_SOURCE], { type: 'text/javascript' })
);

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
// (Deliberately revised from 5 to 11 minutes - owner decision, 2026-07-13 -
// see the comment on SIGNED_URL_TTL_SECONDS in get-pdf.ts for the tradeoff.)
const SIGNED_URL_LIFETIME_MS = 11 * 60 * 1000;
// How long before the signed URL's real expiry to proactively fetch a
// fresh one - leaves a safety margin for the refresh call itself to
// complete before the old URL would actually stop working.
const REFRESH_BEFORE_EXPIRY_MS = 60 * 1000;
// Backoff between refresh attempts after a transient failure (rate limit,
// server hiccup, network blip) - short enough to recover well within the
// remaining margin above, not so short it hammers the function.
const REFRESH_RETRY_DELAY_MS = 30 * 1000;

// After this long with zero interaction (mouse/keyboard/touch/scroll
// anywhere on the page), warn the reader before pausing the proactive
// signed-URL refresh below - an open-but-truly-abandoned tab would
// otherwise keep calling get-pdf.ts (and reading Firestore) forever.
const IDLE_TIMEOUT_MS = 20 * 60 * 1000;
const IDLE_WARNING_DURATION_MS = 60 * 1000;

// PDF.js's own default is 64KB (2**16) per range request - for a typical
// text-plus-a-few-images study PDF page, that's often several separate
// requests just to render one page. Quadrupling it to 256KB cuts the
// request count roughly 4x for the same bytes, with disableAutoFetch above
// still preventing the opposite problem (grabbing the whole file at once
// for a PDF the buyer may only read a few pages of).
const RANGE_CHUNK_SIZE_BYTES = 256 * 1024;

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

  // The signed URL actually being used for byte-range fetches - starts as
  // the one handed down from PdfGatePage, but gets silently swapped out for
  // a fresh one before the old one expires (see the refresh effect below).
  // Deliberately a ref, not state: the whole point is that renewing it must
  // NEVER retrigger the document-loading effect below, which is what used
  // to tear down and rebuild the entire PDF.js viewer (visible loading
  // screen, reader dropped back to page 1) every ~4 minutes. A
  // PDFDataRangeTransport (see lib/pdfRangeTransport.ts) reads this ref on
  // every future byte-range fetch, so only *future* fetches ever see the
  // refreshed URL - already-rendered pages and the reader's exact scroll
  // position are completely untouched by a refresh.
  const currentUrlRef = useRef(fileUrl);
  const onRefreshUrlRef = useRef(onRefreshUrl);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeUrlIssuedAtRef = useRef(Date.now());
  // Lets the range transport (built once, in the document-loading effect
  // below) force an out-of-schedule refresh if a byte-range fetch fails -
  // e.g. the reader kept scrolling into unfetched pages right as the
  // proactive refresh below was about to fire. Assigned synchronously by
  // the effect right below this one, which - because effects run in
  // declaration order on mount - always runs before the document-loading
  // effect that reads it.
  const forceRefreshRef = useRef<() => Promise<void>>(async () => {});
  // Set by the idle-timeout hook below (via pauseRefreshRef/resumeRefreshRef)
  // - while true, the scheduled refresh below is a deliberate no-op instead
  // of calling onRefreshUrl. This never touches the document, viewer,
  // scroll position, or any saved data - it only stops the one thing that
  // would otherwise keep hitting the server on its own with nobody reading.
  const isIdlePausedRef = useRef(false);
  const pauseRefreshRef = useRef<() => void>(() => {});
  const resumeRefreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    onRefreshUrlRef.current = onRefreshUrl;
  }, [onRefreshUrl]);

  // Proactively fetches a fresh signed URL shortly before the current one
  // would expire, and swaps it into currentUrlRef - a plain ref mutation,
  // invisible to React and to the reader. A genuine denial (access was
  // actually revoked) surfaces a clear message instead of retrying forever;
  // anything transient (rate limit, network blip, server hiccup) just
  // retries shortly after instead of giving up. Runs once for the life of
  // this component instance (not keyed on the URL - there's no more React
  // state for it to react to).
  useEffect(() => {
    let cancelled = false;

    const msUntilRefresh = () =>
      Math.max(0, SIGNED_URL_LIFETIME_MS - REFRESH_BEFORE_EXPIRY_MS - (Date.now() - activeUrlIssuedAtRef.current));

    async function attemptRefresh(isForced = false) {
      // Idle-paused and this wasn't an explicit resume/on-demand call: skip
      // the request entirely rather than let a coincidentally-scheduled
      // timer fire while nobody's there. Resuming (see resumeRefreshRef
      // below) always passes isForced=true, which bypasses this guard and
      // restarts normal scheduling from that point.
      if (isIdlePausedRef.current && !isForced) return;

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
        currentUrlRef.current = result.url;
        activeUrlIssuedAtRef.current = Date.now();
        if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = setTimeout(() => attemptRefresh(), msUntilRefresh());
        return;
      }

      if (result.reason === 'denied') {
        setLoadError('Your access to this PDF is no longer available. Please go back to My Library.');
        return;
      }

      if (!isForced) {
        refreshTimeoutRef.current = setTimeout(() => attemptRefresh(), REFRESH_RETRY_DELAY_MS);
      }
    }

    forceRefreshRef.current = () => attemptRefresh(true);

    pauseRefreshRef.current = () => {
      isIdlePausedRef.current = true;
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
    resumeRefreshRef.current = () => {
      isIdlePausedRef.current = false;
      // Rather than guess how stale currentUrlRef.current got while paused,
      // just get a fresh one immediately and let normal proactive
      // scheduling resume from there.
      attemptRefresh(true);
    };

    refreshTimeoutRef.current = setTimeout(() => attemptRefresh(), msUntilRefresh());

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
  }, []);

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
  const [isNotebookPanelOpen, setIsNotebookPanelOpen] = useState(false);
  const [isVideoPanelOpen, setIsVideoPanelOpen] = useState(false);
  const [premiumVideos, setPremiumVideos] = useState<PremiumVideoSummary[]>([]);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
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

  // Membership check first (public, cached 20 min, one request covers every
  // product) so the vast majority of products with no bonus videos never
  // trigger the second, per-product/per-buyer titles request at all.
  useEffect(() => {
    let cancelled = false;

    fetchVideoProductIds().then((videoProductIds) => {
      if (cancelled || !videoProductIds.has(productId)) return;
      const idToken = getCachedIdToken();
      if (!idToken) return;
      fetchProductVideos(idToken, productId).then((videos) => {
        if (!cancelled) setPremiumVideos(videos);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [productId]);

  const viewportHeight = useVisualViewportHeight();

  const { isWarning: isIdleWarning, secondsRemaining: idleSecondsRemaining, stayActive } = useIdleTimeout({
    idleTimeoutMs: IDLE_TIMEOUT_MS,
    warningDurationMs: IDLE_WARNING_DURATION_MS,
    onPause: () => pauseRefreshRef.current(),
    onResume: () => resumeRefreshRef.current()
  });

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

    (async () => {
      const initialUrl = currentUrlRef.current;
      // A custom range transport needs the file's total byte length up
      // front - discovered via a single 1-byte Range probe rather than an
      // extra full request. If that probe can't determine it (should be
      // rare: Range support against this exact host is already required
      // for the per-page lazy loading below to work at all), loading still
      // works via the plain URL - it just means a future URL expiry can't
      // be papered over invisibly and would fall back to a full reload.
      const length = await probeContentLength(initialUrl);
      if (cancelled) return;

      // disableAutoFetch stops PDF.js from silently downloading the rest of
      // the file in the background after the first pages render - for large
      // (16-50MB) PDFs that background fetch competes for bandwidth with
      // whatever the buyer is actively trying to view. Range-request-based
      // per-page fetching (already supported by R2's CORS setup here) stays
      // fully enabled either way, so pages still load progressively as read.
      const loadingTask =
        length !== null
          ? pdfjsLib.getDocument({
              range: createRefreshableRangeTransport({
                length,
                getUrl: () => currentUrlRef.current,
                onRecoverableFailure: () => forceRefreshRef.current(),
                onFatalFailure: () => {
                  if (!cancelled) {
                    setLoadError('Your session needs a refresh. Please reload this page.');
                  }
                }
              }),
              disableAutoFetch: true,
              rangeChunkSize: RANGE_CHUNK_SIZE_BYTES
            })
          : pdfjsLib.getDocument({
              url: initialUrl,
              disableAutoFetch: true,
              rangeChunkSize: RANGE_CHUNK_SIZE_BYTES
            });

      if (cancelled) {
        loadingTask.destroy();
        return;
      }
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
            // exists.
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
    })();

    return () => {
      cancelled = true;
      loadingTaskRef.current?.destroy();
      loadingTaskRef.current = null;
      pdfViewerRef.current = null;
      findControllerRef.current = null;
      eventBusRef.current = null;
      pdfDocumentRef.current = null;
    };
    // Mount-only, deliberately: this used to depend on the signed URL and
    // rebuild the entire viewer on every refresh (the visible "restarts
    // every 5 minutes" bug) - the URL is now a ref the range transport
    // reads lazily, so there's nothing here that should ever retrigger this
    // effect for the life of this component instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Mobile-only: tapping anywhere outside the "more options" menu closes it.
  // Desktop keeps its existing behavior (toggle button / item selection only)
  // since a stray mouse click there is far less likely to be accidental.
  useEffect(() => {
    if (!isMoreMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (window.innerWidth >= 640) return;
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMoreMenuOpen]);

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
      // The old check only excluded <input>/<textarea> - the notebook's
      // editing surface is a contentEditable <div>, which isn't either, so
      // arrow keys/zoom keys used to reach the PDF's own page-nav/zoom
      // handling *at the same time* as the notebook's own editing (e.g.
      // moving the text cursor with arrow keys also flipped PDF pages).
      // isContentEditable is true for the div itself and everything inside
      // it. closest('[data-keyboard-scope]') catches every other isolated
      // panel (video panel buttons/selects, anything inside the notebook
      // panel that isn't part of the contentEditable itself, like its
      // toolbar) - each such panel owns its own keyboard handling and the
      // PDF viewer's global shortcuts must never fire while focus is
      // inside one.
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest('[data-keyboard-scope]')
      ) {
        return;
      }

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
      className={`flex flex-col bg-surface text-text-primary font-sans ${viewportHeight === null ? 'h-full' : ''}`}
      style={viewportHeight !== null ? { height: viewportHeight } : undefined}
    >
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-4 border-b border-border-hairline bg-surface">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={handleExit}
            aria-label="Back to My Library"
            className="flex items-center justify-center w-9 h-9 shrink-0 rounded-sm border border-border-hairline text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors"
          >
            <ArrowLeft size={18} strokeWidth={1.5} />
          </button>
          <h1 className="text-base sm:text-lg font-medium truncate text-text-primary">{title}</h1>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <ThemeToggle className="hidden sm:flex" />
          <button
            type="button"
            onClick={() => setIsThumbnailPanelOpen((prev) => !prev)}
            aria-label="Page thumbnails"
            className={`hidden sm:flex items-center justify-center w-10 h-10 rounded-sm border transition-colors ${
              isThumbnailPanelOpen
                ? 'border-border-strong text-text-primary'
                : 'border-border-hairline text-text-secondary hover:text-text-primary hover:border-border-strong'
            }`}
          >
            <LayoutGrid size={18} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={() => setIsSearchOpen((prev) => !prev)}
            aria-label="Search in document"
            className="flex items-center justify-center w-10 h-10 rounded-sm border border-border-hairline text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors"
          >
            <Search size={18} strokeWidth={1.5} />
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={handleToggleBookmark}
              aria-label={currentIsBookmarked ? 'Remove bookmark' : 'Add bookmark'}
              aria-pressed={currentIsBookmarked}
              className={`flex items-center justify-center w-10 h-10 rounded-sm border transition-colors ${
                currentIsBookmarked
                  ? 'border-border-strong text-text-primary'
                  : 'border-border-hairline text-text-secondary hover:text-text-primary hover:border-border-strong'
              }`}
            >
              <BookmarkIcon size={18} strokeWidth={1.5} fill={currentIsBookmarked ? 'currentColor' : 'none'} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setIsBookmarksPanelOpen((prev) => !prev)}
            aria-label="View bookmarks"
            className="hidden sm:flex items-center justify-center px-2 h-10 rounded-sm border border-border-hairline text-xs font-medium text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors"
          >
            {bookmarks.length}
          </button>
          <button
            type="button"
            onClick={() => setIsNotebookPanelOpen((prev) => !prev)}
            aria-label="Toggle notebook"
            className={`flex items-center justify-center w-10 h-10 rounded-sm border transition-colors ${
              isNotebookPanelOpen
                ? 'border-border-strong text-text-primary'
                : 'border-border-hairline text-text-secondary hover:text-text-primary hover:border-border-strong'
            }`}
          >
            <NotebookPen size={18} strokeWidth={1.5} />
          </button>
          {premiumVideos.length > 0 && (
            <button
              type="button"
              onClick={() => setIsVideoPanelOpen((prev) => !prev)}
              aria-label="Toggle members only tutorials"
              className={`flex items-center justify-center w-10 h-10 rounded-sm border transition-colors ${
                isVideoPanelOpen
                  ? 'border-border-strong text-text-primary'
                  : 'border-border-hairline text-text-secondary hover:text-text-primary hover:border-border-strong'
              }`}
            >
              <PlayCircle size={18} strokeWidth={1.5} />
            </button>
          )}
          <div className="relative" ref={moreMenuRef}>
            <button
              type="button"
              onClick={() => setIsMoreMenuOpen((prev) => !prev)}
              aria-label="More options"
              className={`flex items-center justify-center w-10 h-10 rounded-sm border transition-colors ${
                isMoreMenuOpen
                  ? 'border-border-strong text-text-primary'
                  : 'border-border-hairline text-text-secondary hover:text-text-primary hover:border-border-strong'
              }`}
            >
              <MoreVertical size={18} strokeWidth={1.5} />
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
        <div className="border-b border-border-hairline bg-surface-secondary px-4 sm:px-5 py-4 shrink-0">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => handleSearchInputChange(event.target.value)}
              placeholder="Search inside this PDF..."
              className="flex-1 bg-surface border border-border-hairline rounded-sm px-4 py-2.5 text-text-primary placeholder:text-text-secondary focus:border-border-strong outline-none"
            />
            <button
              type="button"
              onClick={() => dispatchFind(searchQuery, true, true)}
              aria-label="Previous match"
              disabled={!matchCount}
              className="flex items-center justify-center w-10 h-10 rounded-sm border border-border-hairline text-text-secondary hover:text-text-primary hover:border-border-strong disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft size={18} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={() => dispatchFind(searchQuery, true, false)}
              aria-label="Next match"
              disabled={!matchCount}
              className="flex items-center justify-center w-10 h-10 rounded-sm border border-border-hairline text-text-secondary hover:text-text-primary hover:border-border-strong disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronRight size={18} strokeWidth={1.5} />
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
              className="p-2.5 text-text-secondary hover:text-text-primary"
            >
              <X size={18} strokeWidth={1.5} />
            </button>
          </form>

          {searchQuery.trim() && (
            <p className="mt-2 text-sm text-text-secondary">
              {matchCount === null
                ? ''
                : matchCount === 0
                  ? 'No matches found.'
                  : `Match ${matchIndex} of ${matchCount}`}
            </p>
          )}
        </div>
      )}

      {/* flex-col on mobile stacks the notebook below the PDF (a proper
          split, not an overlay) instead of side-by-side - flex-row from
          `sm` up puts it back on the right as a side panel. The page-nav
          toolbar and footer notice now live inside the PDF column's own
          flex-col wrapper (below) rather than as siblings of this whole
          row - they used to sit outside it entirely, so they stretched
          across the full viewer width even when the video/notebook panels
          were open next to a narrower PDF column, instead of tracking just
          the PDF column's own width. */}
      <div className="flex-1 relative overflow-hidden flex flex-col sm:flex-row min-h-0">
        {isThumbnailPanelOpen && (
          <PdfThumbnailPanel
            pdfDocument={pdfDocumentRef.current}
            currentPage={pageNumber}
            onSelectPage={goToPage}
            onClose={() => setIsThumbnailPanelOpen(false)}
          />
        )}

        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          <div className="flex-1 relative overflow-hidden">
            {/* PDF.js's PDFViewer requires this exact container to be absolutely
                positioned - this wrapper just gives it a sized box to fill. */}
            <div
              ref={containerRef}
              className={`pdfViewerContainer absolute inset-0 overflow-auto bg-surface-secondary transition-[filter] duration-500 ${
                showLoadingOverlay ? 'blur-md pointer-events-none' : ''
              }`}
            >
              {isLoading && <p className="text-text-secondary text-center mt-20">Loading your PDF…</p>}
              {loadError && <p className="text-red-400 text-center mt-20">{loadError}</p>}
              <div ref={viewerRef} className="pdfViewer" />
            </div>

            {showLoadingOverlay && (
              <PdfLoadingOverlay percent={isLoading ? loadProgress : Math.max(loadProgress, 95)} />
            )}
          </div>

          <div className="flex items-center justify-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 border-t border-border-hairline bg-surface shrink-0">
            <button
              type="button"
              onClick={() => goToPage(pageNumber - 1)}
              disabled={pageNumber <= 1}
              aria-label="Previous page"
              className="flex items-center justify-center w-9 h-9 rounded-sm border border-border-hairline text-text-secondary hover:text-text-primary hover:border-border-strong disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft size={18} strokeWidth={1.5} />
            </button>

            <form onSubmit={handlePageInputSubmit} className="flex items-center gap-1.5 text-sm font-medium text-text-secondary">
              <span>Page</span>
              <input
                type="text"
                inputMode="numeric"
                value={pageInputValue}
                onChange={(event) => setPageInputValue(event.target.value.replace(/[^0-9]/g, ''))}
                onBlur={handlePageInputSubmit}
                aria-label="Jump to page"
                className="w-12 bg-surface-secondary border border-border-hairline rounded-sm px-1.5 py-1 text-center text-text-primary outline-none focus:border-border-strong"
              />
              <span>of {pageCount || '…'}</span>
              <span className="hidden sm:inline text-text-primary ml-1">· {readingPercent}%</span>
            </form>

            <button
              type="button"
              onClick={() => goToPage(pageNumber + 1)}
              disabled={pageNumber >= pageCount}
              aria-label="Next page"
              className="flex items-center justify-center w-9 h-9 rounded-sm border border-border-hairline text-text-secondary hover:text-text-primary hover:border-border-strong disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronRight size={18} strokeWidth={1.5} />
            </button>

            <div className="flex items-center gap-2 ml-2 pl-2 border-l border-border-hairline">
              <button
                type="button"
                onClick={handleZoomOut}
                aria-label="Zoom out"
                className="flex items-center justify-center w-9 h-9 rounded-sm border border-border-hairline text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors"
              >
                <ZoomOut size={16} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                onClick={handleZoomIn}
                aria-label="Zoom in"
                className="flex items-center justify-center w-9 h-9 rounded-sm border border-border-hairline text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors"
              >
                <ZoomIn size={16} strokeWidth={1.5} />
              </button>
              <ThemeToggle className="sm:hidden" />
            </div>
          </div>

          <div className="px-5 py-3 bg-surface-secondary border-t border-border-hairline text-center shrink-0">
            <p className="f-small text-text-secondary">
              For your personal use only, please do not share or redistribute.
            </p>
          </div>
        </div>

        {isVideoPanelOpen && (() => {
          const idToken = getCachedIdToken();
          return idToken ? (
            <PdfVideoPanel
              idToken={idToken}
              productId={productId}
              videos={premiumVideos}
              onClose={() => setIsVideoPanelOpen(false)}
            />
          ) : null;
        })()}

        {isNotebookPanelOpen && (
          <PdfNotebookPanel onClose={() => setIsNotebookPanelOpen(false)} />
        )}
      </div>

      {showBookInfo && (
        <PdfInfoModal title="Book Information" onClose={() => setShowBookInfo(false)}>
          <p className="text-text-primary font-medium mb-2">{product.title}</p>
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

      <IdleWarningModal open={isIdleWarning} secondsRemaining={idleSecondsRemaining} onStayActive={stayActive} />
    </div>
  );
};
