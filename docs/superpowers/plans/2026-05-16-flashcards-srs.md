# Flashcards SRS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add flashcard creation (cloze deletion) to the term detail page and a dedicated review page with spaced repetition.

**Architecture:** New `flashcards` table in Supabase with RLS. Server actions for CRUD and review. Client components for the creation UI (inside TermDetailPage) and a new `/flashcards` review page. Cloze content stored as text with `__...__` markers, rendered dynamically.

**Tech Stack:** Supabase (Postgres + RLS), Next.js 16 server actions, React Query, Tailwind CSS (responsive mobile-first)

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260516000000_flashcards.sql`

- [ ] **Step 1: Create migration file**

```sql
CREATE TABLE flashcards (
  id SERIAL PRIMARY KEY,
  term_id INTEGER NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  interval_step INTEGER NOT NULL DEFAULT 0,
  next_review TIMESTAMPTZ,
  last_reviewed TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID NOT NULL REFERENCES auth.users(id)
);

CREATE INDEX idx_flashcards_user_next_review ON flashcards(user_id, next_review);
CREATE INDEX idx_flashcards_term_id ON flashcards(term_id);

ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own flashcards"
  ON flashcards
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

- [ ] **Step 2: Apply migration**

Run: `npx supabase db push` (or apply via Supabase dashboard)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260516000000_flashcards.sql
git commit -m "feat: add flashcards table with SRS fields and RLS"
```

---

### Task 2: Database Layer (lib/db.ts)

**Files:**
- Modify: `lib/db.ts`

- [ ] **Step 1: Add Flashcard type and SRS constants**

Add at the end of the types section (after `ChatMessage` type around line 500):

```typescript
export type Flashcard = {
  id: number;
  term_id: number;
  content: string;
  interval_step: number;
  next_review: string | null;
  last_reviewed: string | null;
  created_at: string;
  user_id: string;
};

export const SRS_INTERVALS = [1, 3, 7, 14, 30, 60] as const;
```

- [ ] **Step 2: Add flashcard CRUD functions**

Add at the end of `lib/db.ts`:

```typescript
export async function getFlashcardsByTermId(termId: number, userId: string): Promise<Flashcard[]> {
  const { data, error } = await getSupabase()
    .from('flashcards')
    .select('*')
    .eq('term_id', termId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Flashcard[];
}

export async function createFlashcard(termId: number, content: string, userId: string): Promise<Flashcard> {
  const { data, error } = await getSupabase()
    .from('flashcards')
    .insert({ term_id: termId, content, user_id: userId } as unknown as never)
    .select()
    .single();
  if (error) throw error;
  return data as Flashcard;
}

export async function updateFlashcard(id: number, content: string, userId: string): Promise<Flashcard> {
  const { data, error } = await getSupabase()
    .from('flashcards')
    .update({ content } as unknown as never)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) throw error;
  return data as Flashcard;
}

export async function deleteFlashcard(id: number, userId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('flashcards')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function resetFlashcardReview(id: number, userId: string): Promise<Flashcard> {
  const { data, error } = await getSupabase()
    .from('flashcards')
    .update({ interval_step: 0, next_review: null, last_reviewed: null } as unknown as never)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) throw error;
  return data as Flashcard;
}

export async function getDueFlashcards(userId: string, categoryNames?: string[]): Promise<(Flashcard & { term_name: string })[]> {
  let termIdFilter: number[] | null = null;
  if (categoryNames && categoryNames.length > 0) {
    const { data: cats, error: catError } = await getSupabase()
      .from('categories')
      .select('id')
      .in('name', categoryNames)
      .eq('user_id', userId);
    if (catError) throw catError;
    const catIds = (cats as { id: number }[]).map((c) => c.id);
    if (catIds.length === 0) return [];
    const { data: links, error: linkError } = await getSupabase()
      .from('term_categories')
      .select('term_id')
      .in('category_id', catIds);
    if (linkError) throw linkError;
    termIdFilter = [...new Set((links as { term_id: number }[]).map((l) => l.term_id))];
    if (termIdFilter.length === 0) return [];
  }

  let query = getSupabase()
    .from('flashcards')
    .select('*, terms(name)')
    .eq('user_id', userId)
    .not('next_review', 'is', null)
    .lte('next_review', new Date().toISOString());
  if (termIdFilter) query = query.in('term_id', termIdFilter);
  query = query.order('next_review', { ascending: true });

  const { data, error } = await query;
  if (error) throw error;

  return (data as unknown as (Flashcard & { terms: { name: string } })[]).map((row) => ({
    ...row,
    term_name: row.terms.name,
    terms: undefined,
  })) as unknown as (Flashcard & { term_name: string })[];
}

export async function getNewFlashcards(userId: string, categoryNames?: string[]): Promise<(Flashcard & { term_name: string })[]> {
  let termIdFilter: number[] | null = null;
  if (categoryNames && categoryNames.length > 0) {
    const { data: cats, error: catError } = await getSupabase()
      .from('categories')
      .select('id')
      .in('name', categoryNames)
      .eq('user_id', userId);
    if (catError) throw catError;
    const catIds = (cats as { id: number }[]).map((c) => c.id);
    if (catIds.length === 0) return [];
    const { data: links, error: linkError } = await getSupabase()
      .from('term_categories')
      .select('term_id')
      .in('category_id', catIds);
    if (linkError) throw linkError;
    termIdFilter = [...new Set((links as { term_id: number }[]).map((l) => l.term_id))];
    if (termIdFilter.length === 0) return [];
  }

  let query = getSupabase()
    .from('flashcards')
    .select('*, terms(name)')
    .eq('user_id', userId)
    .is('next_review', null);
  if (termIdFilter) query = query.in('term_id', termIdFilter);

  const { data, error } = await query;
  if (error) throw error;

  return (data as unknown as (Flashcard & { terms: { name: string } })[]).map((row) => ({
    ...row,
    term_name: row.terms.name,
    terms: undefined,
  })) as unknown as (Flashcard & { term_name: string })[];
}

export async function reviewFlashcard(id: number, userId: string, correct: boolean): Promise<Flashcard> {
  const { data: card, error: fetchError } = await getSupabase()
    .from('flashcards')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();
  if (fetchError) throw fetchError;

  const current = card as Flashcard;
  let newStep: number;
  if (correct) {
    newStep = Math.min(current.interval_step + 1, SRS_INTERVALS.length - 1);
  } else {
    newStep = 0;
  }

  const intervalDays = SRS_INTERVALS[newStep];
  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + intervalDays);

  const { data, error } = await getSupabase()
    .from('flashcards')
    .update({
      interval_step: newStep,
      next_review: nextReview.toISOString(),
      last_reviewed: new Date().toISOString(),
    } as unknown as never)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) throw error;
  return data as Flashcard;
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/db.ts
git commit -m "feat: add flashcard database functions with SRS logic"
```

---

### Task 3: Server Actions

**Files:**
- Create: `actions/flashcards.ts`

- [ ] **Step 1: Create flashcard server actions**

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import {
  createFlashcard,
  updateFlashcard,
  deleteFlashcard,
  resetFlashcardReview,
  getDueFlashcards,
  getNewFlashcards,
  reviewFlashcard,
  getFlashcardsByTermId,
  getAllCategories,
  type Flashcard,
} from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function addFlashcard(termId: number, content: string): Promise<Flashcard> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const card = await createFlashcard(termId, content, user.id);
  revalidatePath(`/terms/${termId}`);
  return card;
}

export async function editFlashcard(id: number, termId: number, content: string): Promise<Flashcard> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const card = await updateFlashcard(id, content, user.id);
  revalidatePath(`/terms/${termId}`);
  return card;
}

export async function removeFlashcard(id: number, termId: number): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  await deleteFlashcard(id, user.id);
  revalidatePath(`/terms/${termId}`);
}

export async function resetFlashcard(id: number, termId: number): Promise<Flashcard> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const card = await resetFlashcardReview(id, user.id);
  revalidatePath(`/terms/${termId}`);
  return card;
}

export async function getFlashcardsForTerm(termId: number): Promise<Flashcard[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  return getFlashcardsByTermId(termId, user.id);
}

export async function getReviewCards(categoryNames?: string[]): Promise<{
  due: (Flashcard & { term_name: string })[];
  new: (Flashcard & { term_name: string })[];
}> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const [due, newCards] = await Promise.all([
    getDueFlashcards(user.id, categoryNames),
    getNewFlashcards(user.id, categoryNames),
  ]);
  return { due, new: newCards };
}

export async function submitReview(id: number, correct: boolean): Promise<Flashcard> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const card = await reviewFlashcard(id, user.id, correct);
  revalidatePath('/flashcards');
  return card;
}

export async function getFlashcardCategories(): Promise<{ id: number; name: string }[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  return getAllCategories(user.id);
}
```

- [ ] **Step 2: Commit**

```bash
git add actions/flashcards.ts
git commit -m "feat: add flashcard server actions"
```

---

### Task 4: Cloze Rendering Utility

**Files:**
- Create: `lib/cloze.ts`

- [ ] **Step 1: Create cloze utility**

```typescript
export function renderClozeFront(content: string): string {
  return content.replace(/__([^_]+)__/g, '___');
}

export function renderClozeBack(content: string): string {
  return content.replace(/__([^_]+)__/g, '$1');
}

export function extractClozeTerms(content: string): string[] {
  const matches = content.match(/__([^_]+)__/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(2, -2));
}

export function hasClozeMarkers(content: string): boolean {
  return /__([^_]+)__/g.test(content);
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/cloze.ts
git commit -m "feat: add cloze rendering utilities"
```

---

### Task 5: Flashcard Section in TermDetailPage

**Files:**
- Create: `components/FlashcardSection.tsx`
- Modify: `components/TermDetailPage.tsx`
- Modify: `app/terms/[id]/page.tsx`

- [ ] **Step 1: Create FlashcardSection component**

```typescript
'use client';

import { useState, useTransition } from 'react';
import { addFlashcard, editFlashcard, removeFlashcard, resetFlashcard } from '@/actions/flashcards';
import { renderClozeFront, hasClozeMarkers } from '@/lib/cloze';
import { SRS_INTERVALS, type Flashcard } from '@/lib/db';

type Props = {
  termId: number;
  formattedNote: string;
  initialFlashcards: Flashcard[];
};

export function FlashcardSection({ termId, formattedNote, initialFlashcards }: Props) {
  const [flashcards, setFlashcards] = useState(initialFlashcards);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleCreate = () => {
    setContent(formattedNote);
    setIsCreating(true);
    setEditingId(null);
    setError(null);
  };

  const handleSave = () => {
    if (!content.trim() || !hasClozeMarkers(content)) {
      setError('Add at least one cloze deletion using __term__ markers.');
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        if (editingId !== null) {
          const updated = await editFlashcard(editingId, termId, content.trim());
          setFlashcards((prev) => prev.map((c) => (c.id === editingId ? updated : c)));
          setEditingId(null);
        } else {
          const card = await addFlashcard(termId, content.trim());
          setFlashcards((prev) => [card, ...prev]);
        }
        setIsCreating(false);
        setContent('');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save');
      }
    });
  };

  const handleEdit = (card: Flashcard) => {
    setContent(card.content);
    setEditingId(card.id);
    setIsCreating(true);
    setError(null);
  };

  const handleDelete = (id: number) => {
    startTransition(async () => {
      try {
        await removeFlashcard(id, termId);
        setFlashcards((prev) => prev.filter((c) => c.id !== id));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to delete');
      }
    });
  };

  const handleReset = (id: number) => {
    startTransition(async () => {
      try {
        const updated = await resetFlashcard(id, termId);
        setFlashcards((prev) => prev.map((c) => (c.id === id ? updated : c)));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to reset');
      }
    });
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="space-y-3">
      {/* Step label */}
      <div className="flex items-center gap-2 mb-3">
        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-700 text-xs font-bold text-zinc-700 dark:text-zinc-200">
          4
        </span>
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Flashcards
        </span>
      </div>

      {/* Create button */}
      {!isCreating && (
        <button
          onClick={handleCreate}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
        >
          Create Flashcard
        </button>
      )}

      {/* Create/Edit form */}
      {isCreating && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Wrap text with <code className="px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">__</code> to create cloze deletions. Example: <code className="px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">The __dog__ barks.</code>
          </p>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600 resize-none"
          />
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isPending ? 'Saving…' : editingId ? 'Update Card' : 'Save Card'}
            </button>
            <button
              onClick={() => { setIsCreating(false); setEditingId(null); setContent(''); setError(null); }}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Card list */}
      {flashcards.length > 0 && (
        <div className="space-y-2 mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Cards ({flashcards.length})
          </p>
          {flashcards.map((card) => (
            <div key={card.id} className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 space-y-2">
              <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-6">
                {renderClozeFront(card.content)}
              </p>
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                <div className="flex flex-wrap gap-2 text-xs text-zinc-400 dark:text-zinc-500">
                  {card.next_review ? (
                    <>
                      <span>Interval: {SRS_INTERVALS[card.interval_step]}d</span>
                      <span>Next: {formatDate(card.next_review)}</span>
                      <span>Last: {formatDate(card.last_reviewed)}</span>
                    </>
                  ) : (
                    <span>New — not yet reviewed</span>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleEdit(card)}
                    disabled={isPending}
                    className="px-2 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleReset(card.id)}
                    disabled={isPending}
                    className="px-2 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
                  >
                    Reset
                  </button>
                  <button
                    onClick={() => handleDelete(card.id)}
                    disabled={isPending}
                    className="px-2 py-1 text-xs rounded border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-40 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update the term detail page server component to fetch flashcards**

In `app/terms/[id]/page.tsx`, add the flashcard fetch:

```typescript
import { notFound } from 'next/navigation';
import { getTermById, getRefinementsByTermId, getChatsByRefinementIds, getExplainedAtForTerm, getFlashcardsByTermId } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { TermDetailPage } from '@/components/TermDetailPage';

export default async function TermPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (isNaN(id)) notFound();

  const user = await getCurrentUser();
  if (!user) notFound();

  const [term, refinements] = await Promise.all([getTermById(id), getRefinementsByTermId(id)]);
  if (!term) notFound();

  const [initialChats, explainedAt, flashcards] = await Promise.all([
    getChatsByRefinementIds(refinements.map((r) => r.id)),
    getExplainedAtForTerm(id),
    getFlashcardsByTermId(id, user.id),
  ]);

  return <TermDetailPage term={term} initialRefinements={refinements} initialChats={initialChats} explainedAt={explainedAt} initialFlashcards={flashcards} />;
}
```

- [ ] **Step 3: Add FlashcardSection to TermDetailPage component**

In `components/TermDetailPage.tsx`:

1. Add import at top:
```typescript
import { FlashcardSection } from '@/components/FlashcardSection';
import type { Flashcard } from '@/lib/db';
```

2. Add `initialFlashcards` to Props type:
```typescript
type Props = {
  term: Term;
  initialRefinements: ConceptRefinement[];
  initialChats: Record<number, ChatMessage[]>;
  explainedAt?: string | null;
  initialFlashcards: Flashcard[];
};
```

3. Update function signature:
```typescript
export function TermDetailPage({ term, initialRefinements, initialChats, explainedAt, initialFlashcards }: Props) {
```

4. Add FlashcardSection after the Step 3 (Refined Explanation) section closes, inside the attempt view block (before the closing `</div>` of the attempt view around line 636). Add it after the refinement step 3 section, only visible when latest attempt is complete:

```typescript
{/* Step 4 — Flashcards (only when latest has a formatted note) */}
{isLatest && isComplete(viewing) && viewing.refinement_formatted_note && (
  <FlashcardSection
    termId={term.id}
    formattedNote={viewing.refinement_formatted_note}
    initialFlashcards={initialFlashcards}
  />
)}
```

- [ ] **Step 4: Commit**

```bash
git add components/FlashcardSection.tsx components/TermDetailPage.tsx app/terms/\[id\]/page.tsx
git commit -m "feat: add flashcard creation section to term detail page"
```

---

### Task 6: Flashcards Review Page

**Files:**
- Create: `app/flashcards/page.tsx`
- Create: `components/FlashcardsReview.tsx`

- [ ] **Step 1: Create the review page server component**

```typescript
import { getCurrentUser } from '@/lib/auth';
import { getAllCategories } from '@/lib/db';
import { redirect } from 'next/navigation';
import { FlashcardsReview } from '@/components/FlashcardsReview';

export default async function FlashcardsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const categories = await getAllCategories(user.id);

  return <FlashcardsReview categories={categories} />;
}
```

- [ ] **Step 2: Create FlashcardsReview client component**

```typescript
'use client';

import { useState, useEffect, useTransition, useCallback } from 'react';
import { getReviewCards, submitReview } from '@/actions/flashcards';
import { renderClozeFront, renderClozeBack } from '@/lib/cloze';
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
      // Shuffle new cards
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
                  renderClozeBack(currentCard.content).split(/(__[^_]+__)/).map((part, i) => {
                    // Re-parse to identify cloze terms for styling
                    return part;
                  })
                ) : (
                  renderClozeFront(currentCard.content)
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
```

- [ ] **Step 3: Commit**

```bash
git add app/flashcards/page.tsx components/FlashcardsReview.tsx
git commit -m "feat: add flashcards review page with SRS"
```

---

### Task 7: Cloze Back Rendering with Styled Terms

**Files:**
- Modify: `components/FlashcardsReview.tsx`

- [ ] **Step 1: Fix the back rendering to show styled cloze terms**

Replace the card content rendering in `FlashcardsReview.tsx` with proper JSX that styles the revealed terms:

In the card display section, replace the `<p>` content:

```typescript
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
  currentCard.content.replace(/__([^_]+)__/g, '___________')
)}
```

- [ ] **Step 2: Apply same pattern to FlashcardSection card preview**

In `components/FlashcardSection.tsx`, update the card preview to use a styled blank character instead of raw regex output. Replace:
```typescript
{renderClozeFront(card.content)}
```
With:
```typescript
{card.content.split(/(__[^_]+__)/g).map((segment, i) => {
  if (segment.match(/^__(.+)__$/)) {
    return (
      <span key={i} className="inline-block w-16 border-b-2 border-zinc-400 dark:border-zinc-500 mx-1" />
    );
  }
  return <span key={i}>{segment}</span>;
})}
```

- [ ] **Step 3: Commit**

```bash
git add components/FlashcardsReview.tsx components/FlashcardSection.tsx
git commit -m "feat: styled cloze rendering with blanks and highlighted reveals"
```

---

### Task 8: Add Flashcards to Navigation

**Files:**
- Modify: `components/NavMenu.tsx`

- [ ] **Step 1: Add Flashcards link to desktop and mobile nav**

In the `links` const (after Term List link, before Categories):

```typescript
<Link href="/flashcards" onClick={close} className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50 transition-colors">
  Flashcards
</Link>
```

In the mobile dropdown array (after Term List, before Categories):

```typescript
{ href: '/flashcards', label: 'Flashcards' },
```

- [ ] **Step 2: Commit**

```bash
git add components/NavMenu.tsx
git commit -m "feat: add Flashcards to navigation menu"
```

---

### Task 9: Review Page — Blank Line Styling for Front

**Files:**
- Modify: `components/FlashcardsReview.tsx`

- [ ] **Step 1: Update front rendering to show styled blank lines**

Replace the front text rendering in FlashcardsReview with the same split/JSX approach used in FlashcardSection:

```typescript
currentCard.content.split(/(__[^_]+__)/g).map((segment, i) => {
  if (segment.match(/^__(.+)__$/)) {
    return (
      <span key={i} className="inline-block w-20 border-b-2 border-zinc-400 dark:border-zinc-500 mx-1" />
    );
  }
  return <span key={i}>{segment}</span>;
})
```

- [ ] **Step 2: Commit**

```bash
git add components/FlashcardsReview.tsx
git commit -m "feat: styled blank lines for flashcard front view"
```

---

### Task 10: Final Integration Test

**Files:** None (manual verification)

- [ ] **Step 1: Verify flashcard creation flow**

1. Navigate to a term with a completed refinement
2. Confirm Step 4 "Flashcards" section appears
3. Click "Create Flashcard" — verify formatted note pre-fills
4. Add `__...__` markers and save
5. Verify card appears in the list with "New — not yet reviewed"

- [ ] **Step 2: Verify review page**

1. Navigate to /flashcards
2. Verify the new card appears
3. Test "Show Answer" → reveals with bold blue terms
4. Test "Correct" → card advances
5. Test category filter

- [ ] **Step 3: Verify edit/reset/delete**

1. Go back to term detail page
2. Test Edit — opens textarea with content
3. Test Reset — clears SRS state
4. Test Delete — removes card

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: No type errors, successful build

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration fixes for flashcards feature"
```

---

Plan complete and saved to `docs/superpowers/plans/2026-05-16-flashcards-srs.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?