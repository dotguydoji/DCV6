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
const DEFAULT_HEIGHT_RATIO = 0.45;
const DESKTOP_MEDIA_QUERY = '(min-width: 640px)';
// Not a preference cap - the reader decides how wide/tall the notebook gets.
// This only keeps the PDF itself from being crushed to nothing.
const MIN_PDF_SPACE_PX = 240;

const clampWidth = (width: number) => {
  const viewportCap = typeof window !== 'undefined' ? window.innerWidth - MIN_PDF_SPACE_PX : width;
  return Math.min(Math.max(width, MIN_WIDTH), Math.max(MIN_WIDTH, viewportCap));
};

const clampHeight = (height: number, containerHeight: number) => {
  const cap = Math.max(MIN_HEIGHT, containerHeight - MIN_PDF_SPACE_PX);
  return Math.min(Math.max(height, MIN_HEIGHT), cap);
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
 * a column layout - see PdfViewer.tsx), resizable by dragging its top edge
 * vertically. Either way, the reader decides the size - the resize handles
 * only stop short of crushing the PDF itself to zero space.
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

  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const handleChange = () => setIsDesktop(mql.matches);
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const drag = dragStateRef.current;
    if (!drag) return;

    if (drag.axis === 'width') {
      // Dragging the left edge leftward should widen the panel (it sits on
      // the right side of the viewer), so width grows as clientX decreases.
      const delta = drag.start - e.clientX;
      setWidth(clampWidth(drag.startSize + delta));
    } else {
      // Dragging the top edge upward should grow the panel (it's pinned to
      // the bottom of the screen), so height grows as clientY decreases.
      const delta = drag.start - e.clientY;
      setHeight(clampHeight(drag.startSize + delta, drag.containerSize));
    }
  }, []);

  const handlePointerUp = useCallback(() => {
    const drag = dragStateRef.current;
    if (!drag) return;
    dragStateRef.current = null;
    setIsDragging(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', handlePointerUp);

    if (drag.axis === 'width') {
      setWidth((current) => {
        setStoredWidth(current);
        return current;
      });
    } else {
      setHeight((current) => {
        setStoredHeight(current);
        return current;
      });
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
      style={isDesktop ? { width } : { height }}
    >
      {isDesktop ? (
        <div
          onPointerDown={handleDragStart('width')}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize notebook panel width"
          className={`hidden sm:block absolute left-0 top-0 bottom-0 w-1.5 -ml-0.5 cursor-col-resize z-40 group touch-none ${isDragging ? 'bg-border-strong' : 'hover:bg-border-strong'}`}
        >
          <div className={`w-px h-full mx-auto ${isDragging ? 'bg-border-strong' : 'bg-transparent group-hover:bg-border-strong'} transition-colors`} />
        </div>
      ) : (
        <div
          onPointerDown={handleDragStart('height')}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize notebook panel height"
          className={`sm:hidden absolute left-0 right-0 top-0 h-4 -mt-2 cursor-row-resize z-40 group touch-none flex items-center justify-center ${isDragging ? 'bg-border-strong/20' : ''}`}
        >
          <div className={`h-1 w-10 rounded-full ${isDragging ? 'bg-border-strong' : 'bg-border-hairline group-hover:bg-border-strong'} transition-colors`} />
        </div>
      )}
      <div className="flex items-center justify-between px-3 py-3 border-b border-border-hairline shrink-0">
        <span className="f-small text-text-secondary">Notebook</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close notebook"
          className="text-text-secondary hover:text-text-primary"
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
