import React, { useState, useRef, useEffect, useMemo, useDeferredValue, useCallback } from 'react';
import { Menu, X, Search, LibraryBig, MessageCircle } from 'lucide-react';
import { PRODUCTS, SITE_CONTENT } from "../constants";
import { Product } from "../types";
import { getCachedIdToken } from '../lib/googleIdentity';
import { useInstallPrompt } from '../lib/useInstallPrompt';
import { InstallAppButton } from './InstallAppButton';
import { MessengerJoinDialog } from './MessengerJoinDialog';

interface NavbarProps {
  onSearchSelect: (product: Product) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onSearchSelect }) => {
  const installPrompt = useInstallPrompt();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMessengerDialogOpen, setIsMessengerDialogOpen] = useState(false);
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  // Cosmetic only - just decides the button label. The My Library page
  // always re-verifies access with the server regardless of this value.
  const [hasCachedSession, setHasCachedSession] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  useEffect(() => {
    setHasCachedSession(getCachedIdToken() !== null);
  }, []);

  const sanitizeInput = (val: string) => {
    return val
      .replace(/<[^>]*>?/gm, '')
      .replace(/[<>]/g, '')
      .replace(/javascript:/gi, '')
      .substring(0, 100);
  };

  const getSearchMeta = (product: Product) => {
    const meta = [product.category];
    if (product.language === 'en') meta.push('English');
    if (product.language === 'tl') meta.push('Tagalog');
    return meta.join(' · ');
  };

  const filteredProducts = useMemo(() => {
    const normalizedQuery = deferredSearchQuery.trim().toLowerCase();
    if (normalizedQuery === '') return [];

    // No cap here anymore - the results containers below (desktop dropdown
    // and mobile full panel) scroll independently within their own max
    // height, so a long match list is fully browsable instead of being
    // artificially cut off at 5.
    return PRODUCTS.filter((product) => {
      return (
        product.title.toLowerCase().includes(normalizedQuery) ||
        product.description.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [deferredSearchQuery]);

  // Locks the page behind the mobile menu/search sheet so only the sheet's
  // own content (e.g. the search results list) scrolls - without this the
  // background page keeps scrolling underneath the open overlay.
  useEffect(() => {
    if (!isMenuOpen && !isSearchVisible) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMenuOpen, isSearchVisible]);

  useEffect(() => {
    setSelectedIndex(-1);
  }, [searchQuery, isSearchVisible]);

  const handleClickOutside = useCallback((event: MouseEvent) => {
      const target = event.target as Node;
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchFocused(false);
        if (searchQuery.trim() === '') {
          setIsSearchVisible(false);
        }
      } else if (searchRef.current?.contains(target)) {
        setIsSearchFocused(true);
      }
    }, [searchQuery]);

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [handleClickOutside]);

  useEffect(() => {
    if (isSearchVisible && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isSearchVisible]);

  const handleSelect = useCallback((product: Product) => {
    onSearchSelect(product);
    setSearchQuery('');
    setIsSearchFocused(false);
    setIsSearchVisible(false);
    setIsMenuOpen(false);
  }, [onSearchSelect]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (filteredProducts.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < filteredProducts.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : filteredProducts.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0) {
        handleSelect(filteredProducts[selectedIndex]);
      } else if (filteredProducts.length > 0) {
        handleSelect(filteredProducts[0]);
      }
    } else if (e.key === 'Escape') {
      setIsSearchVisible(false);
      setSearchQuery('');
    }
  };

  const toggleSearch = useCallback(() => {
    setIsSearchVisible(!isSearchVisible);
    if (!isSearchVisible) {
      setTimeout(() => inputRef.current?.focus(), 10);
    } else {
      setSearchQuery('');
    }
  }, [isSearchVisible]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleanValue = sanitizeInput(e.target.value);
    setSearchQuery(cleanValue);
  };

  return (
    <>
      <nav className="sticky top-0 z-[60] bg-[#1a1d1e] shadow-[0_8px_40px_rgba(0,0,0,0.6)] h-20 laptop:h-22 xl:h-24 transition-all">
        <div className="max-w-[1600px] mx-auto px-4 lg:px-6 h-full flex items-center justify-between gap-6 laptop:gap-8">
          
          <div className="flex items-center gap-4 laptop:gap-5 shrink-0 cursor-default">
            <img 
              src="/favicon.svg" 
              alt="DC Notes Logo" 
              className="w-10 h-10 laptop:w-12 laptop:h-12 object-contain"
              loading="eager"
              decoding="async"
              referrerPolicy="no-referrer"
            />
            <span className="text-base md:text-xl laptop:text-xl xl:text-2xl font-extrabold text-white uppercase tracking-[0.3em]">
              Doji's <span className="text-brand-yellow">Library</span>
            </span>
          </div>


          <div className="hidden sm:flex items-center justify-end flex-grow gap-4 h-full">
            <div ref={searchRef} className="relative w-full max-w-md laptop:max-w-lg">
              <div 
                className={`flex items-center bg-[#1a1d1e] border rounded-sm transition-all duration-300 ${
                  isSearchFocused 
                    ? 'border-brand-yellow/80 ring-2 ring-brand-yellow/10' 
                    : 'border-white/10 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-center w-10 laptop:w-12 shrink-0 text-brand-gray/60 border-r border-white/5">
                  <Search size={18} className="laptop:hidden" />
                  <Search size={20} className="hidden laptop:block" />
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search technical notes..."
                  aria-label="Search technical notes"
                  role="combobox"
                  aria-expanded={isSearchFocused && filteredProducts.length > 0}
                  aria-autocomplete="list"
                  className="w-full bg-transparent border-none py-2.5 laptop:py-3 px-4 text-white f-body focus:ring-0 placeholder:text-brand-muted appearance-none"
                  value={searchQuery}
                  onChange={handleInputChange}
                  onFocus={() => setIsSearchFocused(true)}
                  onKeyDown={handleKeyDown}
                  autoComplete="off"
                />
              </div>

              {isSearchFocused && filteredProducts.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-4 bg-[#1a1d1e] border border-white/10 rounded shadow-[0_25px_60px_rgba(0,0,0,0.9)] overflow-hidden max-h-[70vh] overflow-y-auto z-[100] animate-in fade-in slide-in-from-top-3 duration-300">
                  {filteredProducts.map((product, index) => (
                    <button
                      key={product.id}
                      className={`w-full px-5 py-4 laptop:px-6 laptop:py-5 text-left border-b border-white/5 last:border-0 transition-all flex items-center gap-4 laptop:gap-5 group ${
                        index === selectedIndex ? 'bg-white/5' : 'hover:bg-white/5'
                      }`}
                      onClick={() => handleSelect(product)}
                    >
                      <div className="w-12 h-12 laptop:w-14 laptop:h-14 rounded-sm bg-[#1a1d1e] overflow-hidden shrink-0 border border-white/10 group-hover:border-brand-yellow/40 transition-colors">
                        <img
                          src={product.thumbnail}
                          alt=""
                          className={`w-full h-full object-cover transition-all duration-700 ${index === selectedIndex ? 'scale-110 opacity-100' : 'opacity-40 group-hover:opacity-100'}`}
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="overflow-hidden">
                        <div className={`f-body font-black truncate transition-colors ${index === selectedIndex ? 'text-brand-yellow' : 'text-white'}`}>{product.title}</div>
                        <div className="f-small text-brand-muted text-[10px] laptop:text-[11px] font-black truncate">{getSearchMeta(product)}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <InstallAppButton {...installPrompt} />
            <a
              href="/my-library"
              className="flex items-center gap-2 shrink-0 px-4 laptop:px-5 py-2.5 laptop:py-3 rounded-sm border border-white/10 text-sm laptop:text-base font-bold text-white hover:border-brand-yellow/50 hover:text-brand-yellow transition-colors"
            >
              <LibraryBig size={18} />
              {hasCachedSession ? 'My Library' : 'Login'}
            </a>
          </div>

          <div className="flex sm:hidden items-center gap-4">
            <InstallAppButton variant="icon" {...installPrompt} />
            <button
              onClick={toggleSearch}
              aria-label={isSearchVisible ? 'Close search' : 'Open search'}
              aria-expanded={isSearchVisible}
              type="button"
              className={`flex items-center justify-center w-12 h-12 rounded border transition-all duration-300 active:scale-90 ${
                isSearchVisible
                  ? 'bg-brand-yellow border-brand-yellow text-[#1a1d1e]'
                  : 'bg-[#1a1d1e] border-white/10 text-brand-gray hover:border-brand-yellow/50'
              }`}
            >
              {isSearchVisible ? <X size={24} strokeWidth={3} /> : <Search size={24} />}
            </button>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isMenuOpen}
              type="button"
              className={`flex items-center justify-center w-12 h-12 rounded border transition-all duration-300 active:scale-90 ${
                isMenuOpen ? 'border-brand-yellow bg-brand-yellow/15 text-brand-yellow' : 'border-white/10 bg-[#1a1d1e] text-brand-gray'
              }`}
            >
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {isSearchVisible && (
          <div className="fixed top-20 left-0 right-0 bg-[#1a1d1e] border-b border-white/5 p-6 sm:hidden z-[60] animate-in fade-in slide-in-from-top-5 duration-300 shadow-2xl">
            <div className="relative" ref={searchRef}>
              <div className="flex items-stretch bg-[#1a1d1e] border border-brand-yellow/40 rounded-sm focus-within:border-brand-yellow transition-all overflow-hidden">
                <div className="flex items-center justify-center w-14 shrink-0 bg-brand-yellow/5 text-brand-yellow border-r border-brand-yellow/20">
                  <Search size={24} strokeWidth={2.5} />
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search technical notes..."
                  aria-label="Search technical notes"
                  role="combobox"
                  aria-expanded={filteredProducts.length > 0}
                  aria-autocomplete="list"
                  className="w-full bg-transparent border-none py-5 px-6 text-white f-body focus:ring-0 appearance-none"
                  value={searchQuery}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onFocus={() => setIsSearchFocused(true)}
                  autoComplete="off"
                />
              </div>
              
              {filteredProducts.length > 0 && (
                <div className="mt-4 bg-[#1a1d1e] border border-white/10 rounded shadow-[0_35px_70px_rgba(0,0,0,0.95)] overflow-hidden max-h-[calc(100dvh-11rem)] overflow-y-auto">
                  {filteredProducts.map((product, index) => (
                    <button
                      key={product.id}
                      className={`w-full px-6 py-6 text-left border-b border-white/5 last:border-0 flex items-center gap-5 ${
                        index === selectedIndex ? 'bg-white/5' : ''
                      }`}
                      onClick={() => handleSelect(product)}
                    >
                      <div className="w-16 h-16 rounded-sm bg-[#1a1d1e] overflow-hidden shrink-0 border border-white/10">
                        <img
                          src={product.thumbnail}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="overflow-hidden">
                        <div className="f-body font-black text-white truncate">{product.title}</div>
                        <div className="f-small text-brand-muted text-[11px] font-black truncate">{getSearchMeta(product)}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className={`lg:hidden fixed left-0 right-0 top-20 z-50 overflow-hidden transition-all duration-500 ease-in-out bg-[#1a1d1e] border-b border-white/5 ${isMenuOpen ? 'max-h-96 opacity-100 shadow-2xl' : 'max-h-0 opacity-0 pointer-events-none'}`}>
          <div className="px-4 py-4 flex flex-col gap-2">
            <a
              href="/my-library"
              onClick={() => setIsMenuOpen(false)}
              className="flex items-center gap-3 px-4 py-3.5 rounded-sm border border-white/10 text-white font-bold hover:border-brand-yellow/50 hover:text-brand-yellow transition-colors"
            >
              <LibraryBig size={20} />
              {hasCachedSession ? 'My Library' : 'Login'}
            </a>
            <button
              type="button"
              onClick={() => {
                setIsMenuOpen(false);
                setIsMessengerDialogOpen(true);
              }}
              className="flex items-center gap-3 px-4 py-3.5 rounded-sm border border-white/10 text-white font-bold hover:border-brand-yellow/50 hover:text-brand-yellow transition-colors"
            >
              <MessageCircle size={20} />
              Join Messenger Group Chat
            </button>
          </div>
        </div>
      </nav>

      <MessengerJoinDialog open={isMessengerDialogOpen} onClose={() => setIsMessengerDialogOpen(false)} />
      
      {(isMenuOpen || (isSearchVisible && searchQuery.length > 0)) && (
        <div 
          className="fixed inset-0 z-[55] bg-[#1a1d1e]/85 backdrop-blur-md lg:hidden animate-in fade-in duration-400" 
          onClick={() => {
            setIsMenuOpen(false);
            setIsSearchVisible(false);
          }}
        ></div>
      )}
    </>
  );
};
