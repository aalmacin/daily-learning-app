# Flashcards Page Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the two separate flashcard pages (`/flashcards` for terms, `/vocabulary/flashcards` for vocabulary/idioms) into one page at `/flashcards` with a Terms/Vocabulary tab bar, and fix a shared React Strict Mode race bug in both flashcard components along the way.

**Architecture:** `app/flashcards/page.tsx` reads `?tab=` from `searchParams` (defaulting to `terms`), fetches `categories` as it does today, and renders a shared page shell (heading + tab bar) around either `<FlashcardsReview>` or `<VocabularyFlashcards>`. `FlashcardsReview` loses its own full-page wrapper/heading so it can sit inside that shared shell (matching `VocabularyFlashcards`, which already has none). `/vocabulary/flashcards` becomes a redirect to `/flashcards?tab=vocabulary`. Both flashcard components' card-loading effects are rewritten to inline their fetch logic directly into `useEffect` with a local `cancelled` flag, removing the now-unneeded `useCallback` wrapper — matching the pattern already used in `components/VocabularyChatPanel.tsx`.

**Tech Stack:** Next.js App Router (server + client components), TypeScript, Tailwind CSS.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-17-flashcards-tabs-design.md`.
- No test framework exists in this repo (no jest/vitest, no `*.test.ts` files, no test script in `package.json`). Do not introduce one — verify via `npx tsc --noEmit` plus manual browser verification (flag as pending if no browser automation tool is available in your environment, same as prior work on this branch).
- Types must be explicit; do not use `any`.
- Default tab is `terms` unless `searchParams.tab === 'vocabulary'` exactly (anything else, including missing, falls back to `terms`).
- `/vocabulary/flashcards` becomes a redirect to `/flashcards?tab=vocabulary` — no auth check needed there since `/flashcards` performs its own.
- `components/VocabularyPageContent.tsx:42`'s `href="/vocabulary/flashcards"` changes to `href="/flashcards?tab=vocabulary"` to skip the extra redirect hop.
- The race-condition fix in both `VocabularyFlashcards.tsx` and `FlashcardsReview.tsx` inlines `loadCards`'s body directly into its `useEffect` with a local `cancelled` flag (checked before every state-setting call), removing the `useCallback` wrapper entirely — matching `components/VocabularyChatPanel.tsx:19-34`'s existing pattern. Do not invent a different guard shape (e.g. passing a callback parameter into a retained `useCallback`).
- Tab bar buttons reuse the exact segmented-button class pattern already used for `VocabularyFlashcards`'s own "All/Words/Idioms" filter (active: `bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900`; inactive: `bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700`).
- **Expected transient state:** after Task 2 (which strips `FlashcardsReview`'s own page wrapper) but before Task 3 (which gives `app/flashcards/page.tsx` a new shared wrapper), the `/flashcards` route will temporarily render without its background/padding/heading. This is expected and resolved by Task 3 in the same plan — do not treat it as a regression to fix within Task 2.
- Per project convention, subagent-driven implementers may commit per task without pausing for extra approval; merging/pushing/opening a PR still requires an explicit choice at the end.

---

### Task 1: Fix the card-loading race condition in `VocabularyFlashcards.tsx`

**Files:**
- Modify: `components/VocabularyFlashcards.tsx:1-34`

**Interfaces:**
- No change to `VocabularyFlashcards`'s exported signature (`export function VocabularyFlashcards()`, no props) — Task 3 will import it unchanged.

- [ ] **Step 1: Replace the imports and the `loadCards`/effect block**

In `components/VocabularyFlashcards.tsx`, replace:

```tsx
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
```

with:

```tsx
'use client';

import { useState, useEffect, useTransition } from 'react';
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getVocabularyReviewCards(filter === 'all' ? undefined : filter)
      .then((result) => {
        if (cancelled) return;
        const shuffled = [...result.new].sort(() => Math.random() - 0.5);
        setCards([...result.due, ...shuffled]);
        setCurrentIndex(0);
        setShowBack(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filter]);
```

Everything else in the file (from `const current = cards[currentIndex] ?? null;` onward) is unchanged.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors referencing `components/VocabularyFlashcards.tsx`.

- [ ] **Step 3: Manual verification**

Run: `yarn dev` (or check if already running). In the browser, visit `/vocabulary/flashcards` (this route still works unchanged — Task 3 will redirect it later) and confirm:
1. Cards still load and the deck still works (filter buttons, show answer, correct/incorrect grading).
2. Reload the page a few times and watch for the previously-reported symptom (a card flashing then switching to a different one right after load) — it should no longer happen.

If no browser automation tool is available in your environment, note this verification as pending for the human user, same as prior tasks on this branch — do not claim you observed something you couldn't.

- [ ] **Step 4: Commit**

```bash
git add components/VocabularyFlashcards.tsx
git commit -m "fix: prevent stale card order from overwriting fresh load in VocabularyFlashcards"
```

---

### Task 2: Fix the race condition and remove the page wrapper in `FlashcardsReview.tsx`

**Files:**
- Modify: `components/FlashcardsReview.tsx` (entire file)

**Interfaces:**
- `FlashcardsReview`'s exported signature is unchanged: `export function FlashcardsReview({ categories }: { categories: Category[] })`. Task 3 relies on this signature staying the same.
- Produces: the component now renders as a fragment-like `<div className="space-y-4">...</div>` with no page-level wrapper or `<h1>` — Task 3's page shell supplies those instead.

- [ ] **Step 1: Replace the entire file**

Replace the full contents of `components/FlashcardsReview.tsx` with:

```tsx
'use client';

import { useState, useEffect, useTransition } from 'react';
import Link from 'next/link';
import { getReviewCards, submitReview } from '@/actions/flashcards';
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getReviewCards(selectedCategories.length > 0 ? selectedCategories : undefined)
      .then((result) => {
        if (cancelled) return;
        const shuffled = [...result.new].sort(() => Math.random() - 0.5);
        setCards([...result.due, ...shuffled]);
        setCurrentIndex(0);
        setShowBack(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCategories]);

  const currentCard = cards[currentIndex] ?? null;
  const remainingCards = cards.slice(currentIndex);
  const dueCount = remainingCards.filter((c) => c.next_review !== null).length;
  const newCount = remainingCards.filter((c) => c.next_review === null).length;

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
      <div className="min-h-[300px] flex items-center justify-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading cards…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
                currentCard.content.split(/(__[^_]+__)/g).map((segment, i) => {
                  if (segment.match(/^__(.+)__$/)) {
                    return (
                      <span key={i} className="inline-block w-20 border-b-2 border-zinc-400 dark:border-zinc-500 mx-1" />
                    );
                  }
                  return <span key={i}>{segment}</span>;
                })
              )}
            </p>
          </div>

          {/* Term reference (only on back) */}
          {showBack && (
            <p className="text-xs text-zinc-400 dark:text-zinc-500 text-center">
              From: <Link href={`/terms/${currentCard.term_id}`} className="underline hover:text-zinc-600 dark:hover:text-zinc-300">{currentCard.term_name}</Link>
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
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors referencing `components/FlashcardsReview.tsx`.

- [ ] **Step 3: Manual verification**

Run: `yarn dev` (or check if already running). Visit `/flashcards`. Per this plan's Global Constraints, it is **expected** that the page now renders without its background/padding/heading (Task 3 restores that) — confirm instead that:
1. The category filter, card, and Show Answer/Correct/Incorrect flow all still work functionally.
2. Reload the page a few times and confirm no flash-then-switch card behavior.

If no browser automation tool is available, note this as pending for the human user.

- [ ] **Step 4: Commit**

```bash
git add components/FlashcardsReview.tsx
git commit -m "refactor: remove FlashcardsReview's own page wrapper and fix its card-loading race"
```

---

### Task 3: Add the tab bar to `/flashcards`, redirect the old vocabulary route, update the link

**Files:**
- Modify: `app/flashcards/page.tsx` (entire file)
- Modify: `app/vocabulary/flashcards/page.tsx` (entire file)
- Modify: `components/VocabularyPageContent.tsx:42`

**Interfaces:**
- Consumes: `FlashcardsReview` (`{ categories: Category[] }` prop, from Task 2) and `VocabularyFlashcards` (`export function VocabularyFlashcards()`, no props, from Task 1), both unchanged in shape from before this plan.

- [ ] **Step 1: Rewrite `app/flashcards/page.tsx`**

Replace the full contents of `app/flashcards/page.tsx` with:

```tsx
import { getCurrentUser } from '@/lib/auth';
import { getAllCategories } from '@/lib/db';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { FlashcardsReview } from '@/components/FlashcardsReview';
import { VocabularyFlashcards } from '@/components/VocabularyFlashcards';

type Tab = 'terms' | 'vocabulary';

export default async function FlashcardsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const params = await searchParams;
  const activeTab: Tab = params.tab === 'vocabulary' ? 'vocabulary' : 'terms';
  const categories = await getAllCategories(user.id);

  const tabClass = (tab: Tab) =>
    `px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
      activeTab === tab
        ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
    }`;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black p-4">
      <div className="max-w-lg mx-auto space-y-4">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Flashcards</h1>

        <div className="flex gap-2">
          <Link href="/flashcards?tab=terms" className={tabClass('terms')}>
            Terms
          </Link>
          <Link href="/flashcards?tab=vocabulary" className={tabClass('vocabulary')}>
            Vocabulary
          </Link>
        </div>

        {activeTab === 'terms' ? (
          <FlashcardsReview categories={categories} />
        ) : (
          <VocabularyFlashcards />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `app/vocabulary/flashcards/page.tsx`**

Replace the full contents of `app/vocabulary/flashcards/page.tsx` with:

```tsx
import { redirect } from 'next/navigation';

export default function VocabularyFlashcardsRedirect() {
  redirect('/flashcards?tab=vocabulary');
}
```

- [ ] **Step 3: Update the link in `components/VocabularyPageContent.tsx`**

At line 42, replace:

```tsx
          href="/vocabulary/flashcards"
```

with:

```tsx
          href="/flashcards?tab=vocabulary"
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Manual verification**

Run: `yarn dev` (or check if already running). In the browser:
1. Visit `/flashcards` — confirm it shows the "Flashcards" heading, a Terms/Vocabulary tab bar with "Terms" active by default, and the term flashcards deck below it, fully styled (background, padding, heading all restored).
2. Click the "Vocabulary" tab — confirm the URL becomes `/flashcards?tab=vocabulary` and the vocabulary/idiom deck renders in the same styled shell, with "Vocabulary" now shown as the active tab.
3. Click back to "Terms" — confirm it switches back correctly.
4. Visit `/flashcards?tab=vocabulary` directly (fresh navigation, not a click) — confirm it lands on the Vocabulary tab.
5. Visit `/vocabulary/flashcards` directly — confirm it redirects to `/flashcards?tab=vocabulary`.
6. Go to `/vocabulary`, click its "Flashcards" link — confirm it goes straight to `/flashcards?tab=vocabulary` (no intermediate redirect).
7. Reload both tabs a few times each and confirm no flash-then-switch card behavior on either.

If no browser automation tool is available, note this as pending for the human user — this is the integration point of the whole plan, so flag clearly which of these 7 checks could not be performed.

- [ ] **Step 6: Commit**

```bash
git add app/flashcards/page.tsx app/vocabulary/flashcards/page.tsx components/VocabularyPageContent.tsx
git commit -m "feat: add Terms/Vocabulary tabs to the flashcards page"
```

---

## Final Step

After Task 3 passes, stop and present the standard finishing-a-development-branch options (merge, PR, or further changes) — do not merge or push without the user's explicit choice.
