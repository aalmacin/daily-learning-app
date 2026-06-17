'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import type { Term, ChatMessage } from '@/lib/db';
import { createAttempt } from '@/actions/refinements';
import { askQuestion } from '@/actions/chat';
import { ResearchTabs } from './ResearchTabs';

type Props = {
  terms: Term[];
  q: string;
};

type ChatState = {
  refinementId: number;
  messages: ChatMessage[];
};

function PriorityBadge({ priority }: { priority: Term['priority'] }) {
  const styles: Record<Term['priority'], string> = {
    High: 'text-cyan-700 bg-cyan-50 border-cyan-200 dark:text-cyan-300 dark:bg-cyan-950 dark:border-cyan-800',
    Medium: 'text-yellow-700 bg-yellow-50 border-yellow-200 dark:text-yellow-300 dark:bg-yellow-950 dark:border-yellow-800',
    Low: 'text-zinc-600 bg-zinc-100 border-zinc-200 dark:text-zinc-400 dark:bg-zinc-800 dark:border-zinc-700',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border whitespace-nowrap ${styles[priority]}`}>
      {priority}
    </span>
  );
}

function ResearchChat({ term }: { term: Term }) {
  const [chat, setChat] = useState<ChatState | null>(null);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question) return;
    setInput('');
    setError(null);

    startTransition(async () => {
      try {
        if (!chat) {
          const refinement = await createAttempt(term.id);
          const messages = await askQuestion(refinement.id, question);
          setChat({ refinementId: refinement.id, messages });
        } else {
          const messages = await askQuestion(chat.refinementId, question);
          setChat((prev) => prev ? { ...prev, messages } : prev);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
        setInput(question);
      }
    });
  }

  return (
    <div>
      {chat && chat.messages.length > 0 && (
        <div className="px-1 py-1 flex flex-col gap-2 max-h-64 overflow-y-auto">
          {chat.messages.map((msg) => (
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
      <form onSubmit={handleSubmit} className="pt-2 flex gap-2">
        <input
          type="text"
          aria-label={`Ask a question about ${term.name}`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Ask about ${term.name}…`}
          disabled={isPending}
          className="flex-1 px-2.5 py-1.5 text-xs border border-zinc-200 dark:border-zinc-700 rounded-md bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!input.trim() || isPending}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? '…' : 'Ask'}
        </button>
      </form>
    </div>
  );
}

function TermCard({ term }: { term: Term }) {
  const [expanded, setExpanded] = useState(false);
  const [researchOpen, setResearchOpen] = useState(false);

  return (
    <div className={`flex flex-col border rounded-lg overflow-hidden bg-white dark:bg-zinc-900 transition-colors ${researchOpen ? 'border-cyan-500 dark:border-cyan-600' : 'border-zinc-200 dark:border-zinc-800'}`}>
      {/* Header — always visible, click to expand */}
      <button
        type="button"
        onClick={() => setExpanded((o) => !o)}
        className="px-4 py-3 flex items-center gap-2 flex-wrap text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
      >
        <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-50 flex-1">{term.name}</span>
        {term.explained && (
          <span className="text-xs text-green-700 bg-green-50 border border-green-200 dark:text-green-300 dark:bg-green-950 dark:border-green-800 px-2 py-0.5 rounded-full whitespace-nowrap">
            ✓ Explained
          </span>
        )}
        <PriorityBadge priority={term.priority} />
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className={`shrink-0 text-zinc-400 dark:text-zinc-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <>
          {/* Body */}
          <div className="flex flex-col gap-3 px-4 py-3 border-t border-zinc-100 dark:border-zinc-800">
            <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{term.content}</p>

            {researchOpen && (
              <div className="border border-cyan-500 dark:border-cyan-600 rounded-lg overflow-hidden">
                <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Research</span>
                </div>
                <div className="px-3 py-2">
                  <ResearchTabs
                    termId={term.id}
                    initialMarkdown={term.notes}
                    accent="cyan"
                    chat={<ResearchChat term={term} />}
                  />
                </div>
              </div>
            )}

            {term.categories.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {term.categories.map((cat) => (
                  <span
                    key={cat}
                    className="text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-2 py-0.5 rounded-full"
                  >
                    {cat}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div className="px-4 py-2 border-t border-zinc-100 dark:border-zinc-800 flex gap-2">
            <button
              type="button"
              onClick={() => setResearchOpen((o) => !o)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                researchOpen
                  ? 'border-cyan-500 bg-cyan-50 text-cyan-700 dark:border-cyan-600 dark:bg-cyan-950 dark:text-cyan-300'
                  : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
              }`}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Research
            </button>
            <Link
              href={`/terms/${term.id}`}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-medium transition-colors"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              View
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

export function TermSearchResults({ terms, q }: Props) {
  if (terms.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        No terms found for &ldquo;{q}&rdquo;.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {terms.length} result{terms.length !== 1 ? 's' : ''} for &ldquo;{q}&rdquo;
      </p>
      <div className="grid grid-cols-1 gap-3">
        {terms.map((term) => (
          <TermCard key={term.id} term={term} />
        ))}
      </div>
    </div>
  );
}
