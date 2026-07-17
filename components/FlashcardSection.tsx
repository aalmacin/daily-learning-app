'use client';

import { useState, useTransition } from 'react';
import { addFlashcard, editFlashcard, removeFlashcard, resetFlashcard, setTermFlashcardsDisabled } from '@/actions/flashcards';
import { hasClozeMarkers } from '@/lib/cloze';
import { SRS_INTERVALS, type Flashcard } from '@/lib/db';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

type Props = {
  termId: number;
  formattedNote: string;
  initialFlashcards: Flashcard[];
  flashcardsDisabled: boolean;
};

export function FlashcardSection({ termId, formattedNote, initialFlashcards, flashcardsDisabled }: Props) {
  const [flashcards, setFlashcards] = useState(initialFlashcards);
  const [disabled, setDisabled] = useState(flashcardsDisabled);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleCreate = () => {
    setContent(formattedNote);
    setIsCreating(true);
    setEditingId(null);
    setError(null);
  };

  const handleSave = () => {
    if (!content.trim() || !hasClozeMarkers(content)) {
      setError('Add at least one cloze deletion using __term__ markers.');
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        if (editingId !== null) {
          const updated = await editFlashcard(editingId, termId, content.trim());
          setFlashcards((prev) => prev.map((c) => (c.id === editingId ? updated : c)));
          setEditingId(null);
        } else {
          const card = await addFlashcard(termId, content.trim());
          setFlashcards((prev) => [card, ...prev]);
        }
        setIsCreating(false);
        setContent('');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save');
      }
    });
  };

  const handleEdit = (card: Flashcard) => {
    setContent(card.content);
    setEditingId(card.id);
    setIsCreating(true);
    setError(null);
  };

  const handleDelete = (id: number) => {
    startTransition(async () => {
      try {
        await removeFlashcard(id, termId);
        setFlashcards((prev) => prev.filter((c) => c.id !== id));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to delete');
      }
    });
  };

  const handleReset = (id: number) => {
    startTransition(async () => {
      try {
        const updated = await resetFlashcard(id, termId);
        setFlashcards((prev) => prev.map((c) => (c.id === id ? updated : c)));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to reset');
      }
    });
  };

  const handleToggleDisabled = () => {
    const next = !disabled;
    setDisabled(next);
    setError(null);
    startTransition(async () => {
      try {
        await setTermFlashcardsDisabled(termId, next);
      } catch (e) {
        setDisabled(!next);
        setError(e instanceof Error ? e.message : 'Failed to update');
      }
    });
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    const [, month, day] = dateStr.slice(0, 10).split('-').map(Number);
    return `${MONTH_NAMES[month - 1]} ${day}`;
  };

  return (
    <div className="space-y-3">
      <div className="mb-3 space-y-1">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-700 text-xs font-bold text-zinc-700 dark:text-zinc-200">
            4
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Flashcards
          </span>
          <label className="ml-auto flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 select-none cursor-pointer">
            <input
              type="checkbox"
              checked={!disabled}
              onChange={handleToggleDisabled}
              disabled={isPending}
              className="accent-zinc-900 dark:accent-zinc-100"
            />
            Include in flashcard review
          </label>
        </div>
        {disabled && (
          <p className="text-xs text-zinc-400 dark:text-zinc-500 pl-7">
            Disabled terms are hidden from review but keep their cards and schedule.
          </p>
        )}
      </div>

      {!isCreating && (
        <button
          onClick={handleCreate}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
        >
          Create Flashcard
        </button>
      )}

      {isCreating && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Wrap text with <code className="px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">__</code> to create cloze deletions. Example: <code className="px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">The __dog__ barks.</code>
          </p>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600 resize-none"
          />
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isPending ? 'Saving…' : editingId ? 'Update Card' : 'Save Card'}
            </button>
            <button
              onClick={() => { setIsCreating(false); setEditingId(null); setContent(''); setError(null); }}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {flashcards.length > 0 && (
        <div className="space-y-2 mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Cards ({flashcards.length})
          </p>
          {flashcards.map((card) => (
            <div key={card.id} className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 space-y-2">
              <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-6">
                {card.content.split(/(__[^_]+__)/g).map((segment, i) => {
                  if (segment.match(/^__(.+)__$/)) {
                    return (
                      <span key={i} className="inline-block w-16 border-b-2 border-zinc-400 dark:border-zinc-500 mx-1" />
                    );
                  }
                  return <span key={i}>{segment}</span>;
                })}
              </p>
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                <div className="flex flex-wrap gap-2 text-xs text-zinc-400 dark:text-zinc-500">
                  {card.next_review ? (
                    <>
                      <span>Interval: {SRS_INTERVALS[card.interval_step]}d</span>
                      <span>Next: {formatDate(card.next_review)}</span>
                      <span>Last: {formatDate(card.last_reviewed)}</span>
                    </>
                  ) : (
                    <span>New — not yet reviewed</span>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleEdit(card)}
                    disabled={isPending}
                    className="px-2 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleReset(card.id)}
                    disabled={isPending}
                    className="px-2 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
                  >
                    Reset
                  </button>
                  <button
                    onClick={() => handleDelete(card.id)}
                    disabled={isPending}
                    className="px-2 py-1 text-xs rounded border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-40 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
