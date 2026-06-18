'use client';

import { useState, useEffect, useRef, useTransition, useCallback } from 'react';
import { searchTerms } from '@/actions/terms';
import { TermSearchResults } from '@/components/TermSearchResults';
import type { Term } from '@/lib/db';

export function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Term[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  const overlayOpen = query.trim() !== '' && (results !== null || isPending);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    let stale = false;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const terms = await searchTerms(trimmed);
        if (!stale) setResults(terms);
      });
    }, 2000);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    if (!overlayOpen) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setResults(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [overlayOpen]);

  function handleClear() {
    setQuery('');
    setResults(null);
  }

  const refreshSearch = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const terms = await searchTerms(trimmed);
      setResults(terms);
    });
  }, [query]);

  return (
    <div ref={containerRef} className="relative min-w-[120px] max-w-[280px] w-[30%]">
      <div className={`flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 border rounded-lg px-3 py-1.5 transition-colors ${overlayOpen ? 'border-zinc-400 dark:border-zinc-500' : 'border-zinc-200 dark:border-zinc-700'}`}>
        {isPending ? (
          <svg className="shrink-0 text-zinc-400 dark:text-zinc-500 animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 2a10 10 0 1 0 10 10" />
          </svg>
        ) : (
          <svg className="shrink-0 text-zinc-400 dark:text-zinc-500" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        )}
        <input
          type="text"
          aria-label="Search terms"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search terms…"
          className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none min-w-0"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear search"
            className="shrink-0 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {overlayOpen && (
        <div className="absolute right-0 top-full mt-2 w-[min(600px,90vw)] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="max-h-[70vh] overflow-y-auto p-4">
            {isPending ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Searching…</p>
            ) : (
              <TermSearchResults terms={results!} q={query} onTermExplained={refreshSearch} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
