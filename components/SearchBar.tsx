'use client';

import { useState, useEffect, useRef, useTransition, useCallback } from 'react';
import { searchTerms } from '@/actions/terms';
import { searchVocabulary } from '@/actions/vocabulary';
import { TermSearchResults } from '@/components/TermSearchResults';
import { VocabularySearchResults } from '@/components/VocabularySearchResults';
import type { Term, VocabularyWord } from '@/lib/db';

type Scope = 'term' | 'vocabulary';

export function SearchBar() {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('term');
  const [termResults, setTermResults] = useState<Term[] | null>(null);
  const [vocabResults, setVocabResults] = useState<VocabularyWord[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const refreshQueryRef = useRef<string>('');
  const prevQueryRef = useRef<string>(query);

  const results = scope === 'term' ? termResults : vocabResults;
  const overlayOpen = query.trim() !== '' && (results !== null || isPending);

  useEffect(() => {
    refreshQueryRef.current = '';
  }, [query, scope]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    // A pure scope switch (query unchanged) should search immediately —
    // only actual typing gets the 2s debounce, otherwise the dropdown
    // (and the scope toggle inside it) briefly closes while nothing is
    // pending yet.
    const queryChanged = prevQueryRef.current !== query;
    prevQueryRef.current = query;
    let stale = false;
    const timer = setTimeout(() => {
      startTransition(async () => {
        if (scope === 'term') {
          const terms = await searchTerms(trimmed);
          if (!stale) setTermResults(terms);
        } else {
          const words = await searchVocabulary(trimmed);
          if (!stale) setVocabResults(words);
        }
      });
    }, queryChanged ? 2000 : 0);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query, scope]);

  useEffect(() => {
    if (!overlayOpen) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setTermResults(null);
        setVocabResults(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [overlayOpen]);

  function handleClear() {
    setQuery('');
    setTermResults(null);
    setVocabResults(null);
  }

  function handleScopeChange(next: Scope) {
    setScope(next);
  }

  const refreshSearch = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    refreshQueryRef.current = trimmed;
    startTransition(async () => {
      const terms = await searchTerms(trimmed);
      if (refreshQueryRef.current === trimmed) setTermResults(terms);
    });
  }, [query]);

  const refreshVocabSearch = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    refreshQueryRef.current = trimmed;
    startTransition(async () => {
      const words = await searchVocabulary(trimmed);
      if (refreshQueryRef.current === trimmed) setVocabResults(words);
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
          aria-label={scope === 'term' ? 'Search terms' : 'Search vocabulary'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={scope === 'term' ? 'Search terms…' : 'Search vocabulary…'}
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
          <div className="flex gap-1 px-4 pt-3">
            {(['term', 'vocabulary'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleScopeChange(s)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  scope === s
                    ? 'bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900'
                    : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                {s === 'term' ? 'Terms' : 'Vocabulary'}
              </button>
            ))}
          </div>
          <div className="max-h-[70vh] overflow-y-auto p-4">
            {isPending ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Searching…</p>
            ) : scope === 'term' ? (
              <TermSearchResults terms={termResults!} q={query} onTermExplained={refreshSearch} />
            ) : (
              <VocabularySearchResults words={vocabResults!} q={query} onWordAdded={refreshVocabSearch} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
