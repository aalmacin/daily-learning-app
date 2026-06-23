'use client';

import { useState, useTransition } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { listVideoResearch, submitVideoResearch } from '@/actions/videoResearch';
import { VideoResearchItem } from './VideoResearchItem';

type Accent = 'zinc' | 'cyan';

type Props = {
  termId: number;
  accent?: Accent;
};

export function VideoResearchPanel({ termId, accent = 'zinc' }: Props) {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const { data: items = [] } = useQuery({
    queryKey: queryKeys.videoResearch.all(termId),
    queryFn: () => listVideoResearch(termId),
    refetchInterval: (query) =>
      (query.state.data ?? []).some((v) => v.status === 'processing') ? 3000 : false,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.videoResearch.all(termId) });

  const handleSubmit = () => {
    const value = url.trim();
    if (!value) return;
    setError(null);
    startTransition(async () => {
      try {
        await submitVideoResearch(termId, value);
        setUrl('');
        await invalidate();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to submit');
      }
    });
  };

  const submitBtn =
    accent === 'cyan'
      ? 'bg-cyan-600 hover:bg-cyan-500 text-white'
      : 'bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200';

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="Paste a YouTube URL to research…"
          disabled={isPending}
          className="flex-1 px-3 py-2 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!url.trim() || isPending}
          className={`px-4 py-2 text-xs font-medium rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${submitBtn}`}
        >
          {isPending ? 'Adding…' : 'Extract'}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      {items.length === 0 ? (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">No videos yet. Paste a YouTube URL to extract study material.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <VideoResearchItem key={item.id} item={item} accent={accent} onChanged={invalidate} />
          ))}
        </div>
      )}
    </div>
  );
}
