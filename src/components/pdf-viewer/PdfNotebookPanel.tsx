import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { NotebookWorkspace } from '../notebook/NotebookWorkspace';

interface PdfNotebookPanelProps {
  onClose: () => void;
}

const WIDTH_STORAGE_KEY = 'dcv6-notebook-panel-width';
const HEIGHT_STORAGE_KEY = 'dcv6-notebook-panel-height';
const MIN_WIDTH = 320;
const MIN_HEIGHT = 160;
const DEFAULT_WIDTH = 420;
// Mobile bottom sheet opens at 30% of the device's height so the drag handle
// (and PDF behind it) stay reachable right away instead of the panel
// defaulting to something that swallows most of the screen.
const DEFAULT_HEIGHT_RATIO = 0.3;
// The reader can shrink the sheet, but never past this - dragging it fully
// out of view would just be a confusing way to "close" it when a close
// button already exists for that.
const MIN_HEIGHT_RATIO = 0.1;
const DESKTOP_MEDIA_QUERY = '(min-width: 640px)';
// Not a preference cap - the reader decides how wide/tall the notebook gets.
// This only keeps the PDF itself from being crushed to nothing.
const MIN_PDF_SPACE_PX = 240;

const clampWidth = (width: number) => {
  const viewportCap = typeof window !== 'undefined' ? window.innerWidth - MIN_PDF_SPACE_PX : width;
  return Math.min(Math.max(width, MIN_WIDTH), Math.max(MIN_WIDTH, viewportCap));
};

const clampHeight = (height: number, containerHeight: number) => {
  // Absolute floor guards very short viewports; otherwise the minimum
  // tracks the container so it stays ~10% of the actual device height.
  const minHeight = Math.max(80, containerHeight * MIN_HEIGHT_RATIO);
  const cap = Math.max(MIN_HEIGHT, containerHeight - MIN_PDF_SPACE_PX);
  return Math.min(Math.max(height, minHeight), Math.max(minHeight, cap));
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

const getStoredHeight = (): number | null => {
  try {
    const raw = localStorage.getItem(HEIGHT_STORAGE_KEY);
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const setStoredHeight = (height: number): void => {
  try {
    localStorage.setItem(HEIGHT_STORAGE_KEY, String(Math.round(height)));
  } catch {
    // Ignored on purpose - just means the height resets to default next time.
  }
};

type DragAxis = 'width' | 'height';

/**
 * Lets a buyer take notes without leaving the PDF they're reading. Shares
 * the same local-storage-backed NotebookWorkspace as the standalone
 * /notebook page, so a note started here is also visible/editable there
 * (and vice versa) - it's one notebook, just two entry points.
 *
 * Desktop: a side panel, resizable by dragging its left edge horizontally.
 * Mobile: a bottom sheet stacked under the PDF (the parent row switches to
 * a column layout - see PdfViewer.tsx), resized via a permanent drag handle
 * centered in its header. Either way, the reader decides the size - the
 * resize handles only stop short of crushing the PDF to zero space, and on
 * mobile also stop short of shrinking the sheet below ~10% of the device's
 * height (the close button is what fully dismisses it, not dragging).
 */
export const PdfNotebookPanel: React.FC<PdfNotebookPanelProps> = ({ onClose }) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(DESKTOP_MEDIA_QUERY).matches
  );
  const [width, setWidth] = useState(getStoredWidth);
  const [height, setHeight] = useState(() => {
    const stored = getStoredHeight();
    if (stored !== null) return stored;
    const fallbackContainerHeight = typeof window !== 'undefined' ? window.innerHeight : 700;
    return Math.round(fallbackContainerHeight * DEFAULT_HEIGHT_RATIO);
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<{ axis: DragAxis; start: number; startSize: number; containerSize: number } | null>(null);
  // Latest pointer position during a drag, applied to the DOM directly from
  // a rAF loop rather than through React state on every pointermove - see
  // the comment on `rafLoop` below for why.
  const latestPointerRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const handleChange = () => setIsDesktop(mql.matches);
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  // Mobile touch/pointermove can fire far more often than the display can
  // paint, and each move used to call setWidth/setHeight directly - a full
  // React re-render of this panel (plus the NotebookWorkspace/rich-text
  // editor tree inside it) on every single one of those events, which is
  // what produced the lag/glitchy-hanging feel while dragging on a phone.
  // Instead, only the latest pointer position is recorded per event
  // (cheap); a rAF loop (one commit per painted frame, no more) reads that
  // and writes the panel's size straight to the DOM via the ref, bypassing
  // React entirely until the drag ends. React only re-renders once, on
  // pointerup, to commit the final size to state.
  const rafLoop = useCallback(() => {
    const drag = dragStateRef.current;
    const wrapper = wrapperRef.current;
    if (!drag || !wrapper) {
      rafIdRef.current = null;
      return;
    }

    if (drag.axis === 'width') {
      const delta = drag.start - latestPointerRef.current;
      wrapper.style.width = `${clampWidth(drag.startSize + delta)}px`;
    } else {
      const delta = drag.start - latestPointerRef.current;
      wrapper.style.height = `${clampHeight(drag.startSize + delta, drag.containerSize)}px`;
    }

    rafIdRef.current = requestAnimationFrame(rafLoop);
  }, []);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragStateRef.current) return;
      latestPointerRef.current = dragStateRef.current.axis === 'width' ? e.clientX : e.clientY;
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(rafLoop);
      }
    },
    [rafLoop]
  );

  const handlePointerUp = useCallback(() => {
    const drag = dragStateRef.current;
    if (!drag) return;
    dragStateRef.current = null;
    setIsDragging(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', handlePointerUp);

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    // Commits the size the rAF loop already painted to the DOM (read back
    // off the live element, not recomputed) into React state exactly once -
    // this is the only re-render the whole drag causes.
    const wrapper = wrapperRef.current;
    if (drag.axis === 'width') {
      const finalWidth = Math.round(wrapper ? clampWidth(wrapper.getBoundingClientRect().width) : drag.startSize);
      setWidth(finalWidth);
      setStoredWidth(finalWidth);
    } else {
      const finalHeight = Math.round(
        wrapper ? clampHeight(wrapper.getBoundingClientRect().height, drag.containerSize) : drag.startSize
      );
      setHeight(finalHeight);
      setStoredHeight(finalHeight);
    }
  }, [handlePointerMove]);

  const handleDragStart = useCallback(
    (axis: DragAxis) => (e: React.PointerEvent) => {
      e.preventDefault();
      const containerSize =
        axis === 'height' ? wrapperRef.current?.parentElement?.clientHeight ?? window.innerHeight : 0;
      dragStateRef.current = {
        axis,
        start: axis === 'width' ? e.clientX : e.clientY,
        startSize: axis === 'width' ? width : height,
        containerSize
      };
      latestPointerRef.current = dragStateRef.current.start;
      setIsDragging(true);
      document.body.style.cursor = axis === 'width' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
    },
    [width, height, handlePointerMove, handlePointerUp]
  );

  useEffect(() => {
    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [handlePointerMove, handlePointerUp]);

  return (
    <div
      ref={wrapperRef}
      className={`w-full shrink-0 bg-surface flex flex-col z-30 relative border-border-hairline ${
        isDesktop ? 'border-l' : 'border-t'
      }`}
      style={{ ...(isDesktop ? { width } : { height }), willChange: isDragging ? (isDesktop ? 'width' : 'height') : undefined }}
    >
      {isDesktop && (
        <div
          onPointerDown={handleDragStart('width')}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize notebook panel width"
          className={`hidden sm:block absolute left-0 top-0 bottom-0 w-1.5 -ml-0.5 cursor-col-resize z-40 group touch-none ${isDragging ? 'bg-border-strong' : 'hover:bg-border-strong'}`}
        >
          <div className={`w-px h-full mx-auto ${isDragging ? 'bg-border-strong' : 'bg-transparent group-hover:bg-border-strong'} transition-colors`} />
        </div>
      )}
      <div className="relative flex items-center justify-between px-3 py-3 border-b border-border-hairline shrink-0">
        <span className="f-small text-text-secondary">Notebook</span>
        {!isDesktop && (
          // Permanent, always-visible drag handle - sits in the header so it
          // stays reachable no matter how small the sheet gets, instead of
          // relying on a strip at the panel's top edge that can end up off
          // the reader's reachable area when the sheet opens large.
          <div
            onPointerDown={handleDragStart('height')}
            role="separator"
            aria-orientation="horizontal"
            aria-label="Drag to resize notebook panel height"
            className="sm:hidden absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-16 flex items-center justify-center cursor-row-resize touch-none z-10"
          >
            <div className={`h-1 w-10 rounded-full ${isDragging ? 'bg-border-strong' : 'bg-border-hairline'} transition-colors`} />
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close notebook"
          className="relative z-20 text-text-secondary hover:text-text-primary"
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>
      <div className="flex-1 min-h-0">
        <NotebookWorkspace variant="panel" />
      </div>
    </div>
  );
};
