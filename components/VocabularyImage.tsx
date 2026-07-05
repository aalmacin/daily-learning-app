'use client';

import { useState } from 'react';
import { generateWordImage } from '@/actions/vocabulary';
import { IMAGE_MODELS, DEFAULT_IMAGE_MODEL } from '@/lib/imageModels';

type Props = {
  wordId: number;
  word: string;
  imageUrl: string | null;
  imageModel: string | null;
  onGenerated: (imageUrl: string, imageModel: string) => void;
};

export function VocabularyImage({ wordId, word, imageUrl, imageModel, onGenerated }: Props) {
  const [selectedModel, setSelectedModel] = useState<string>(imageModel ?? DEFAULT_IMAGE_MODEL);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await generateWordImage(wordId, selectedModel);
      onGenerated(res.imageUrl, res.imageModel);
    } catch {
      setError('Could not generate image. Try again.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="pt-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2">
        Image
      </h4>

      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={`Illustration for ${word}`}
          className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 mb-3"
        />
      )}

      <div className="flex items-center gap-2">
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          disabled={generating}
          aria-label="Image model"
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
          {generating ? 'Generating…' : imageUrl ? 'Regenerate' : 'Generate image'}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
