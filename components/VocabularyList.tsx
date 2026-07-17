'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@tanstack/react-store';
import { VocabularyWordRow } from '@/components/VocabularyWordRow';
import {
  vocabStore,
  dismissWord,
  retryVocabResult,
  processVocabularyWord,
  type DoneVocabResult,
  type PendingVocabResult,
  type ErrorVocabResult,
} from '@/store/vocabStore';
import type { VocabularyWord } from '@/lib/db';

type Props = {
  initialWords: VocabularyWord[];
};

function DismissButton({ onDismiss }: { onDismiss: () => void }) {
  return (
    <button
      onClick={onDismiss}
      aria-label="Dismiss"
      className="ml-auto shrink-0 rounded p-1 text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}

function PendingRow({ entry }: { entry: PendingVocabResult }) {
  return (
    <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-950 px-4 py-3 flex items-center gap-3">
      <svg
        className="animate-spin h-4 w-4 text-zinc-400 dark:text-zinc-500 shrink-0"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{entry.word}</span>
      <span className="text-sm text-zinc-400 dark:text-zinc-500">Analyzing…</span>
      <DismissButton onDismiss={() => dismissWord(entry.key)} />
    </div>
  );
}

function ErrorRow({ entry }: { entry: ErrorVocabResult }) {
  const handleRetry = () => {
    retryVocabResult(entry.key);
    processVocabularyWord(entry.key, entry.word, entry.type);
  };

  return (
    <div className="border border-red-200 dark:border-red-900 rounded-xl bg-white dark:bg-zinc-950 px-4 py-3 flex flex-col gap-2">
      <div className="flex items-center">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{entry.word}</span>
        <DismissButton onDismiss={() => dismissWord(entry.key)} />
      </div>
      <p className="text-sm text-red-600 dark:text-red-400">{entry.error}</p>
      <button
        type="button"
        onClick={handleRetry}
        className="self-start text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        Retry
      </button>
    </div>
  );
}

export function VocabularyList({ initialWords }: Props) {
  const [words, setWords] = useState(initialWords);
  const [activeTab, setActiveTab] = useState<'word' | 'idiom'>('word');
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState('');

  const activeWords = useStore(vocabStore, (s) => s.activeWords);

  // Merge newly-completed store entries into the persisted list, then drop them from the store.
  useEffect(() => {
    const doneEntries = activeWords.filter((w): w is DoneVocabResult => w.status === 'done');
    if (doneEntries.length === 0) return;

    setWords((prev) => {
      const existingIds = new Set(prev.map((w) => w.id));
      const newOnes = doneEntries.filter((w) => !existingIds.has(w.id));
      if (newOnes.length === 0) return prev;
      return [...newOnes, ...prev];
    });

    doneEntries.forEach((entry) => dismissWord(entry.key));
  }, [activeWords]);

  const trimmedQuery = query.trim();
  const filtered = words.filter(
    (w) =>
      w.type === activeTab &&
      (trimmedQuery === '' || w.word.toLowerCase().includes(trimmedQuery.toLowerCase())),
  );
  // Pending/error rows aren't search-filtered: hiding a word the user just added because
  // it doesn't match an unrelated search query would be confusing.
  const pendingForTab = activeWords.filter(
    (w): w is PendingVocabResult | ErrorVocabResult => w.status !== 'done' && w.type === activeTab
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
      {filtered.length === 0 && pendingForTab.length === 0 ? (
        <p className="text-sm text-zinc-400 dark:text-zinc-500 text-center py-8">
          {trimmedQuery
            ? `No ${activeTab === 'word' ? 'word' : 'idiom'}s match "${trimmedQuery}".`
            : `No ${activeTab === 'word' ? 'words' : 'idioms'} yet.`}
        </p>
      ) : (
        <div className="space-y-2">
          {pendingForTab.map((entry) =>
            entry.status === 'processing' ? (
              <PendingRow key={entry.key} entry={entry} />
            ) : (
              <ErrorRow key={entry.key} entry={entry} />
            )
          )}
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
