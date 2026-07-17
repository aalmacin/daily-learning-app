'use client';

import { useState, useEffect, useTransition, useCallback } from 'react';
import { getVocabularyReviewCards, submitVocabularyReview, setWordMainContext } from '@/actions/vocabulary';
import { SRS_INTERVALS, type VocabularyWord } from '@/lib/db';
import { VocabularyImage } from '@/components/VocabularyImage';
import { VocabularyContextSentences } from '@/components/VocabularyContextSentences';
import { VocabularyAssistant } from '@/components/VocabularyAssistant';
import { getFlashcardClue } from '@/lib/vocabulary-clue';

export function VocabularyFlashcards() {
  const [filter, setFilter] = useState<'all' | 'word' | 'idiom'>('all');
  const [cards, setCards] = useState<VocabularyWord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const loadCards = useCallback(async (type?: 'word' | 'idiom') => {
    setLoading(true);
    try {
      const result = await getVocabularyReviewCards(type);
      const shuffled = [...result.new].sort(() => Math.random() - 0.5);
      setCards([...result.due, ...shuffled]);
      setCurrentIndex(0);
      setShowBack(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCards(filter === 'all' ? undefined : filter);
  }, [filter, loadCards]);

  const current = cards[currentIndex] ?? null;
  const frontSentence = current?.context_sentences?.[0]?.sentence ?? current?.flashcard_sentence ?? '';
  const clue = current ? getFlashcardClue(current.word, current.definition) : '';
  const remainingCards = cards.slice(currentIndex);
  const dueCount = remainingCards.filter((c) => c.next_review !== null).length;
  const newCount = remainingCards.filter((c) => c.next_review === null).length;

  const nextInterval = current
    ? SRS_INTERVALS[Math.min(current.interval_step + 1, SRS_INTERVALS.length - 1)]
    : null;

  const handleFilterChange = (newFilter: 'all' | 'word' | 'idiom') => {
    setFilter(newFilter);
  };

  const handleShowBack = () => setShowBack(true);

  const handleImageGenerated = (imageUrl: string, imageModel: string) => {
    if (!current) return;
    setCards((prev) =>
      prev.map((c) => (c.id === current.id ? { ...c, image_url: imageUrl, image_model: imageModel } : c)),
    );
  };

  const handleSetMain = (index: number) => {
    if (!current) return;
    startTransition(async () => {
      const updated = await setWordMainContext(current.id, index);
      setCards((prev) => prev.map((c) => (c.id === current.id ? updated : c)));
    });
  };

  const handleReview = (correct: boolean) => {
    if (!current) return;
    startTransition(async () => {
      await submitVocabularyReview(current.id, correct);
      setShowBack(false);
      if (currentIndex < cards.length - 1) {
        setCurrentIndex((i) => i + 1);
      } else {
        setCards([]);
      }
    });
  };

  if (loading) {
    return (
      <div className="min-h-[300px] flex items-center justify-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading cards…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex gap-2">
        {(['all', 'word', 'idiom'] as const).map((opt) => (
          <button
            key={opt}
            onClick={() => handleFilterChange(opt)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              filter === opt
                ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            }`}
          >
            {opt === 'all' ? 'All' : opt === 'word' ? 'Words' : 'Idioms'}
          </button>
        ))}
      </div>

      {cards.length === 0 ? (
        <div className="min-h-[200px] flex items-center justify-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">All caught up!</p>
        </div>
      ) : (
        current && (
          <>
            {/* Progress */}
            <div className="flex justify-between text-xs text-zinc-400 dark:text-zinc-500">
              <span>Card {currentIndex + 1} of {cards.length}</span>
              <span>{dueCount} due / {newCount} new</span>
            </div>

            {/* Card */}
            <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-950 overflow-hidden">
              {/* Front */}
              <div className="p-6 sm:p-8 min-h-[160px] flex flex-col items-center justify-center">
                {/* Type pill */}
                <div className="mb-4">
                  <span className="inline-block px-3 py-1 text-xs font-medium rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                    {current.type === 'word' ? 'Word' : 'Idiom'}
                  </span>
                </div>
                <p className="text-base sm:text-lg text-zinc-700 dark:text-zinc-300 leading-8 text-center">
                  {!showBack ? (
                    renderCloze(frontSentence)
                  ) : (
                    renderComplete(frontSentence, current.word)
                  )}
                </p>
                {clue && (
                  <p className="mt-2 text-sm italic text-zinc-400 dark:text-zinc-500 text-center">
                    {clue}
                  </p>
                )}
                {current.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={current.image_url}
                    alt={`Illustration for ${current.word}`}
                    width={1024}
                    height={1024}
                    className="mt-3 w-full max-w-[240px] aspect-square object-contain rounded-lg border border-zinc-200 dark:border-zinc-700"
                  />
                )}
              </div>

              {/* Back details */}
              {showBack && (
                <div className="border-t border-zinc-100 dark:border-zinc-800 px-6 sm:px-8 pb-6 space-y-4">
                  <div className="pt-4 text-center">
                    <span className="inline-block px-3 py-1 text-sm font-semibold rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                      {current.word}
                    </span>
                    <span className="ml-2 text-xs text-zinc-400 dark:text-zinc-500">
                      {current.type}
                    </span>
                  </div>
                  <DetailSection title="Definition" content={current.definition} />
                  <VocabularyContextSentences
                    context={current.context}
                    contextSentences={current.context_sentences}
                    word={current.word}
                    onSetMain={handleSetMain}
                  />
                  <DetailSection title="Connections" content={current.connections} />
                  <DetailSection title="Morphology" content={current.morphology} />
                  <VocabularyImage
                    key={current.id}
                    wordId={current.id}
                    word={current.word}
                    imageUrl={current.image_url}
                    imageModel={current.image_model}
                    onGenerated={handleImageGenerated}
                  />
                  <VocabularyAssistant key={current.id} wordId={current.id} word={current.word} />
                </div>
              )}
            </div>

            {/* Actions */}
            {!showBack ? (
              <button
                onClick={handleShowBack}
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
        )
      )}
    </div>
  );
}

function renderCloze(sentence: string) {
  return sentence.split(/__blank__/g).map((part, i, arr) => (
    <span key={i}>
      {part}
      {i < arr.length - 1 && (
        <span className="inline-block w-24 border-b-2 border-zinc-400 dark:border-zinc-500 mx-1" />
      )}
    </span>
  ));
}

function renderComplete(sentence: string, word: string) {
  return sentence.split(/__blank__/g).map((part, i, arr) => (
    <span key={i}>
      {part}
      {i < arr.length - 1 && (
        <span className="font-bold text-blue-600 dark:text-blue-400">{word}</span>
      )}
    </span>
  ));
}

function DetailSection({ title, content }: { title: string; content: string }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">
        {title}
      </h4>
      <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
        {content}
      </p>
    </div>
  );
}
