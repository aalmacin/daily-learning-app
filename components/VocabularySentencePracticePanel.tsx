'use client';

import { useState, useEffect, useTransition } from 'react';
import { getVocabularySentenceHistory, submitVocabularySentenceAttemptAction } from '@/actions/vocabulary';
import type { VocabularySentenceAttempt } from '@/lib/db';

type Props = {
  wordId: number;
  word: string;
};

export function VocabularySentencePracticePanel({ wordId, word }: Props) {
  const [attempts, setAttempts] = useState<VocabularySentenceAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getVocabularySentenceHistory(wordId)
      .then((result) => {
        if (!cancelled) setAttempts(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Something went wrong');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [wordId]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const sentence = input.trim();
    if (!sentence) return;
    setInput('');
    setError(null);

    startTransition(async () => {
      try {
        const attempt = await submitVocabularySentenceAttemptAction(wordId, sentence);
        setAttempts((prev) => [...prev, attempt]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
        setInput(sentence);
      }
    });
  }

  const isDisabled = loading || isPending;

  return (
    <div>
      {attempts.length > 0 && (
        <div className="flex flex-col gap-2 max-h-64 overflow-y-auto px-1 py-1">
          {attempts.map((attempt) => (
            <div
              key={attempt.id}
              className="text-xs rounded-lg px-3 py-2 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
            >
              <p className="text-zinc-800 dark:text-zinc-200">
                <span
                  className={
                    attempt.is_correct
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }
                >
                  {attempt.is_correct ? '✓' : '✗'}
                </span>{' '}
                {attempt.sentence}
              </p>
              <p className="mt-1 text-zinc-500 dark:text-zinc-400 leading-relaxed">{attempt.feedback}</p>
            </div>
          ))}
        </div>
      )}
      {error && <p className="px-1 py-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
      <form onSubmit={handleSubmit} className="pt-2 flex gap-2">
        <input
          type="text"
          aria-label={`Write a sentence using ${word}`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={loading ? 'Loading…' : `Use "${word}" in a sentence…`}
          disabled={isDisabled}
          className="flex-1 px-2.5 py-1.5 text-xs border border-zinc-200 dark:border-zinc-700 rounded-md bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!input.trim() || isDisabled}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? '…' : 'Check'}
        </button>
      </form>
    </div>
  );
}
