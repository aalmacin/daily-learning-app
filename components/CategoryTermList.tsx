'use client';

import { useState } from 'react';
import Link from 'next/link';
import { TermExpandedPanel } from '@/components/TermExpandedPanel';
import type { CategoryTerm } from '@/lib/db';

function CategoryTermRow({ item }: { item: CategoryTerm }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border-b border-zinc-100 dark:border-zinc-800 last:border-b-0">
      <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-zinc-900">
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="shrink-0 p-1 text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors"
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
          >
            <polyline points="6 4 10 8 6 12" />
          </svg>
        </button>

        <span className="font-medium text-zinc-900 dark:text-zinc-50 flex-1 min-w-0 truncate">
          {item.name}
        </span>

        <div className="hidden sm:flex flex-wrap gap-1 max-w-[200px]">
          {item.categories.map((cat) => (
            <span
              key={cat}
              className="px-2 py-0.5 text-xs rounded-full bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 whitespace-nowrap"
            >
              {cat}
            </span>
          ))}
        </div>

        <Link
          href={`/terms/${item.id}`}
          className="shrink-0 px-2.5 py-1 text-xs rounded-md bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 transition-colors"
        >
          Open
        </Link>
      </div>

      {isExpanded && (
        <div className="border-t border-zinc-100 dark:border-zinc-800">
          <TermExpandedPanel termId={item.id} />
        </div>
      )}
    </div>
  );
}

export function CategoryTermList({ items }: { items: CategoryTerm[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400 py-8 text-center">
        No terms in this category.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      {items.map((item) => (
        <CategoryTermRow key={item.id} item={item} />
      ))}
    </div>
  );
}
