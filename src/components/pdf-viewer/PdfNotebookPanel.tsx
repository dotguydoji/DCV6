import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { NotebookWorkspace } from '../notebook/NotebookWorkspace';

interface PdfNotebookPanelProps {
  onClose: () => void;
}

const WIDTH_STORAGE_KEY = 'dcv6-notebook-panel-width';
const MIN_WIDTH = 320;
const MAX_WIDTH = 720;
const DEFAULT_WIDTH = 420;
const DESKTOP_MEDIA_QUERY = '(min-width: 640px)';

const clampWidth = (width: number) => {
  const viewportCap = typeof window !== 'undefined' ? window.innerWidth - 320 : MAX_WIDTH;
  return Math.min(Math.max(width, MIN_WIDTH), Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, viewportCap)));
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

/**
 * Lets a buyer take notes without leaving the PDF they're reading. Shares
 * the same local-storage-backed NotebookWorkspace as the standalone
 * /notebook page, so a note started here is also visible/editable there
 * (and vice versa) - it's one notebook, just two entry points.
 *
 * Resizable by dragging the left edge - desktop only (matches the fixed
 * full-screen overlay layout used below `sm`, where there's no room to
 * negotiate a width against the PDF view anyway).
 */
export const PdfNotebookPanel: React.FC<PdfNotebookPanelProps> = ({ onClose }) => {
  const [width, setWidth] = useState(getStoredWidth);
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(DESKTOP_MEDIA_QUERY).matches
  );
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const handleChange = () => setIsDesktop(mql.matches);
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  const handleMove = useCallback((e: MouseEvent) => {
    if (!dragStateRef.current) return;
    const { startX, startWidth } = dragStateRef.current;
    // Dragging the left edge leftward should widen the panel (it sits on
    // the right side of the viewer), so width grows as clientX decreases.
    const delta = startX - e.clientX;
    setWidth(clampWidth(startWidth + delta));
  }, []);

  const handleUp = useCallback(() => {
    if (!dragStateRef.current) return;
    dragStateRef.current = null;
    setIsDragging(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', handleMove);
    document.removeEventListener('mouseup', handleUp);
    setWidth((current) => {
      setStoredWidth(current);
      return current;
    });
  }, [handleMove]);

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragStateRef.current = { startX: e.clientX, startWidth: width };
      setIsDragging(true);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
    },
    [width, handleMove, handleUp]
  );

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [handleMove, handleUp]);

  return (
    <div
      className="w-full shrink-0 border-l border-border-hairline bg-surface flex flex-col h-full absolute sm:relative inset-0 sm:inset-auto z-30"
      style={isDesktop ? { width } : undefined}
    >
      {isDesktop && (
        <div
          onMouseDown={handleDragStart}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize notebook panel"
          className={`hidden sm:block absolute left-0 top-0 bottom-0 w-1.5 -ml-0.5 cursor-col-resize z-40 group ${isDragging ? 'bg-border-strong' : 'hover:bg-border-strong'}`}
        >
          <div className={`w-px h-full mx-auto ${isDragging ? 'bg-border-strong' : 'bg-transparent group-hover:bg-border-strong'} transition-colors`} />
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
