import React, { useState, useRef, useEffect, useMemo, useDeferredValue, useCallback } from 'react';
import { Menu, X, Search } from 'lucide-react';
import { PRODUCTS, SITE_CONTENT } from "../constants";
import { Product } from "../types";

interface NavbarProps {
  onSearchSelect: (product: Product) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onSearchSelect }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);

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

    return PRODUCTS.filter((product) => {
      return (
        product.title.toLowerCase().includes(normalizedQuery) ||
        product.description.toLowerCase().includes(normalizedQuery)
      );
    }).slice(0, 5);
  }, [deferredSearchQuery]);

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
      <nav className="sticky top-0 z-[60] bg-[#33333]/95 backdrop-blur-xl border-b border-white/5 shadow-2xl h-20 laptop:h-22 xl:h-24 transition-all">
        <div className="max-w-[1580px] mx-auto px-6 lg:px-10 laptop:px-8 h-full flex items-center justify-between gap-6 laptop:gap-8">
          
          <div className="flex items-center gap-4 laptop:gap-5 shrink-0 cursor-default">
            <img 
              src="/favicon.svg" 
              alt="DC Notes Logo" 
              className="w-10 h-10 laptop:w-12 laptop:h-12 object-contain"
            />
            <span className="text-sm md:text-lg laptop:text-lg xl:text-xl font-extrabold text-white uppercase tracking-[0.3em]">
              Doji's <span className="text-brand-yellow">Library</span>
            </span>
          </div>


          <div className="hidden sm:flex items-center justify-end flex-grow gap-4 h-full">
            <div ref={searchRef} className="relative w-full max-w-md laptop:max-w-lg">
              <div 
                className={`flex items-center bg-black border rounded-sm transition-all duration-300 ${
                  isSearchFocused 
                    ? 'border-brand-yellow/80 ring-2 ring-brand-yellow/10' 
                    : 'border-gray-800 hover:border-gray-700'
                }`}
              >
                <div className="flex items-center justify-center w-10 laptop:w-12 shrink-0 text-brand-gray/60 border-r border-gray-900">
                  <Search size={18} className="laptop:hidden" />
                  <Search size={20} className="hidden laptop:block" />
                </div>
                <input 
                  ref={inputRef}
                  type="text"
                  placeholder="Search technical notes..."
                  className="w-full bg-transparent border-none py-2.5 laptop:py-3 px-4 text-white f-body focus:ring-0 placeholder:text-gray-800 appearance-none"
                  value={searchQuery}
                  onChange={handleInputChange}
                  onFocus={() => setIsSearchFocused(true)}
                  onKeyDown={handleKeyDown}
                  autoComplete="off"
                />
              </div>

              {isSearchFocused && filteredProducts.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-4 bg-[#1A1A1A] border border-gray-800 rounded shadow-[0_25px_60px_rgba(0,0,0,0.9)] overflow-hidden z-[100] animate-in fade-in slide-in-from-top-3 duration-300">
                  {filteredProducts.map((product, index) => (
                    <button
                      key={product.id}
                      className={`w-full px-5 py-4 laptop:px-6 laptop:py-5 text-left border-b border-white/5 last:border-0 transition-all flex items-center gap-4 laptop:gap-5 group ${
                        index === selectedIndex ? 'bg-white/5' : 'hover:bg-white/5'
                      }`}
                      onClick={() => handleSelect(product)}
                    >
                      <div className="w-12 h-12 laptop:w-14 laptop:h-14 rounded-sm bg-black overflow-hidden shrink-0 border border-gray-800 group-hover:border-brand-yellow/40 transition-colors">
                        <img src={product.thumbnail} alt="" className={`w-full h-full object-cover transition-all duration-700 ${index === selectedIndex ? 'scale-110 opacity-100' : 'opacity-40 group-hover:opacity-100'}`} />
                      </div>
                      <div className="overflow-hidden">
                        <div className={`f-body font-black truncate transition-colors ${index === selectedIndex ? 'text-brand-yellow' : 'text-white'}`}>{product.title}</div>
                        <div className="f-small text-brand-gray/40 text-[10px] laptop:text-[11px] font-black truncate">{getSearchMeta(product)}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex sm:hidden items-center gap-4">
            <button 
              onClick={toggleSearch}
              className={`flex items-center justify-center w-12 h-12 rounded border transition-all duration-300 active:scale-90 ${
                isSearchVisible 
                  ? 'bg-brand-yellow border-brand-yellow text-black shadow-[0_0_20px_rgba(255,107,0,0.4)]' 
                  : 'bg-black border-gray-800 text-brand-gray hover:border-brand-yellow/50'
              }`}
            >
              {isSearchVisible ? <X size={24} strokeWidth={3} /> : <Search size={24} />}
            </button>
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className={`flex items-center justify-center w-12 h-12 rounded border transition-all duration-300 active:scale-90 ${
                isMenuOpen ? 'border-brand-yellow bg-brand-yellow/15 text-brand-yellow' : 'border-gray-800 bg-black text-brand-gray'
              }`}
            >
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {isSearchVisible && (
          <div className="fixed top-20 left-0 right-0 bg-[#1A1A1A] border-b border-white/5 p-6 sm:hidden z-[60] animate-in fade-in slide-in-from-top-5 duration-300 shadow-2xl">
            <div className="relative" ref={searchRef}>
              <div className="flex items-stretch bg-black border border-brand-yellow/40 rounded-sm focus-within:border-brand-yellow transition-all overflow-hidden">
                <div className="flex items-center justify-center w-14 shrink-0 bg-brand-yellow/5 text-brand-yellow border-r border-brand-yellow/20">
                  <Search size={24} strokeWidth={2.5} />
                </div>
                <input 
                  ref={inputRef}
                  type="text"
                  placeholder="Search technical notes..."
                  className="w-full bg-transparent border-none py-5 px-6 text-white f-body focus:ring-0 appearance-none"
                  value={searchQuery}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onFocus={() => setIsSearchFocused(true)}
                  autoComplete="off"
                />
              </div>
              
              {filteredProducts.length > 0 && (
                <div className="mt-4 bg-[#1A1A1A] border border-gray-800 rounded shadow-[0_35px_70px_rgba(0,0,0,0.95)] overflow-hidden max-h-[60vh] overflow-y-auto">
                  {filteredProducts.map((product, index) => (
                    <button
                      key={product.id}
                      className={`w-full px-6 py-6 text-left border-b border-white/5 last:border-0 flex items-center gap-5 ${
                        index === selectedIndex ? 'bg-white/5' : ''
                      }`}
                      onClick={() => handleSelect(product)}
                    >
                      <div className="w-16 h-16 rounded-sm bg-black overflow-hidden shrink-0 border border-gray-800">
                        <img src={product.thumbnail} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="overflow-hidden">
                        <div className="f-body font-black text-white truncate">{product.title}</div>
                        <div className="f-small text-brand-gray/40 text-[11px] font-black truncate">{getSearchMeta(product)}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className={`lg:hidden fixed left-0 right-0 top-20 z-50 overflow-hidden transition-all duration-500 ease-in-out bg-[#1A1A1A] border-b border-white/5 ${isMenuOpen ? 'max-h-80 opacity-100 shadow-2xl' : 'max-h-0 opacity-0 pointer-events-none'}`}>
        </div>
      </nav>
      
      {(isMenuOpen || (isSearchVisible && searchQuery.length > 0)) && (
        <div 
          className="fixed inset-0 z-[55] bg-black/85 backdrop-blur-md lg:hidden animate-in fade-in duration-400" 
          onClick={() => {
            setIsMenuOpen(false);
            setIsSearchVisible(false);
          }}
        ></div>
      )}
    </>
  );
};
