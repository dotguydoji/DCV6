import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  itemLabel?: string;
}

const ELLIPSIS = 'ellipsis' as const;

const buildPageWindow = (page: number, totalPages: number): (number | typeof ELLIPSIS)[] => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = new Set<number>([1, totalPages, page, page - 1, page + 1]);
  const sorted = Array.from(pages)
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);

  const result: (number | typeof ELLIPSIS)[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) result.push(ELLIPSIS);
    result.push(p);
  });
  return result;
};

/** A pure, purely-UI pagination control. Callers own the actual slicing of
 * their data array by `page`/`pageSize` - this component only renders
 * controls and reports the page the admin wants to see. */
export const Pagination: React.FC<PaginationProps> = ({
  page,
  totalItems,
  pageSize,
  onPageChange,
  itemLabel = 'items'
}) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pageWindow = useMemo(() => buildPageWindow(safePage, totalPages), [safePage, totalPages]);

  if (totalItems === 0) return null;

  const rangeStart = (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, totalItems);

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1 py-3 text-sm"
    >
      <p className="text-brand-muted order-2 sm:order-1">
        Showing <span className="text-white font-medium">{rangeStart}–{rangeEnd}</span> of{' '}
        <span className="text-white font-medium">{totalItems}</span> {itemLabel}
      </p>

      <div className="flex items-center gap-1 order-1 sm:order-2">
        <button
          type="button"
          onClick={() => onPageChange(safePage - 1)}
          disabled={safePage === 1}
          aria-label="Previous page"
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-brand-border text-brand-muted hover:bg-brand-surface-hover hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={16} />
        </button>

        <div className="hidden sm:flex items-center gap-1">
          {pageWindow.map((entry, i) =>
            entry === ELLIPSIS ? (
              <span key={`ellipsis-${i}`} className="px-2 text-brand-muted">
                …
              </span>
            ) : (
              <button
                key={entry}
                type="button"
                onClick={() => onPageChange(entry)}
                aria-current={entry === safePage ? 'page' : undefined}
                className={`min-w-9 h-9 px-2 rounded-lg text-sm font-medium transition-colors ${
                  entry === safePage
                    ? 'bg-brand-yellow text-brand-black font-bold'
                    : 'text-brand-muted hover:bg-brand-surface-hover hover:text-white'
                }`}
              >
                {entry}
              </button>
            )
          )}
        </div>

        <span className="sm:hidden px-2 text-brand-muted whitespace-nowrap">
          Page {safePage} of {totalPages}
        </span>

        <button
          type="button"
          onClick={() => onPageChange(safePage + 1)}
          disabled={safePage === totalPages}
          aria-label="Next page"
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-brand-border text-brand-muted hover:bg-brand-surface-hover hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </nav>
  );
};
