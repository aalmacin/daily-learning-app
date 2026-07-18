'use client';

import { useState, useEffect, useTransition } from 'react';
import { askVocabularyQuestion, getVocabularyChat } from '@/actions/vocabulary';
import type { VocabularyChatMessage } from '@/lib/db';

type Props = {
  wordId: number;
  word: string;
};

export function VocabularyChatPanel({ wordId, word }: Props) {
  const [messages, setMessages] = useState<VocabularyChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getVocabularyChat(wordId)
      .then((result) => {
        if (!cancelled) setMessages(result);
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
    const question = input.trim();
    if (!question) return;
    setInput('');
    setError(null);

    startTransition(async () => {
      try {
        const result = await askVocabularyQuestion(wordId, question);
        setMessages(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
        setInput(question);
      }
    });
  }

  const isDisabled = loading || isPending;

  return (
    <div>
      {messages.length > 0 && (
        <div className="px-1 py-1 flex flex-col gap-2 max-h-64 overflow-y-auto">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`text-xs rounded-lg px-3 py-2 max-w-[80%] leading-relaxed ${
                msg.role === 'user'
                  ? 'self-end bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200'
                  : 'self-start bg-cyan-50 dark:bg-cyan-950 text-cyan-900 dark:text-cyan-100'
              }`}
            >
              {msg.content}
            </div>
          ))}
        </div>
      )}
      {error && <p className="px-1 py-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
      <form onSubmit={handleSubmit} className="pt-2 flex gap-2 items-end">
        <textarea
          rows={2}
          aria-label={`Ask a question about ${word}`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={loading ? 'Loading…' : `Ask about ${word}…`}
          disabled={isDisabled}
          className="flex-1 px-2.5 py-1.5 text-xs border border-zinc-200 dark:border-zinc-700 rounded-md bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600 disabled:opacity-50 resize-y"
        />
        <button
          type="submit"
          disabled={!input.trim() || isDisabled}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? '…' : 'Ask'}
        </button>
      </form>
    </div>
  );
}
