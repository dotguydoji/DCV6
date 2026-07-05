import React from 'react';
import { Bookmark as BookmarkIcon, Trash2, X } from 'lucide-react';
import { Bookmark } from '../../lib/pdfViewerPreferences';

interface PdfBookmarksPanelProps {
  bookmarks: Bookmark[];
  onSelectPage: (page: number) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}

export const PdfBookmarksPanel: React.FC<PdfBookmarksPanelProps> = ({
  bookmarks,
  onSelectPage,
  onRemove,
  onClose
}) => (
  <div className="absolute right-4 top-16 z-30 w-64 max-h-[60vh] overflow-y-auto bg-[#242829] border border-white/10 rounded-sm shadow-2xl">
    <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 sticky top-0 bg-[#242829]">
      <span className="text-sm font-bold">Bookmarks</span>
      <button type="button" onClick={onClose} aria-label="Close bookmarks" className="text-brand-muted hover:text-white">
        <X size={16} />
      </button>
    </div>

    {bookmarks.length === 0 ? (
      <p className="px-4 py-6 text-sm text-brand-muted text-center">No bookmarks yet.</p>
    ) : (
      <ul>
        {bookmarks.map((bookmark) => (
          <li key={bookmark.id} className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 last:border-0">
            <button
              type="button"
              onClick={() => onSelectPage(bookmark.page)}
              className="flex items-center gap-2 text-sm font-bold text-white hover:text-brand-yellow transition-colors"
            >
              <BookmarkIcon size={14} className="text-brand-yellow" fill="currentColor" />
              Page {bookmark.page}
            </button>
            <button
              type="button"
              onClick={() => onRemove(bookmark.id)}
              aria-label={`Remove bookmark for page ${bookmark.page}`}
              className="text-brand-muted hover:text-red-400"
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
    )}
  </div>
);
