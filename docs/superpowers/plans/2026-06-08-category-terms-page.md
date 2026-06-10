# Category Terms Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/categories/[id]` page that shows all terms for a category in the same expandable-row style as Term List, reached via the "View Terms" link in CategoriesManager.

**Architecture:** Extract the expand/data-fetch panel from TermListRow into a shared `TermExpandedPanel` component. Build `CategoryTermList` using that shared component. Add a `getTermsByCategory` DB function and a new Next.js page. Update the "View Terms" link to point to the new route.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase, Tailwind CSS, React

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Modify | `lib/db.ts` | Add `CategoryTerm` type + `getTermsByCategory` function |
| Create | `components/TermExpandedPanel.tsx` | Shared expand panel (fetches + renders term detail) |
| Modify | `components/TermList.tsx` | Use `TermExpandedPanel`; remove inline fetch logic |
| Create | `components/CategoryTermList.tsx` | Category-filtered term list (no drag/remove/date) |
| Create | `app/categories/[id]/page.tsx` | Server page; resolves category, fetches terms |
| Modify | `components/CategoriesManager.tsx` | Change "View Terms" href to `/categories/[id]` |

---

## Task 1: Add `getTermsByCategory` to `lib/db.ts`

**Files:**
- Modify: `lib/db.ts`

- [ ] **Step 1: Add `CategoryTerm` type after the `Category` type (line ~35)**

In `lib/db.ts`, after the `Category` type block:

```ts
export type CategoryTerm = {
  id: number;
  name: string;
  categories: string[];
};
```

- [ ] **Step 2: Add `getTermsByCategory` function at the end of `lib/db.ts`**

```ts
export async function getTermsByCategory(userId: string, categoryId: number): Promise<CategoryTerm[]> {
  const { data: cat, error: catError } = await getSupabase()
    .from('categories')
    .select('id')
    .eq('id', categoryId)
    .eq('user_id', userId)
    .maybeSingle();
  if (catError) throw catError;
  if (!cat) return [];

  const { data: links, error: linksError } = await getSupabase()
    .from('term_categories')
    .select('term_id')
    .eq('category_id', categoryId);
  if (linksError) throw linksError;
  const termIds = (links as { term_id: number }[]).map((l) => l.term_id);
  if (termIds.length === 0) return [];

  const { data: terms, error: termsError } = await getSupabase()
    .from('terms')
    .select('id, name')
    .eq('user_id', userId)
    .in('id', termIds)
    .order('name', { ascending: true });
  if (termsError) throw termsError;
  const termRows = terms as { id: number; name: string }[];

  const { data: catLinks, error: catLinksError } = await getSupabase()
    .from('term_categories')
    .select('term_id, category_id')
    .in('term_id', termIds);
  if (catLinksError) throw catLinksError;
  const typedCatLinks = catLinks as { term_id: number; category_id: number }[];

  const allCatIds = [...new Set(typedCatLinks.map((l) => l.category_id))];
  const catNameById = new Map<number, string>();
  if (allCatIds.length > 0) {
    const { data: cats, error: catsErr } = await getSupabase()
      .from('categories')
      .select('id, name')
      .in('id', allCatIds);
    if (catsErr) throw catsErr;
    (cats as { id: number; name: string }[]).forEach((c) => catNameById.set(c.id, c.name));
  }

  return termRows.map((t) => ({
    id: t.id,
    name: t.name,
    categories: typedCatLinks
      .filter((l) => l.term_id === t.id)
      .map((l) => catNameById.get(l.category_id))
      .filter((n): n is string => n != null)
      .sort(),
  }));
}
```

- [ ] **Step 3: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/db.ts
git commit -m "feat: add getTermsByCategory DB function"
```

---

## Task 2: Create `TermExpandedPanel` component

**Files:**
- Create: `components/TermExpandedPanel.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client';

import { useState, useEffect } from 'react';
import { getTermDetailForList } from '@/actions/termList';
import type { TermDetailData } from '@/actions/termList';
import { TermDetailPage } from '@/components/TermDetailPage';

export function TermExpandedPanel({ termId }: { termId: number }) {
  const [termData, setTermData] = useState<TermDetailData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    getTermDetailForList(termId)
      .then(setTermData)
      .catch((e) => setFetchError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setIsLoading(false));
  }, [termId]);

  if (isLoading) {
    return (
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
    );
  }
  if (fetchError) {
    return <p className="px-4 py-4 text-sm text-red-600 dark:text-red-400">{fetchError}</p>;
  }
  if (!termData) return null;
  return (
    <TermDetailPage
      term={termData.term}
      initialRefinements={termData.refinements}
      initialChats={termData.chats}
      explainedAt={termData.explainedAt}
      initialFlashcards={termData.flashcards}
    />
  );
}
```

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/TermExpandedPanel.tsx
git commit -m "feat: add shared TermExpandedPanel component"
```

---

## Task 3: Refactor `TermList.tsx` to use `TermExpandedPanel`

**Files:**
- Modify: `components/TermList.tsx`

- [ ] **Step 1: Add import for `TermExpandedPanel` at the top of the file**

Add after the existing imports:

```tsx
import { TermExpandedPanel } from '@/components/TermExpandedPanel';
```

- [ ] **Step 2: Replace the state and fetch logic inside `TermListRow`**

Remove these lines from `TermListRow`:

```tsx
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

Replace with:

```tsx
const handleToggle = () => {
  setIsExpanded((prev) => !prev);
};
```

- [ ] **Step 3: Replace the inline expanded section with `TermExpandedPanel`**

Remove the expanded section:

```tsx
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
```

Replace with:

```tsx
{isExpanded && (
  <div className="border-t border-zinc-100 dark:border-zinc-800">
    <TermExpandedPanel termId={item.term.id} />
  </div>
)}
```

- [ ] **Step 4: Remove now-unused imports**

Remove these imports from the top of `TermList.tsx` if they are no longer used elsewhere in the file:

```tsx
import { getTermDetailForList } from '@/actions/termList';
import type { TermDetailData } from '@/actions/termList';
import { TermDetailPage } from '@/components/TermDetailPage';
```

Check each: `TermDetailPage` and `TermDetailData` and `getTermDetailForList` — if they appear nowhere else in the file after the refactor, remove them.

- [ ] **Step 5: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/TermList.tsx
git commit -m "refactor: use TermExpandedPanel in TermListRow"
```

---

## Task 4: Create `CategoryTermList` component

**Files:**
- Create: `components/CategoryTermList.tsx`

- [ ] **Step 1: Create the file**

```tsx
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
```

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/CategoryTermList.tsx
git commit -m "feat: add CategoryTermList component"
```

---

## Task 5: Create `/categories/[id]/page.tsx`

**Files:**
- Create: `app/categories/[id]/page.tsx`

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p app/categories/\[id\]
```

- [ ] **Step 2: Write the page**

```tsx
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getAllCategories, getTermsByCategory } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { CategoryTermList } from '@/components/CategoryTermList';

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const categoryId = Number(id);
  if (isNaN(categoryId)) notFound();

  const user = await getCurrentUser();
  const userId = user!.id;

  const [categories, terms] = await Promise.all([
    getAllCategories(userId),
    getTermsByCategory(userId, categoryId),
  ]);

  const category = categories.find((c) => c.id === categoryId);
  if (!category) notFound();

  return (
    <div className="bg-zinc-50 dark:bg-black p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-6">
          {category.name}
        </h1>
        <CategoryTermList items={terms} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/categories/[id]/page.tsx"
git commit -m "feat: add category terms page at /categories/[id]"
```

---

## Task 6: Update `CategoriesManager` "View Terms" link

**Files:**
- Modify: `components/CategoriesManager.tsx`

- [ ] **Step 1: Update the "View Terms" href**

Find this line in `CategoriesManager.tsx`:

```tsx
href={`/terms?category=${encodeURIComponent(cat.name)}`}
```

Replace with:

```tsx
href={`/categories/${cat.id}`}
```

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/CategoriesManager.tsx
git commit -m "feat: link 'View Terms' to new category page"
```
