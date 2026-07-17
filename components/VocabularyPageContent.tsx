'use client';

import { useState } from 'react';
import Link from 'next/link';
import { VocabularyList } from '@/components/VocabularyList';
import { VocabularyForm } from '@/components/VocabularyForm';
import type { VocabularyWord } from '@/lib/db';

type Props = {
  initialWords: VocabularyWord[];
};

export function VocabularyPageContent({ initialWords }: Props) {
  const [activeTab, setActiveTab] = useState<'word' | 'idiom'>('word');
  const [counts, setCounts] = useState({ word: 0, idiom: 0 });

  return (
    <div className="flex flex-col gap-8">
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
              ({counts[tab]})
            </span>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Vocabulary
        </h1>
        <Link
          href="/vocabulary/flashcards"
          className="px-3 py-1.5 text-sm font-medium rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
        >
          Flashcards
        </Link>
      </div>
      <VocabularyForm type={activeTab} />
      <VocabularyList initialWords={initialWords} activeTab={activeTab} onCountsChange={setCounts} />
    </div>
  );
}
