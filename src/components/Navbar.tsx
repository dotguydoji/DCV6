import React, { useState, useRef, useEffect, useMemo, useDeferredValue, useCallback } from 'react';
import { Menu, X, Search, LibraryBig, MessageCircle } from 'lucide-react';
import { PRODUCTS, SITE_CONTENT } from "../constants";
import { Product } from "../types";
import { getCachedIdToken, getIdTokenEmail } from '../lib/googleIdentity';
import { fetchOwnedProductIds } from '../lib/libraryAccess';
import { useInstallPrompt } from '../lib/useInstallPrompt';
import { getInstallGuide } from '../lib/installGuides';
import { InstallAppButton } from './InstallAppButton';
import { InstallGuideModal } from './InstallGuideModal';
import { MessengerJoinDialog } from './MessengerJoinDialog';
import { NoPdfAccessDialog } from './NoPdfAccessDialog';
import { ThemeToggle } from './ThemeToggle';

interface NavbarProps {
  onSearchSelect: (product: Product) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onSearchSelect }) => {
  const installPrompt = useInstallPrompt();
  const installGuide = useMemo(
    () => getInstallGuide(installPrompt.platform, installPrompt.browser, installPrompt.hasNativePrompt),
    [installPrompt.platform, installPrompt.browser, installPrompt.hasNativePrompt]
  );
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMessengerDialogOpen, setIsMessengerDialogOpen] = useState(false);
  const [isNoPdfAccessDialogOpen, setIsNoPdfAccessDialogOpen] = useState(false);
  const [isCheckingMessengerAccess, setIsCheckingMessengerAccess] = useState(false);
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

  // Only buyers who own at least one PDF can join the Messenger group chat -
  // this isn't a real access-control boundary (get-my-library re-verifies
  // everything server-side already), so any check failure just falls back
  // to showing the "no access" dialog rather than a separate error state.
  const handleMessengerClick = useCallback(async () => {
    setIsMenuOpen(false);

    const idToken = getCachedIdToken();
    if (!idToken) {
      setIsNoPdfAccessDialogOpen(true);
      return;
    }

    setIsCheckingMessengerAccess(true);
    const result = await fetchOwnedProductIds(idToken, getIdTokenEmail(idToken));
    setIsCheckingMessengerAccess(false);

    if (result.status === 'ok' && result.productIds.length > 0) {
      setIsMessengerDialogOpen(true);
    } else {
      setIsNoPdfAccessDialogOpen(true);
    }
  }, []);

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
      <nav className="sticky top-0 z-[60] bg-surface border-b border-border-hairline h-20 laptop:h-22 xl:h-24 transition-all [overflow-anchor:none]">
        <div className="max-w-[1600px] mx-auto px-4 lg:px-6 h-full flex items-center justify-between gap-6 laptop:gap-8">

          <div className="flex items-center gap-4 laptop:gap-5 shrink-0 cursor-default lg:pr-6 laptop:pr-8 lg:border-r lg:border-border-hairline">
            <img
              src="/favicon.svg"
              alt="DC Notes Logo"
              className="w-10 h-10 laptop:w-12 laptop:h-12 object-contain"
              loading="eager"
              decoding="async"
              referrerPolicy="no-referrer"
            />
            <span className="hidden sm:block text-base md:text-xl laptop:text-xl xl:text-2xl font-normal text-text-primary uppercase tracking-[0.12em]">
              Doji's Library
            </span>
          </div>


          <div className="hidden lg:flex items-center justify-end flex-grow gap-4 h-full">
            <div ref={searchRef} className="relative w-full max-w-md laptop:max-w-lg">
              <div
                className={`flex items-center bg-surface border rounded-sm transition-all duration-300 ${
                  isSearchFocused
                    ? 'border-border-strong ring-2 ring-border-strong/10'
                    : 'border-border-hairline hover:border-border-strong'
                }`}
              >
                <div className="flex items-center justify-center w-10 laptop:w-12 shrink-0 text-text-secondary border-r border-border-hairline">
                  <Search size={18} strokeWidth={1.5} className="laptop:hidden" />
                  <Search size={20} strokeWidth={1.5} className="hidden laptop:block" />
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search technical notes..."
                  aria-label="Search technical notes"
                  role="combobox"
                  aria-expanded={isSearchFocused && filteredProducts.length > 0}
                  aria-autocomplete="list"
                  className="w-full bg-transparent border-none py-2.5 laptop:py-3 px-4 text-text-primary f-body focus:ring-0 placeholder:text-text-secondary appearance-none"
                  value={searchQuery}
                  onChange={handleInputChange}
                  onFocus={() => setIsSearchFocused(true)}
                  onKeyDown={handleKeyDown}
                  autoComplete="off"
                />
              </div>

              {isSearchFocused && filteredProducts.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-4 bg-surface-secondary border border-border-hairline rounded overflow-hidden max-h-[70vh] overflow-y-auto z-[100] shadow-lg">
                  {filteredProducts.map((product, index) => (
                    <button
                      key={product.id}
                      className={`w-full px-5 py-4 laptop:px-6 laptop:py-5 text-left border-b border-border-hairline last:border-0 transition-all flex items-center gap-4 laptop:gap-5 group ${
                        index === selectedIndex ? 'bg-surface' : 'hover:bg-surface'
                      }`}
                      onClick={() => handleSelect(product)}
                    >
                      <div className="w-12 h-12 laptop:w-14 laptop:h-14 rounded-sm bg-surface overflow-hidden shrink-0 border border-border-hairline group-hover:border-border-strong transition-colors">
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
                        <div className="f-body font-medium truncate transition-colors text-text-primary">{product.title}</div>
                        <div className="f-small text-text-secondary text-[10px] laptop:text-[11px] font-medium truncate">{getSearchMeta(product)}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <InstallAppButton
              variant="desktop"
              canInstall={installPrompt.canInstall}
              guide={installGuide}
              onOpen={() => setIsInstallModalOpen(true)}
            />
            <button
              type="button"
              onClick={handleMessengerClick}
              disabled={isCheckingMessengerAccess}
              className="flex items-center gap-2 shrink-0 px-4 laptop:px-5 py-2.5 laptop:py-3 rounded-sm border border-border-hairline text-sm laptop:text-base font-medium text-text-primary hover:border-border-strong transition-colors disabled:opacity-50 disabled:pointer-events-none"
            >
              <MessageCircle size={18} strokeWidth={1.5} />
              Join Group Chat
            </button>
            <a
              href="/my-library"
              className="flex items-center gap-2 shrink-0 px-4 laptop:px-5 py-2.5 laptop:py-3 rounded-sm border border-border-hairline text-sm laptop:text-base font-medium text-text-primary hover:border-border-strong transition-colors"
            >
              <LibraryBig size={18} strokeWidth={1.5} />
              {hasCachedSession ? 'My Library' : 'Sign In'}
            </a>
            <ThemeToggle />
          </div>

          <div className="flex lg:hidden items-center gap-4">
            <ThemeToggle />
            <button
              onClick={toggleSearch}
              aria-label={isSearchVisible ? 'Close search' : 'Open search'}
              aria-expanded={isSearchVisible}
              type="button"
              className={`flex items-center justify-center w-12 h-12 rounded border transition-all duration-300 active:scale-90 ${
                isSearchVisible
                  ? 'bg-surface-inverted border-surface-inverted text-text-inverted'
                  : 'bg-surface-secondary border-border-hairline text-text-secondary hover:border-border-strong'
              }`}
            >
              {isSearchVisible ? <X size={24} strokeWidth={1.5} /> : <Search size={24} strokeWidth={1.5} />}
            </button>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isMenuOpen}
              type="button"
              className={`flex items-center justify-center w-12 h-12 rounded border transition-all duration-300 active:scale-90 ${
                isMenuOpen ? 'border-surface-inverted bg-surface-inverted text-text-inverted' : 'border-border-hairline bg-surface-secondary text-text-secondary'
              }`}
            >
              {isMenuOpen ? <X size={24} strokeWidth={1.5} /> : <Menu size={24} strokeWidth={1.5} />}
            </button>
          </div>
        </div>

        {isSearchVisible && (
          <div className="fixed top-20 left-0 right-0 bg-surface border-b border-border-hairline p-6 lg:hidden z-[60] shadow-lg">
            <div className="relative" ref={searchRef}>
              <div className="flex items-stretch bg-surface border border-border-strong rounded-sm focus-within:border-text-primary transition-all overflow-hidden">
                <div className="flex items-center justify-center w-14 shrink-0 bg-surface-secondary text-text-primary border-r border-border-hairline">
                  <Search size={24} strokeWidth={1.5} />
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search technical notes..."
                  aria-label="Search technical notes"
                  role="combobox"
                  aria-expanded={filteredProducts.length > 0}
                  aria-autocomplete="list"
                  className="w-full bg-transparent border-none py-5 px-6 text-text-primary f-body focus:ring-0 appearance-none"
                  value={searchQuery}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onFocus={() => setIsSearchFocused(true)}
                  autoComplete="off"
                />
              </div>

              {filteredProducts.length > 0 && (
                <div className="mt-4 bg-surface-secondary border border-border-hairline rounded overflow-hidden max-h-[calc(100dvh-11rem)] overflow-y-auto shadow-lg">
                  {filteredProducts.map((product, index) => (
                    <button
                      key={product.id}
                      className={`w-full px-6 py-6 text-left border-b border-border-hairline last:border-0 flex items-center gap-5 ${
                        index === selectedIndex ? 'bg-surface' : ''
                      }`}
                      onClick={() => handleSelect(product)}
                    >
                      <div className="w-16 h-16 rounded-sm bg-surface overflow-hidden shrink-0 border border-border-hairline">
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
                        <div className="f-body font-medium text-text-primary truncate">{product.title}</div>
                        <div className="f-small text-text-secondary text-[11px] font-medium truncate">{getSearchMeta(product)}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className={`lg:hidden fixed left-0 right-0 top-20 z-50 overflow-hidden transition-all duration-500 ease-in-out bg-surface border-b border-border-hairline ${isMenuOpen ? 'max-h-96 opacity-100 shadow-lg' : 'max-h-0 opacity-0 pointer-events-none'}`}>
          <div className="px-4 py-4 flex flex-col gap-2">
            <a
              href="/my-library"
              onClick={() => setIsMenuOpen(false)}
              className="flex items-center gap-3 px-4 py-3.5 rounded-sm border border-border-hairline text-text-primary font-medium hover:border-border-strong transition-colors"
            >
              <LibraryBig size={20} strokeWidth={1.5} />
              {hasCachedSession ? 'My Library' : 'Sign In'}
            </a>
            <InstallAppButton
              variant="mobile"
              canInstall={installPrompt.canInstall}
              guide={installGuide}
              onOpen={() => {
                setIsMenuOpen(false);
                setIsInstallModalOpen(true);
              }}
            />
            <button
              type="button"
              onClick={handleMessengerClick}
              disabled={isCheckingMessengerAccess}
              className="flex items-center gap-3 px-4 py-3.5 rounded-sm border border-border-hairline text-text-primary font-medium hover:border-border-strong transition-colors disabled:opacity-50 disabled:pointer-events-none"
            >
              <MessageCircle size={20} strokeWidth={1.5} />
              Join Messenger Group Chat
            </button>
          </div>
        </div>
      </nav>

      <MessengerJoinDialog open={isMessengerDialogOpen} onClose={() => setIsMessengerDialogOpen(false)} />
      <NoPdfAccessDialog open={isNoPdfAccessDialogOpen} onClose={() => setIsNoPdfAccessDialogOpen(false)} />

      {isInstallModalOpen && (
        <InstallGuideModal
          guide={installGuide}
          onClose={() => setIsInstallModalOpen(false)}
          onInstallNow={() => {
            setIsInstallModalOpen(false);
            installPrompt.promptInstall();
          }}
        />
      )}

      {(isMenuOpen || (isSearchVisible && searchQuery.length > 0)) && (
        <div
          className="fixed inset-0 z-[55] bg-black/70 backdrop-blur-md lg:hidden"
          onClick={() => {
            setIsMenuOpen(false);
            setIsSearchVisible(false);
          }}
        ></div>
      )}
    </>
  );
};
