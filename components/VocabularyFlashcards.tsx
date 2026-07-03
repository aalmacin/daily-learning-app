'use client';

import { useState, useMemo } from 'react';
import type { VocabularyWord } from '@/lib/db';
import { generateWordImage } from '@/actions/vocabulary';
import { IMAGE_MODELS, DEFAULT_IMAGE_MODEL } from '@/lib/imageModels';

type Props = {
  words: VocabularyWord[];
};

export function VocabularyFlashcards({ words }: Props) {
  const [filter, setFilter] = useState<'all' | 'word' | 'idiom'>('all');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [wordState, setWordState] = useState<VocabularyWord[]>(words);
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_IMAGE_MODEL);
  const [generating, setGenerating] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const list = filter === 'all' ? wordState : wordState.filter((w) => w.type === filter);
    return [...list].sort(() => Math.random() - 0.5);
  }, [wordState, filter]);

  const current = filtered[currentIndex] ?? null;

  const handleNext = () => {
    setShowBack(false);
    setImageError(null);
    setGenerating(false);
    if (currentIndex < filtered.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      setCurrentIndex(0);
    }
  };

  const handleFilterChange = (newFilter: 'all' | 'word' | 'idiom') => {
    setFilter(newFilter);
    setCurrentIndex(0);
    setShowBack(false);
  };

  const handleGenerate = async () => {
    if (!current || generating) return;
    setGenerating(true);
    setImageError(null);
    try {
      const { imageUrl, imageModel } = await generateWordImage(current.id, selectedModel);
      setWordState((prev) =>
        prev.map((w) =>
          w.id === current.id
            ? { ...w, image_url: imageUrl, image_model: imageModel }
            : w,
        ),
      );
    } catch {
      setImageError('Could not generate image. Try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleShowBack = () => {
    setShowBack(true);
    setImageError(null);
    if (current?.image_model) setSelectedModel(current.image_model);
  };

  if (words.length === 0) {
    return (
      <div className="min-h-[300px] flex items-center justify-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No vocabulary words yet. Add some on the Vocabulary page first.
        </p>
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

      {filtered.length === 0 ? (
        <div className="min-h-[200px] flex items-center justify-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No {filter === 'word' ? 'words' : 'idioms'} available.
          </p>
        </div>
      ) : (
        <>
          {/* Progress */}
          <div className="flex justify-between text-xs text-zinc-400 dark:text-zinc-500">
            <span>Card {currentIndex + 1} of {filtered.length}</span>
            <span>{filter === 'all' ? 'All types' : filter === 'word' ? 'Words only' : 'Idioms only'}</span>
          </div>

          {/* Card */}
          <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-950 overflow-hidden">
            {/* Front */}
            <div className="p-6 sm:p-8 min-h-[160px] flex items-center justify-center">
              <p className="text-base sm:text-lg text-zinc-700 dark:text-zinc-300 leading-8 text-center">
                {!showBack ? (
                  renderCloze(current!.flashcard_sentence)
                ) : (
                  renderComplete(current!.flashcard_sentence, current!.word)
                )}
              </p>
            </div>

            {/* Back details */}
            {showBack && current && (
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
                <DetailSection title="Context" content={current.context} />
                <DetailSection title="Connections" content={current.connections} />
                <DetailSection title="Morphology" content={current.morphology} />
                <div className="pt-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2">
                    Image
                  </h4>

                  {current.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={current.image_url}
                      alt={`Illustration for ${current.word}`}
                      className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 mb-3"
                    />
                  )}

                  <div className="flex items-center gap-2">
                    <select
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      disabled={generating}
                      className="text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 px-2 py-1.5"
                    >
                      {IMAGE_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleGenerate}
                      disabled={generating}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
                    >
                      {generating
                        ? 'Generating…'
                        : current.image_url
                          ? 'Regenerate'
                          : 'Generate image'}
                    </button>
                  </div>

                  {imageError && (
                    <p className="mt-2 text-xs text-red-600 dark:text-red-400">{imageError}</p>
                  )}
                </div>
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
            <button
              onClick={handleNext}
              className="w-full py-3 text-sm sm:text-base font-medium rounded-lg bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
            >
              {currentIndex < filtered.length - 1 ? 'Next Card' : 'Start Over'}
            </button>
          )}
        </>
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
