'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation } from '@tanstack/react-query';
import { removeFromTermList, reorderTermList, getTermDetailForList } from '@/actions/termList';
import type { TermDetailData } from '@/actions/termList';
import type { TermListItem } from '@/lib/db';
import { TermDetailPage } from '@/components/TermDetailPage';

function formatDate(position: number): string {
  const date = new Date();
  date.setDate(date.getDate() + position); // position 1 = tomorrow
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function DragHandle({ listeners, attributes }: {
  listeners: ReturnType<typeof useSortable>['listeners'];
  attributes: ReturnType<typeof useSortable>['attributes'];
}) {
  return (
    <button
      type="button"
      {...listeners}
      {...attributes}
      className="cursor-grab active:cursor-grabbing touch-none p-1.5 text-zinc-300 dark:text-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-400 transition-colors shrink-0"
      aria-label="Drag to reorder"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <circle cx="5" cy="5" r="1.5" />
        <circle cx="11" cy="5" r="1.5" />
        <circle cx="5" cy="11" r="1.5" />
        <circle cx="11" cy="11" r="1.5" />
      </svg>
    </button>
  );
}

function TermListRow({
  item,
  onRemove,
  isRemoving,
}: {
  item: TermListItem;
  onRemove: (id: number) => void;
  isRemoving: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const [isExpanded, setIsExpanded] = useState(false);
  const [termData, setTermData] = useState<TermDetailData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleToggle = async () => {
    const expanding = !isExpanded;
    setIsExpanded(expanding);
    if (expanding && !termData) {
      setIsLoading(true);
      setFetchError(null);
      try {
        const data = await getTermDetailForList(item.term.id);
        setTermData(data);
      } catch (e) {
        setFetchError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border-b border-zinc-100 dark:border-zinc-800 last:border-b-0"
    >
      <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-zinc-900">
        <span className="text-sm text-zinc-500 dark:text-zinc-400 shrink-0 w-28">
          {formatDate(item.position)}
        </span>

        <button
          type="button"
          onClick={handleToggle}
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
          {item.term.name}
        </span>

        <div className="hidden sm:flex flex-wrap gap-1 max-w-[200px]">
          {item.term.categories.map((cat) => (
            <span
              key={cat}
              className="px-2 py-0.5 text-xs rounded-full bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 whitespace-nowrap"
            >
              {cat}
            </span>
          ))}
        </div>

        <Link
          href={`/terms/${item.term.id}`}
          className="shrink-0 px-2.5 py-1 text-xs rounded-md bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 transition-colors"
        >
          Open
        </Link>

        <button
          type="button"
          onClick={() => onRemove(item.id)}
          disabled={isRemoving}
          className="shrink-0 px-2.5 py-1 text-xs rounded-md bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Remove
        </button>

        <DragHandle listeners={listeners} attributes={attributes} />
      </div>

      {isExpanded && (
        <div className="border-t border-zinc-100 dark:border-zinc-800">
          {isLoading && (
            <div className="flex items-center gap-2 px-4 py-6 text-sm text-zinc-500 dark:text-zinc-400">
              <svg
                className="animate-spin shrink-0"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Loading…
            </div>
          )}
          {fetchError && (
            <p className="px-4 py-4 text-sm text-red-600 dark:text-red-400">{fetchError}</p>
          )}
          {termData && (
            <TermDetailPage
              term={termData.term}
              initialRefinements={termData.refinements}
              initialChats={termData.chats}
              explainedAt={termData.explainedAt}
              initialFlashcards={termData.flashcards}
            />
          )}
        </div>
      )}
    </div>
  );
}

export function TermList({ initialItems }: { initialItems: TermListItem[] }) {
  const [items, setItems] = useState<TermListItem[]>(initialItems);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const removeMutation = useMutation({
    mutationFn: (id: number) => removeFromTermList(id),
    onMutate: (id) => {
      const previous = items;
      const updated = items
        .filter((i) => i.id !== id)
        .map((i, index) => ({ ...i, position: index + 1 }));
      setItems(updated);
      return { previous };
    },
    onSuccess: () => {
      setError(null);
    },
    onError: (_err, _id, context) => {
      if (context?.previous) setItems(context.previous);
      setError('Failed to remove term from list.');
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: number[]) => reorderTermList(orderedIds),
    onMutate: () => {
      return { previous: items };
    },
    onSuccess: () => {
      setError(null);
    },
    onError: (_err, _orderedIds, context: { previous: TermListItem[] } | undefined) => {
      if (context?.previous) setItems(context.previous);
      setError('Failed to save new order.');
    },
  });

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      setItems((prev) => {
        const oldIndex = prev.findIndex((i) => i.id === active.id);
        const newIndex = prev.findIndex((i) => i.id === over.id);
        const reordered = arrayMove(prev, oldIndex, newIndex).map((item, index) => ({
          ...item,
          position: index + 1,
        }));
        reorderMutation.mutate(reordered.map((i) => i.id));
        return reordered;
      });
    },
    [reorderMutation]
  );

  if (items.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400 py-8 text-center">
        No terms in your list. Add terms from the home page or the Terms page.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {items.map((item) => (
              <TermListRow
                key={item.id}
                item={item}
                onRemove={(id) => removeMutation.mutate(id)}
                isRemoving={removeMutation.isPending && removeMutation.variables === item.id}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
