import React, { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { X } from 'lucide-react';

interface PdfThumbnailPanelProps {
  pdfDocument: PDFDocumentProxy | null;
  currentPage: number;
  onSelectPage: (page: number) => void;
  onClose: () => void;
}

const THUMBNAIL_WIDTH = 110;

/**
 * Intentionally renders its own small canvases directly from the already-
 * loaded PDF document (pdfjsLib's base page.render() API), instead of using
 * PDF.js's PDFThumbnailViewer/RenderingQueue - that would require wiring a
 * shared rendering queue into the main PDFViewer, which is exactly the
 * existing rendering setup this project was asked not to touch. This stays
 * fully decoupled, at the cost of not sharing a render cache with the main
 * viewer (a fine tradeoff for a small side panel).
 */
const Thumbnail: React.FC<{
  pdfDocument: PDFDocumentProxy;
  pageNumber: number;
  isActive: boolean;
  onSelect: (page: number) => void;
}> = ({ pdfDocument, pageNumber, isActive, onSelect }) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);
  // Only start rendering once this thumbnail actually scrolls into view -
  // for a long PDF, rendering every page's canvas the instant the panel
  // opens fires dozens/hundreds of concurrent render tasks at once, which
  // is real, avoidable jank. Once true, stays true (no re-render on scroll
  // away), so already-rendered thumbnails aren't thrown away.
  const [isNearViewport, setIsNearViewport] = useState(false);

  useEffect(() => {
    if (isNearViewport || !buttonRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsNearViewport(true);
        }
      },
      { root: buttonRef.current.closest('.overflow-y-auto'), rootMargin: '200px 0px' }
    );

    observer.observe(buttonRef.current);
    return () => observer.disconnect();
  }, [isNearViewport]);

  useEffect(() => {
    if (!isNearViewport) return;

    let cancelled = false;
    let renderTask: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | null = null;

    pdfDocument.getPage(pageNumber).then((page) => {
      if (cancelled || !canvasRef.current) return;

      const viewport = page.getViewport({ scale: 1 });
      const scale = THUMBNAIL_WIDTH / viewport.width;
      const scaledViewport = page.getViewport({ scale });

      const canvas = canvasRef.current;
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;
      const context = canvas.getContext('2d');
      if (!context) return;

      renderTask = page.render({ canvasContext: context, viewport: scaledViewport, canvas });
      renderTask.promise.then(() => {
        if (!cancelled) setRendered(true);
      }).catch(() => {});
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdfDocument, pageNumber, isNearViewport]);

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => onSelect(pageNumber)}
      className={`flex flex-col items-center gap-1.5 p-2 rounded-sm border transition-colors w-full ${
        isActive ? 'border-brand-yellow bg-brand-yellow/10' : 'border-white/10 hover:border-white/30'
      }`}
    >
      <div
        className="bg-white/5 rounded-sm overflow-hidden flex items-center justify-center"
        style={{ width: THUMBNAIL_WIDTH, minHeight: THUMBNAIL_WIDTH * 1.3 }}
      >
        <canvas ref={canvasRef} className={rendered ? 'block' : 'hidden'} />
      </div>
      <span className={`text-xs font-bold ${isActive ? 'text-brand-yellow' : 'text-brand-muted'}`}>
        {pageNumber}
      </span>
    </button>
  );
};

export const PdfThumbnailPanel: React.FC<PdfThumbnailPanelProps> = ({
  pdfDocument,
  currentPage,
  onSelectPage,
  onClose
}) => {
  if (!pdfDocument) return null;

  return (
    <div className="w-[160px] shrink-0 border-r border-white/10 bg-[#1a1d1e] flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-3 border-b border-white/10">
        <span className="text-xs font-bold uppercase tracking-wide text-brand-muted">Pages</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close page thumbnails"
          className="text-brand-muted hover:text-white"
        >
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
        {Array.from({ length: pdfDocument.numPages }, (_, index) => index + 1).map((pageNumber) => (
          <Thumbnail
            key={pageNumber}
            pdfDocument={pdfDocument}
            pageNumber={pageNumber}
            isActive={pageNumber === currentPage}
            onSelect={onSelectPage}
          />
        ))}
      </div>
    </div>
  );
};
