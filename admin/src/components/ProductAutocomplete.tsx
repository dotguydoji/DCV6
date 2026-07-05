import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { AdminFile } from '../lib/api';

interface ProductAutocompleteProps {
  products: AdminFile[];
  value: string;
  onChange: (productId: string) => void;
  placeholder?: string;
}

/**
 * A searchable combobox over the existing `files` list - purely a nicer
 * input for picking a productId. The selected value is still just a plain
 * productId string, exactly what the old <select> produced, so nothing
 * downstream (handleGrant, updateBuyer) needs to know this exists.
 */
export const ProductAutocomplete: React.FC<ProductAutocompleteProps> = ({
  products,
  value,
  onChange,
  placeholder = 'Search products…'
}) => {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = 'product-autocomplete-listbox';

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return products;
    return products.filter((file) => file.productId.toLowerCase().includes(normalized));
  }, [products, query]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query, open]);

  const selectProduct = (productId: string) => {
    onChange(productId);
    setQuery(productId);
    setOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (!open) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const match = filtered[highlightedIndex];
      if (match) selectProduct(match.productId);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted pointer-events-none" />
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            // Always mirror the typed text into the real value - otherwise
            // typing over an already-selected product without clicking a
            // suggestion leaves the displayed text and the actual submitted
            // productId silently out of sync (the old value would still be
            // what's sent to the server on submit).
            onChange(event.target.value);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full bg-brand-black border border-brand-border rounded-lg pl-9 pr-9 py-2.5 text-white outline-none focus:border-brand-yellow transition-colors"
        />
        <ChevronDown
          size={16}
          className={`absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted pointer-events-none transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </div>

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1.5 w-full max-h-56 overflow-y-auto scrollbar-thin rounded-lg border border-brand-border bg-brand-surface shadow-2xl animate-fade-in"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-brand-muted">No matching products.</li>
          ) : (
            filtered.map((file, index) => (
              <li
                key={file.productId}
                role="option"
                aria-selected={file.productId === value}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectProduct(file.productId);
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`flex items-center justify-between gap-2 px-3 py-2.5 text-sm cursor-pointer transition-colors ${
                  index === highlightedIndex ? 'bg-brand-surface-hover' : ''
                }`}
              >
                <span className="truncate">{file.productId}</span>
                {file.productId === value && <Check size={14} className="text-brand-yellow shrink-0" />}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
};
