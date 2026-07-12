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
  <div className="absolute right-4 top-16 z-50 w-64 max-h-[60vh] overflow-y-auto bg-surface-secondary border border-border-hairline rounded-sm shadow-2xl">
    <div className="flex items-center justify-between px-4 py-3 border-b border-border-hairline sticky top-0 bg-surface-secondary">
      <span className="text-sm font-medium text-text-primary">Bookmarks</span>
      <button type="button" onClick={onClose} aria-label="Close bookmarks" className="text-text-secondary hover:text-text-primary">
        <X size={16} strokeWidth={1.5} />
      </button>
    </div>

    {bookmarks.length === 0 ? (
      <p className="px-4 py-6 text-sm text-text-secondary text-center">No bookmarks yet.</p>
    ) : (
      <ul>
        {bookmarks.map((bookmark) => (
          <li key={bookmark.id} className="flex items-center justify-between px-4 py-2.5 border-b border-border-hairline last:border-0">
            <button
              type="button"
              onClick={() => onSelectPage(bookmark.page)}
              className="flex items-center gap-2 text-sm font-medium text-text-primary hover:text-text-secondary transition-colors"
            >
              <BookmarkIcon size={14} strokeWidth={1.5} className="text-text-primary" fill="currentColor" />
              Page {bookmark.page}
            </button>
            <button
              type="button"
              onClick={() => onRemove(bookmark.id)}
              aria-label={`Remove bookmark for page ${bookmark.page}`}
              className="text-text-secondary hover:text-red-400"
            >
              <Trash2 size={14} strokeWidth={1.5} />
            </button>
          </li>
        ))}
      </ul>
    )}
  </div>
);
