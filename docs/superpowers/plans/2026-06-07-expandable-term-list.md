# Expandable Term List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each row in the term list expandable inline to show the full Feynman steps (same content as the individual term page) without navigating away.

**Architecture:** A new server action fetches term detail data lazily on first expand. Each `TermListRow` tracks its own expand/loading/data state. `TermDetailPage` is rendered as-is inside the expanded section — no changes to that component.

**Tech Stack:** Next.js 15 (App Router), React, TypeScript, @tanstack/react-query, @dnd-kit/core

---

## File Map

| File | Change |
|------|--------|
| `actions/termList.ts` | Add `getTermDetailForList` server action |
| `components/TermList.tsx` | Add expand toggle + expanded `TermDetailPage` to `TermListRow` |

`components/TermDetailPage.tsx` — **no changes**.

---

### Task 1: Add `getTermDetailForList` server action

**Files:**
- Modify: `actions/termList.ts`

- [ ] **Step 1: Add imports to `actions/termList.ts`**

Add to the existing import block at the top (keep `'use server'` directive at line 1):

```typescript
import {
  addTermToList as dbAdd,
  removeFromTermList as dbRemove,
  removeFromTermListByTermId as dbRemoveByTermId,
  reorderTermList as dbReorder,
  getTermList as dbGetList,
  getTermById,
  getRefinementsByTermId,
  getChatsByRefinementIds,
  getFlashcardsByTermId,
  getExplainedAtForTerm,
} from '@/lib/db';
import type { TermListItem, Term, ConceptRefinement, ChatMessage, Flashcard } from '@/lib/db';
```

- [ ] **Step 2: Add the `TermDetailData` type and `getTermDetailForList` action**

Append to the end of `actions/termList.ts`:

```typescript
export type TermDetailData = {
  term: Term;
  refinements: ConceptRefinement[];
  chats: Record<number, ChatMessage[]>;
  flashcards: Flashcard[];
  explainedAt: string | null;
};

export async function getTermDetailForList(termId: number): Promise<TermDetailData> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const [term, refinements] = await Promise.all([
    getTermById(termId),
    getRefinementsByTermId(termId),
  ]);
  if (!term) throw new Error('Term not found');

  const [chats, flashcards, explainedAt] = await Promise.all([
    getChatsByRefinementIds(refinements.map((r) => r.id)),
    getFlashcardsByTermId(termId, user.id),
    getExplainedAtForTerm(termId),
  ]);

  return { term, refinements, chats, flashcards, explainedAt };
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /path/to/project && npx tsc --noEmit
```

Expected: no errors related to `actions/termList.ts`.

- [ ] **Step 4: Commit**

```bash
git add actions/termList.ts
git commit -m "feat: add getTermDetailForList server action"
```

---

### Task 2: Add expand toggle to `TermListRow`

**Files:**
- Modify: `components/TermList.tsx`

- [ ] **Step 1: Add imports to `TermList.tsx`**

At the top of `components/TermList.tsx`, add to the existing React import and add the new action import:

```typescript
import { useState, useCallback } from 'react';
// existing imports stay...
import { removeFromTermList, reorderTermList, getTermDetailForList } from '@/actions/termList';
import type { TermDetailData } from '@/actions/termList';
import { TermDetailPage } from '@/components/TermDetailPage';
```

- [ ] **Step 2: Add expand state to `TermListRow`**

Replace the `TermListRow` function signature and add state inside it. The current function starts at:

```typescript
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
```

Replace with:

```typescript
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
```

- [ ] **Step 3: Add chevron button to the row header JSX**

Inside the returned JSX of `TermListRow`, the current row `<div>` is:

```tsx
<div
  ref={setNodeRef}
  style={style}
  className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800 last:border-b-0"
>
  <span className="text-sm text-zinc-500 dark:text-zinc-400 shrink-0 w-28">
    {formatDate(item.position)}
  </span>

  <span className="font-medium text-zinc-900 dark:text-zinc-50 flex-1 min-w-0 truncate">
    {item.term.name}
  </span>
```

Replace the entire `return (...)` block of `TermListRow` with:

```tsx
  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800">
        <span className="text-sm text-zinc-500 dark:text-zinc-400 shrink-0 w-28">
          {formatDate(item.position)}
        </span>

        <button
          type="button"
          onClick={handleToggle}
          className="shrink-0 text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors p-1"
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
        <div className="border-b border-zinc-100 dark:border-zinc-800">
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
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Start dev server and verify manually**

```bash
npm run dev
```

Open the term list page. Verify:
1. Each row now has a chevron (▶) between the date and the term name.
2. Clicking the chevron shows a loading spinner briefly.
3. After loading, the full term detail content appears — term card, Feynman Method card with explanation date, Steps 1–4 including flashcards.
4. Clicking the chevron again collapses the content.
5. Re-expanding does not trigger another network fetch (cached in state).
6. The "Open" link still navigates to the full term page.
7. Remove and drag-to-reorder still work on collapsed rows.
8. Dark mode looks correct.

- [ ] **Step 6: Commit**

```bash
git add components/TermList.tsx
git commit -m "feat: expandable term list rows with inline Feynman steps"
```
