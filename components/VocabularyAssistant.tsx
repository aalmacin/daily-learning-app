'use client';

import { useState } from 'react';
import { VocabularyChatPanel } from '@/components/VocabularyChatPanel';
import { VocabularySentencePracticePanel } from '@/components/VocabularySentencePracticePanel';

type Props = {
  wordId: number;
  word: string;
};

export function VocabularyAssistant({ wordId, word }: Props) {
  const [activeTab, setActiveTab] = useState<'chat' | 'practice' | null>(null);

  return (
    <div className="pt-2 space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setActiveTab((prev) => (prev === 'chat' ? null : 'chat'))}
          className={`flex-1 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
            activeTab === 'chat'
              ? 'border-cyan-500 bg-cyan-50 text-cyan-700 dark:border-cyan-600 dark:bg-cyan-950 dark:text-cyan-300'
              : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
          }`}
        >
          Ask AI
        </button>
        <button
          type="button"
          onClick={() => setActiveTab((prev) => (prev === 'practice' ? null : 'practice'))}
          className={`flex-1 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
            activeTab === 'practice'
              ? 'border-cyan-500 bg-cyan-50 text-cyan-700 dark:border-cyan-600 dark:bg-cyan-950 dark:text-cyan-300'
              : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
          }`}
        >
          Practice a sentence
        </button>
      </div>
      {activeTab === 'chat' && (
        <div className="border border-cyan-500 dark:border-cyan-600 rounded-lg overflow-hidden px-3 py-2">
          <VocabularyChatPanel wordId={wordId} word={word} />
        </div>
      )}
      {activeTab === 'practice' && (
        <div className="border border-cyan-500 dark:border-cyan-600 rounded-lg overflow-hidden px-3 py-2">
          <VocabularySentencePracticePanel wordId={wordId} word={word} />
        </div>
      )}
    </div>
  );
}
