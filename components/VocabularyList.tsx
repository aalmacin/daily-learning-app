'use client';

import { useState } from 'react';
import { VocabularyWordRow } from '@/components/VocabularyWordRow';
import type { VocabularyWord } from '@/lib/db';

type Props = {
  initialWords: VocabularyWord[];
};

export function VocabularyList({ initialWords }: Props) {
  const [words, setWords] = useState(initialWords);
  const [activeTab, setActiveTab] = useState<'word' | 'idiom'>('word');
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState('');

  const trimmedQuery = query.trim();
  const filtered = words.filter(
    (w) =>
      w.type === activeTab &&
      (trimmedQuery === '' || w.word.toLowerCase().includes(trimmedQuery.toLowerCase())),
  );

  const toggleExpanded = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 max-w-sm">
        <svg className="shrink-0 text-zinc-400 dark:text-zinc-500" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          aria-label="Search vocabulary"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search vocabulary…"
          className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none min-w-0"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
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

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {(['word', 'idiom'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'border-b-2 border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-50'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            {tab === 'word' ? 'Words' : 'Idioms'}
            <span className="ml-1.5 text-xs text-zinc-400 dark:text-zinc-500">
              ({words.filter((w) => w.type === tab).length})
            </span>
          </button>
        ))}
      </div>

      {/* Word list */}
      {filtered.length === 0 ? (
        <p className="text-sm text-zinc-400 dark:text-zinc-500 text-center py-8">
          {trimmedQuery
            ? `No ${activeTab === 'word' ? 'word' : 'idiom'}s match "${trimmedQuery}".`
            : `No ${activeTab === 'word' ? 'words' : 'idioms'} yet.`}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((w) => (
            <VocabularyWordRow
              key={w.id}
              word={w}
              isExpanded={expandedIds.has(w.id)}
              onToggleExpand={() => toggleExpanded(w.id)}
              onUpdated={(updated) =>
                setWords((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
              }
              onDeleted={() => {
                setWords((prev) => prev.filter((x) => x.id !== w.id));
                setExpandedIds((prev) => {
                  if (!prev.has(w.id)) return prev;
                  const next = new Set(prev);
                  next.delete(w.id);
                  return next;
                });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
