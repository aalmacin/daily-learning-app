'use client';

import { useState, useEffect, useTransition, useCallback } from 'react';
import { getReviewCards, submitReview } from '@/actions/flashcards';
import { SRS_INTERVALS, type Flashcard, type Category } from '@/lib/db';

type ReviewCard = Flashcard & { term_name: string };

type Props = {
  categories: Category[];
};

export function FlashcardsReview({ categories }: Props) {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [cards, setCards] = useState<ReviewCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const loadCards = useCallback(async (categoryNames?: string[]) => {
    setLoading(true);
    try {
      const result = await getReviewCards(categoryNames && categoryNames.length > 0 ? categoryNames : undefined);
      const shuffled = [...result.new].sort(() => Math.random() - 0.5);
      setCards([...result.due, ...shuffled]);
      setCurrentIndex(0);
      setShowBack(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCards(selectedCategories);
  }, [selectedCategories, loadCards]);

  const currentCard = cards[currentIndex] ?? null;
  const dueCount = cards.filter((c) => c.next_review !== null).length;
  const newCount = cards.filter((c) => c.next_review === null).length;

  const handleReview = (correct: boolean) => {
    if (!currentCard) return;
    startTransition(async () => {
      await submitReview(currentCard.id, correct);
      setShowBack(false);
      if (currentIndex < cards.length - 1) {
        setCurrentIndex((i) => i + 1);
      } else {
        setCards([]);
      }
    });
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value && !selectedCategories.includes(value)) {
      setSelectedCategories((prev) => [...prev, value]);
    }
  };

  const removeCategory = (name: string) => {
    setSelectedCategories((prev) => prev.filter((c) => c !== name));
  };

  const nextInterval = currentCard
    ? SRS_INTERVALS[Math.min(currentCard.interval_step + 1, SRS_INTERVALS.length - 1)]
    : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black p-4 flex items-center justify-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading cards…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black p-4">
      <div className="max-w-lg mx-auto space-y-4">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Flashcards</h1>

        {/* Category filter */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            onChange={handleCategoryChange}
            value=""
            className="px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 focus:outline-none"
          >
            <option value="">Filter by category…</option>
            {categories
              .filter((c) => !selectedCategories.includes(c.name))
              .map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
          </select>
          {selectedCategories.map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
            >
              {name}
              <button onClick={() => removeCategory(name)} className="font-bold">&times;</button>
            </span>
          ))}
        </div>

        {/* Empty state */}
        {cards.length === 0 && (
          <div className="flex items-center justify-center min-h-[200px]">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">All caught up!</p>
          </div>
        )}

        {/* Card display */}
        {currentCard && (
          <>
            {/* Progress */}
            <div className="flex justify-between text-xs text-zinc-400 dark:text-zinc-500">
              <span>Card {currentIndex + 1} of {cards.length}</span>
              <span>{dueCount} due / {newCount} new</span>
            </div>

            {/* Card */}
            <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl p-6 sm:p-8 min-h-[200px] flex items-center justify-center bg-white dark:bg-zinc-950">
              <p className="text-base sm:text-lg text-zinc-700 dark:text-zinc-300 leading-8 text-center whitespace-pre-wrap">
                {showBack ? (
                  currentCard.content.split(/(__[^_]+__)/g).map((segment, i) => {
                    const match = segment.match(/^__(.+)__$/);
                    if (match) {
                      return (
                        <span key={i} className="font-bold text-blue-600 dark:text-blue-400">
                          {match[1]}
                        </span>
                      );
                    }
                    return <span key={i}>{segment}</span>;
                  })
                ) : (
                  currentCard.content.split(/(__[^_]+__)/g).map((segment, i) => {
                    if (segment.match(/^__(.+)__$/)) {
                      return (
                        <span key={i} className="inline-block w-20 border-b-2 border-zinc-400 dark:border-zinc-500 mx-1" />
                      );
                    }
                    return <span key={i}>{segment}</span>;
                  })
                )}
              </p>
            </div>

            {/* Term reference (only on back) */}
            {showBack && (
              <p className="text-xs text-zinc-400 dark:text-zinc-500 text-center">
                From: {currentCard.term_name}
              </p>
            )}

            {/* Buttons */}
            {!showBack ? (
              <button
                onClick={() => setShowBack(true)}
                className="w-full py-3 text-sm sm:text-base font-medium rounded-lg bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
              >
                Show Answer
              </button>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-3">
                  <button
                    onClick={() => handleReview(false)}
                    disabled={isPending}
                    className="flex-1 py-3 text-sm sm:text-base font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 transition-colors"
                  >
                    Incorrect
                  </button>
                  <button
                    onClick={() => handleReview(true)}
                    disabled={isPending}
                    className="flex-1 py-3 text-sm sm:text-base font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 transition-colors"
                  >
                    Correct
                  </button>
                </div>
                <div className="flex justify-center gap-6 text-xs text-zinc-400 dark:text-zinc-500">
                  <span>Incorrect: 1 day</span>
                  <span>Correct: {nextInterval} days</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
