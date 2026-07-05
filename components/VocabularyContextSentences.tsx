'use client';

import type { ContextSentence } from '@/lib/db';

type Props = {
  context: string;
  contextSentences: ContextSentence[] | null;
  word: string;
  onSetMain?: (index: number) => void;
};

export function VocabularyContextSentences({ context, contextSentences, word, onSetMain }: Props) {
  if (!contextSentences || contextSentences.length === 0) {
    return (
      <div className="pt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">
          Context
        </h4>
        <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
          {context}
        </p>
      </div>
    );
  }

  return (
    <div className="pt-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">
        Context
      </h4>
      <ul className="space-y-2">
        {contextSentences.map((cs, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
            <div className="flex-1 whitespace-pre-wrap">
              {cs.sentence.replace('__blank__', word)}
              <span className="ml-2 text-xs text-zinc-400 dark:text-zinc-500">({cs.setting})</span>
              {i === 0 && (
                <span className="ml-2 inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                  Main
                </span>
              )}
            </div>
            {onSetMain && i !== 0 && (
              <button
                type="button"
                onClick={() => onSetMain(i)}
                className="shrink-0 text-xs text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
              >
                Set as main
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
