'use client';

import { useState } from 'react';
import { VocabularyWordRow } from '@/components/VocabularyWordRow';
import { VocabularyForm } from '@/components/VocabularyForm';
import type { VocabularyWord } from '@/lib/db';

type Props = {
  words: VocabularyWord[];
  q: string;
  onWordAdded?: () => void;
};

export function VocabularySearchResults({ words, q, onWordAdded }: Props) {
  const [items, setItems] = useState(words);
  const [prevWords, setPrevWords] = useState(words);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [showAddForm, setShowAddForm] = useState(false);
  const [prevQ, setPrevQ] = useState(q);

  if (prevWords !== words) {
    setPrevWords(words);
    setItems(words);
  }

  if (prevQ !== q) {
    setPrevQ(q);
    setShowAddForm(false);
  }

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

  const isExactMatch = items.some((w) => w.word.toLowerCase() === q.toLowerCase());

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No vocabulary found for &ldquo;{q}&rdquo;.
        </p>
        <hr className="border-zinc-200 dark:border-zinc-800" />
        <VocabularyForm defaultWord={q} compact onAdded={onWordAdded} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {items.length} result{items.length !== 1 ? 's' : ''} for &ldquo;{q}&rdquo;
        </p>
        {!isExactMatch && !showAddForm && q.trim() && (
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="text-xs font-medium px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            Add &ldquo;{q}&rdquo;
          </button>
        )}
      </div>
      {showAddForm && (
        <VocabularyForm
          defaultWord={q}
          compact
          onAdded={() => {
            setShowAddForm(false);
            onWordAdded?.();
          }}
        />
      )}
      <div className="space-y-2">
        {items.map((w) => (
          <VocabularyWordRow
            key={w.id}
            word={w}
            isExpanded={expandedIds.has(w.id)}
            onToggleExpand={() => toggleExpanded(w.id)}
            onUpdated={(updated) =>
              setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
            }
            onDeleted={() => setItems((prev) => prev.filter((x) => x.id !== w.id))}
          />
        ))}
      </div>
    </div>
  );
}
