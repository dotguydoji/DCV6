import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Loader2, PlayCircle, X } from 'lucide-react';
import { fetchVideoEmbed, PremiumVideoSummary } from '../../lib/premiumVideos';

interface PdfVideoPanelProps {
  idToken: string;
  productId: string;
  videos: PremiumVideoSummary[];
  onClose: () => void;
}

const WIDTH_STORAGE_KEY = 'dcv6-video-panel-width';
const MIN_WIDTH = 320;
const DEFAULT_WIDTH = 420;
const DESKTOP_MEDIA_QUERY = '(min-width: 640px)';
// Not a preference cap - the reader decides how wide the video panel gets.
// This only keeps the PDF itself from being crushed to nothing, same
// reasoning as PdfNotebookPanel's identical constant.
const MIN_PDF_SPACE_PX = 240;

const clampWidth = (width: number) => {
  const viewportCap = typeof window !== 'undefined' ? window.innerWidth - MIN_PDF_SPACE_PX : width;
  return Math.min(Math.max(width, MIN_WIDTH), Math.max(MIN_WIDTH, viewportCap));
};

const getStoredWidth = (): number => {
  try {
    const raw = localStorage.getItem(WIDTH_STORAGE_KEY);
    const parsed = raw ? parseInt(raw, 10) : DEFAULT_WIDTH;
    return clampWidth(Number.isFinite(parsed) ? parsed : DEFAULT_WIDTH);
  } catch {
    return DEFAULT_WIDTH;
  }
};

const setStoredWidth = (width: number): void => {
  try {
    localStorage.setItem(WIDTH_STORAGE_KEY, String(Math.round(width)));
  } catch {
    // Ignored on purpose - just means the width resets to default next time.
  }
};

const buildEmbedSrc = (youtubeId: string) =>
  `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeId)}?rel=0&modestbranding=1`;

const buildWatchUrl = (youtubeId: string) => `https://www.youtube.com/watch?v=${encodeURIComponent(youtubeId)}`;

/**
 * Lets a buyer watch the premium unlisted videos tied to this PDF without
 * leaving the viewer. Desktop only gets an inline player, resizable exactly
 * like PdfNotebookPanel (own drag handle, own localStorage width) so it can
 * sit alongside the notebook panel and the PDF as three independently
 * adjustable panes. Mobile deliberately gets no inline player at all - just
 * a plain modal listing titles with an "open on YouTube" link per goal
 * (screen real estate on a phone is too tight for a 3-way split, and this
 * keeps the existing mobile reading layout completely untouched).
 *
 * The actual youtubeId is only ever fetched (via fetchVideoEmbed) the
 * moment a title is clicked - never held for the whole list - matching the
 * server's own "titles now, id only on demand" boundary in
 * get-product-videos.ts / get-video-embed.ts.
 */
export const PdfVideoPanel: React.FC<PdfVideoPanelProps> = ({ idToken, productId, videos, onClose }) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(DESKTOP_MEDIA_QUERY).matches
  );
  const [width, setWidth] = useState(getStoredWidth);
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<{ start: number; startWidth: number } | null>(null);

  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [embedYoutubeId, setEmbedYoutubeId] = useState<string | null>(null);
  const [isEmbedLoading, setIsEmbedLoading] = useState(false);
  const [embedError, setEmbedError] = useState<string | null>(null);

  // Mobile has no inline player - tapping a title fetches just that one
  // video's watch link on demand (same ownership-gated get-video-embed call
  // as the desktop embed) rather than resolving every title's link eagerly.
  const [resolvingVideoId, setResolvingVideoId] = useState<string | null>(null);
  const [resolvedWatchUrls, setResolvedWatchUrls] = useState<Record<string, string>>({});

  const resolveWatchUrl = useCallback(
    async (video: PremiumVideoSummary) => {
      setResolvingVideoId(video.id);
      const embed = await fetchVideoEmbed(idToken, productId, video.id);
      setResolvingVideoId(null);
      if (embed) {
        setResolvedWatchUrls((prev) => ({ ...prev, [video.id]: buildWatchUrl(embed.youtubeId) }));
      }
    },
    [idToken, productId]
  );

  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const handleChange = () => setIsDesktop(mql.matches);
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const drag = dragStateRef.current;
    const wrapper = wrapperRef.current;
    if (!drag || !wrapper) return;
    const delta = drag.start - e.clientX;
    wrapper.style.width = `${clampWidth(drag.startWidth + delta)}px`;
  }, []);

  const handlePointerUp = useCallback(() => {
    if (!dragStateRef.current) return;
    dragStateRef.current = null;
    setIsDragging(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', handlePointerUp);

    const wrapper = wrapperRef.current;
    if (wrapper) {
      const finalWidth = Math.round(clampWidth(wrapper.getBoundingClientRect().width));
      setWidth(finalWidth);
      setStoredWidth(finalWidth);
    }
  }, [handlePointerMove]);

  const handleDragStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragStateRef.current = { start: e.clientX, startWidth: width };
      setIsDragging(true);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
    },
    [width, handlePointerMove, handlePointerUp]
  );

  useEffect(() => {
    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [handlePointerMove, handlePointerUp]);

  const openVideo = useCallback(
    async (video: PremiumVideoSummary) => {
      setSelectedVideoId(video.id);
      setEmbedYoutubeId(null);
      setEmbedError(null);
      setIsEmbedLoading(true);

      const embed = await fetchVideoEmbed(idToken, productId, video.id);
      setIsEmbedLoading(false);

      if (!embed) {
        setEmbedError("Couldn't load this video. It may have been removed.");
        return;
      }
      setEmbedYoutubeId(embed.youtubeId);
    },
    [idToken, productId]
  );

  const videoList = (
    <ul className="divide-y divide-border-hairline">
      {videos.map((video) => (
        <li key={video.id}>
          <button
            type="button"
            onClick={() => openVideo(video)}
            className={`w-full flex items-center gap-2.5 text-left px-3 py-3 text-sm transition-colors hover:bg-surface-secondary ${
              selectedVideoId === video.id ? 'text-text-primary bg-surface-secondary' : 'text-text-secondary'
            }`}
          >
            <PlayCircle size={16} strokeWidth={1.5} className="shrink-0" />
            <span className="truncate">{video.title}</span>
          </button>
        </li>
      ))}
    </ul>
  );

  if (!isDesktop) {
    return createPortal(
      <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
        <div className="bg-surface border border-border-hairline rounded-sm w-full max-w-sm max-h-[80vh] flex flex-col shadow-2xl">
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-border-hairline shrink-0">
            <span className="f-small text-text-secondary">Premium Videos</span>
            <button type="button" onClick={onClose} aria-label="Close" className="text-text-secondary hover:text-text-primary">
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>
          <div className="overflow-y-auto">
            {videos.length === 0 ? (
              <p className="p-4 text-sm text-text-secondary">No videos available.</p>
            ) : (
              <ul className="divide-y divide-border-hairline">
                {videos.map((video) => {
                  const resolvedUrl = resolvedWatchUrls[video.id];
                  const isResolving = resolvingVideoId === video.id;
                  return (
                    <li key={video.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
                      <span className="text-sm text-text-primary truncate">{video.title}</span>
                      {resolvedUrl ? (
                        <a
                          href={resolvedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs font-bold text-text-primary shrink-0 underline underline-offset-2"
                        >
                          <ExternalLink size={12} strokeWidth={1.5} />
                          Watch
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={() => resolveWatchUrl(video)}
                          disabled={isResolving}
                          className="flex items-center gap-1 text-xs font-bold text-text-secondary hover:text-text-primary shrink-0 disabled:opacity-50 transition-colors"
                        >
                          {isResolving ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} strokeWidth={1.5} />}
                          {isResolving ? 'Loading…' : 'Get link'}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {videos.length > 0 && (
            <p className="px-4 py-3 text-xs text-text-secondary border-t border-border-hairline shrink-0">
              Bonus videos play best on a larger screen - visit this product's page on desktop to watch it embedded here.
            </p>
          )}
        </div>
      </div>,
      document.body
    );
  }

  return (
    <div
      ref={wrapperRef}
      className="w-full shrink-0 bg-surface flex flex-col z-30 relative border-l border-border-hairline"
      style={{ width, willChange: isDragging ? 'width' : undefined }}
    >
      <div
        onPointerDown={handleDragStart}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize video panel width"
        className={`absolute left-0 top-0 bottom-0 w-1.5 -ml-0.5 cursor-col-resize z-40 group touch-none ${isDragging ? 'bg-border-strong' : 'hover:bg-border-strong'}`}
      >
        <div className={`w-px h-full mx-auto ${isDragging ? 'bg-border-strong' : 'bg-transparent group-hover:bg-border-strong'} transition-colors`} />
      </div>

      <div className="flex items-center justify-between px-3 py-3 border-b border-border-hairline shrink-0">
        <span className="f-small text-text-secondary">Premium Videos</span>
        <button type="button" onClick={onClose} aria-label="Close video panel" className="text-text-secondary hover:text-text-primary">
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="aspect-video bg-black shrink-0 flex items-center justify-center">
          {isEmbedLoading ? (
            <Loader2 size={24} className="animate-spin text-text-secondary" />
          ) : embedError ? (
            <p className="text-sm text-text-secondary px-4 text-center">{embedError}</p>
          ) : embedYoutubeId ? (
            <iframe
              key={embedYoutubeId}
              src={buildEmbedSrc(embedYoutubeId)}
              title="Premium video"
              className="w-full h-full"
              // allow-same-origin here only lets youtube-nocookie.com act as
              // its own origin (its player needs that to function at all) -
              // it does not grant the iframe any access back into this
              // site's origin, since the iframe's src is cross-origin to
              // begin with. Deliberately no allow-top-navigation or
              // allow-forms - this frame only ever needs to play a video.
              sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <p className="text-sm text-text-secondary px-4 text-center">Pick a video below to start watching.</p>
          )}
        </div>

        {embedYoutubeId && (
          <a
            href={buildWatchUrl(embedYoutubeId)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 text-xs text-text-secondary hover:text-text-primary border-b border-border-hairline shrink-0 transition-colors"
          >
            <ExternalLink size={12} strokeWidth={1.5} />
            Open on YouTube
          </a>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto">
          {videos.length === 0 ? (
            <p className="p-4 text-sm text-text-secondary">No videos available.</p>
          ) : (
            videoList
          )}
        </div>
      </div>
    </div>
  );
};
