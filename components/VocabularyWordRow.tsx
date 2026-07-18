'use client';

import { useTransition } from 'react';
import { removeVocabularyWord, resetVocabularyReviewAction, setWordMainContext, regenerateVocabularyWord, setVocabularyWordFlashcardsDisabled } from '@/actions/vocabulary';
import { SRS_INTERVALS, type VocabularyWord } from '@/lib/db';
import { VocabularyImage } from '@/components/VocabularyImage';
import { VocabularyContextSentences } from '@/components/VocabularyContextSentences';
import { VocabularyAssistant } from '@/components/VocabularyAssistant';
import { SpeakButton } from '@/components/SpeakButton';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

type Props = {
  word: VocabularyWord;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdated: (updated: VocabularyWord) => void;
  onDeleted: () => void;
};

export function VocabularyWordRow({ word: w, isExpanded, onToggleExpand, onUpdated, onDeleted }: Props) {
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    if (!confirm('Delete this word?')) return;
    startTransition(async () => {
      await removeVocabularyWord(w.id);
      onDeleted();
    });
  };

  const handleReset = () => {
    startTransition(async () => {
      const updated = await resetVocabularyReviewAction(w.id);
      onUpdated(updated);
    });
  };

  const handleSetMain = (index: number) => {
    startTransition(async () => {
      const updated = await setWordMainContext(w.id, index);
      onUpdated(updated);
    });
  };

  const handleRegenerate = () => {
    if (!confirm('Regenerate this word’s definition, example sentences, and image? This overwrites the current version.')) return;
    startTransition(async () => {
      const updated = await regenerateVocabularyWord(w.id);
      onUpdated(updated);
    });
  };

  const handleToggleDisabled = () => {
    startTransition(async () => {
      const updated = await setVocabularyWordFlashcardsDisabled(w.id, !w.flashcards_disabled);
      onUpdated(updated);
    });
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    const [, month, day] = dateStr.slice(0, 10).split('-').map(Number);
    return `${MONTH_NAMES[month - 1]} ${day}`;
  };

  return (
    <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-950 overflow-hidden">
      {/* Header */}
      <div className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors">
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex-1 flex items-center gap-2 text-left min-w-0"
        >
          <span className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
            {w.word}
          </span>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <SpeakButton text={w.word} label={`Read "${w.word}" aloud`} />
          <button
            type="button"
            onClick={onToggleExpand}
            className="p-1 text-zinc-400 dark:text-zinc-500 text-sm"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? '−' : '+'}
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-zinc-100 dark:border-zinc-800">
          <Section title="Definition" content={w.definition} />
          <VocabularyContextSentences
            context={w.context}
            contextSentences={w.context_sentences}
            word={w.word}
            onSetMain={handleSetMain}
          />
          <Section title="Connections" content={w.connections} />
          <Section title="Morphology" content={w.morphology} />
          <VocabularyImage
            wordId={w.id}
            word={w.word}
            imageUrl={w.image_url}
            imageModel={w.image_model}
            onGenerated={(imageUrl, imageModel) => onUpdated({ ...w, image_url: imageUrl, image_model: imageModel })}
          />
          <VocabularyAssistant wordId={w.id} word={w.word} />
          <div className="pt-2 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
            <div className="flex flex-wrap gap-2 text-xs text-zinc-400 dark:text-zinc-500">
              {w.next_review ? (
                <>
                  <span>Interval: {SRS_INTERVALS[w.interval_step]}d</span>
                  <span>Next: {formatDate(w.next_review)}</span>
                  <span>Last: {formatDate(w.last_reviewed)}</span>
                </>
              ) : (
                <span>New — not yet reviewed</span>
              )}
            </div>
            <div className="flex gap-2 items-center">
              <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={!w.flashcards_disabled}
                  onChange={handleToggleDisabled}
                  disabled={isPending}
                  className="accent-zinc-900 dark:accent-zinc-100"
                />
                In flashcard review
              </label>
              <button
                onClick={handleRegenerate}
                disabled={isPending}
                className="px-2 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
              >
                Regenerate
              </button>
              <button
                onClick={handleReset}
                disabled={isPending}
                className="px-2 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
              >
                Reset
              </button>
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-40"
              >
                Delete
              </button>
            </div>
          </div>
          {w.flashcards_disabled && (
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              Hidden from flashcard review. Its schedule is kept.
            </p>
          )}
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
