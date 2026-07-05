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

  const filtered = words.filter((w) => w.type === activeTab);

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
          No {activeTab === 'word' ? 'words' : 'idioms'} yet.
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
