'use client';

import { useState, useEffect } from 'react';
import { getTermDetailForList } from '@/actions/termList';
import type { TermDetailData } from '@/actions/termList';
import { TermDetailPage } from '@/components/TermDetailPage';

export function TermExpandedPanel({ termId }: { termId: number }) {
  const [termData, setTermData] = useState<TermDetailData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    getTermDetailForList(termId)
      .then(setTermData)
      .catch((e) => setFetchError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setIsLoading(false));
  }, [termId]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-6 text-sm text-zinc-500 dark:text-zinc-400">
        <svg
          className="animate-spin shrink-0"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        Loading…
      </div>
    );
  }
  if (fetchError) {
    return <p className="px-4 py-4 text-sm text-red-600 dark:text-red-400">{fetchError}</p>;
  }
  if (!termData) return null;
  return (
    <TermDetailPage
      term={termData.term}
      initialRefinements={termData.refinements}
      initialChats={termData.chats}
      explainedAt={termData.explainedAt}
      initialFlashcards={termData.flashcards}
    />
  );
}
