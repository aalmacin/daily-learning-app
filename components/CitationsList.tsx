'use client';

import { useEffect, useState } from 'react';
import { getTermCitations } from '@/actions/citations';
import type { TermCitation } from '@/lib/db';

export function CitationsList({ termId }: { termId: number }) {
  const [citations, setCitations] = useState<TermCitation[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTermCitations(termId)
      .then((data) => {
        if (!cancelled) setCitations(data);
      })
      .catch(() => {
        if (!cancelled) setCitations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [termId]);

  if (citations === null) {
    return <p className="px-1 py-2 text-xs text-zinc-400 dark:text-zinc-500">Loading…</p>;
  }

  if (citations.length === 0) {
    return <p className="px-1 py-2 text-xs text-zinc-400 dark:text-zinc-500">No web sources cited yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-2 px-1 py-1 max-h-64 overflow-y-auto">
      {citations.map((c) => (
        <li key={c.id} className="text-xs">
          <a
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-cyan-700 dark:text-cyan-300 hover:underline break-words"
          >
            {c.title || c.url}
          </a>
          {c.snippet && (
            <p className="mt-0.5 text-zinc-500 dark:text-zinc-400 leading-relaxed">{c.snippet}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
