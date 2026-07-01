'use client';

import { useState, useTransition } from 'react';
import { addVocabularyWord, removeVocabularyWord } from '@/actions/vocabulary';
import type { VocabularyWord } from '@/lib/db';

type Props = {
  initialWords: VocabularyWord[];
};

export function VocabularyList({ initialWords }: Props) {
  const [words, setWords] = useState(initialWords);
  const [activeTab, setActiveTab] = useState<'word' | 'idiom'>('word');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [input, setInput] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const filtered = words.filter((w) => w.type === activeTab);

  const handleAdd = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      try {
        const entry = await addVocabularyWord(trimmed, activeTab);
        setWords((prev) => [entry, ...prev]);
        setInput('');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to add');
      }
    });
  };

  const handleDelete = (id: number) => {
    startTransition(async () => {
      await removeVocabularyWord(id);
      setWords((prev) => prev.filter((w) => w.id !== id));
      if (expandedId === id) setExpandedId(null);
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

      {/* Add form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleAdd();
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={activeTab === 'word' ? 'Enter a word…' : 'Enter an idiom…'}
          disabled={isPending}
          className="flex-1 px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isPending || !input.trim()}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-40 transition-colors"
        >
          {isPending ? 'Adding…' : 'Add'}
        </button>
      </form>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {/* Word list */}
      {filtered.length === 0 ? (
        <p className="text-sm text-zinc-400 dark:text-zinc-500 text-center py-8">
          No {activeTab === 'word' ? 'words' : 'idioms'} yet. Add one above.
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((w) => {
            const isExpanded = expandedId === w.id;
            return (
              <div
                key={w.id}
                className="border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-950 overflow-hidden"
              >
                {/* Header */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : w.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
                >
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {w.word}
                  </span>
                  <span className="text-zinc-400 dark:text-zinc-500 text-sm">
                    {isExpanded ? '−' : '+'}
                  </span>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-4 border-t border-zinc-100 dark:border-zinc-800">
                    <Section title="Definition" content={w.definition} />
                    <Section title="Context" content={w.context} />
                    <Section title="Connections" content={w.connections} />
                    <Section title="Morphology" content={w.morphology} />
                    <div className="pt-2">
                      <button
                        onClick={() => handleDelete(w.id)}
                        disabled={isPending}
                        className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Section({ title, content }: { title: string; content: string }) {
  return (
    <div className="pt-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">
        {title}
      </h4>
      <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
        {content}
      </p>
    </div>
  );
}
