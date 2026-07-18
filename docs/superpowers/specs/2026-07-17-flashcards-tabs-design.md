# Flashcards Page Tabs — Design

**Date:** 2026-07-17
**Status:** Approved (pending spec review)

## Goal

Today there are two separate flashcard pages: `/flashcards` (term flashcards,
linked from the main nav) and `/vocabulary/flashcards` (vocabulary/idiom
flashcards, linked from the Vocabulary page). Consolidate them into one page
at `/flashcards` with a tab bar to switch between "Terms" and "Vocabulary",
so reviewing either deck doesn't require separate navigation.

## Decisions

- **Single route:** `/flashcards` becomes the one entry point. Tab state
  lives in the URL (`?tab=terms` | `?tab=vocabulary`), read server-side —
  matches this codebase's existing convention (e.g. `app/terms/page.tsx`
  reads pagination/search state the same way). Switching tabs is a normal
  navigation, not client-only state: refresh-safe, shareable, no new loading
  skeleton needed since each tab's content already manages its own loading
  state.
- **Default tab:** `terms` when `?tab=` is absent or anything other than
  `vocabulary` — preserves today's behavior for the nav's existing
  `/flashcards` link and any old bookmarks.
- **Old vocabulary route:** `/vocabulary/flashcards` becomes a redirect to
  `/flashcards?tab=vocabulary` (backward-compatible for existing
  bookmarks/links). `components/VocabularyPageContent.tsx:18`'s own link is
  repointed straight to `/flashcards?tab=vocabulary` to skip the extra hop.
- **Tab bar style:** Two `<Link>`s styled like the segmented-button filter
  already used inside `VocabularyFlashcards` (`bg-zinc-900 dark:bg-zinc-100`
  active / `bg-zinc-100 dark:bg-zinc-800` inactive, rounded-lg) — reuses an
  existing visual pattern rather than inventing a new one.
- **Shared page shell:** `FlashcardsReview` currently renders its own
  full-page wrapper (`min-h-screen bg-zinc-50... p-4`, `max-w-lg mx-auto`)
  and its own `<h1>Flashcards</h1>` — built as a whole page, not a tab's
  content. It loses that outer wrapper/heading so it can sit under one
  shared shell (background, `max-w-lg` container, `Flashcards` heading, tab
  bar) alongside `VocabularyFlashcards`, which already has no wrapper of its
  own. Everything else in `FlashcardsReview` (category filter, card,
  review buttons) is unchanged.
- **Bundled bug fix:** Since this touches `FlashcardsReview.tsx` anyway, and
  `VocabularyFlashcards.tsx` has an already-diagnosed bug of the same shape,
  fix both. Root cause: this app's `app/` directory runs under React Strict
  Mode by default in dev (confirmed via
  `node_modules/next/dist/build/define-env.js:143-144` — `reactStrictMode`
  is unset in `next.config.ts`, and `__NEXT_STRICT_MODE_APP` defaults to
  `true` in that case), which double-invokes mount effects. Both
  components' card-loading effects call an async function that reshuffles
  "new" cards with `Math.random()` and have no guard against a stale
  response overwriting a newer one — so the two Strict-Mode-triggered calls
  race, and whichever resolves last wins, causing a visible flash from one
  shuffled order to another right after cards load. Fix: apply the same
  `let cancelled = false` / `return () => { cancelled = true }` guard
  already used in `VocabularyChatPanel.tsx`, `VocabularySentencePracticePanel.tsx`,
  `CitationsList.tsx`, and `TermSearchResults.tsx` in this codebase, checking
  `cancelled` before every state-setting call inside `loadCards`.

## Components & Interfaces

### `app/flashcards/page.tsx` (rewritten)

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

### `components/FlashcardsReview.tsx`

Remove the outer wrapper and heading. Its `return` currently starts:

```tsx
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black p-4">
      <div className="max-w-lg mx-auto space-y-4">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Flashcards</h1>

        {/* Category filter */}
```

becomes:

```tsx
  return (
    <div className="space-y-4">
        {/* Category filter */}
```

(closing tags adjusted to match — one wrapping `<div>` removed, not two). Its
loading-state early return similarly drops the `min-h-screen`/full-page
classes to a plain `<div className="flex items-center justify-center py-12">`
matching `VocabularyFlashcards`'s own loading-state markup for tab-to-tab
visual consistency.

### `components/FlashcardsReview.tsx` / `components/VocabularyFlashcards.tsx` — race fix

In both files, `loadCards` is a `useCallback`-wrapped function used by
exactly one `useEffect` and nowhere else. Rather than introduce a new
callback-parameter shape, inline it into the effect — removing the
`useCallback` wrapper entirely — matching the exact pattern already used in
`VocabularyChatPanel.tsx:19-34`.

`VocabularyFlashcards.tsx` changes from:

```ts
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

to:

```ts
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

`FlashcardsReview.tsx` gets the same treatment: its `loadCards(categoryNames?: string[])`
body (calling `getReviewCards`) inlines into its effect the same way, keyed
on `[selectedCategories]` instead of `[filter]`. Since `loadCards` is removed
from both files, their now-unused `useCallback` import is dropped too (both
still use `useState`/`useEffect`/`useTransition`).

### `app/vocabulary/flashcards/page.tsx` (rewritten)

```tsx
import { redirect } from 'next/navigation';

export default function VocabularyFlashcardsRedirect() {
  redirect('/flashcards?tab=vocabulary');
}
```

No auth check needed here — `/flashcards` performs its own.

### `components/VocabularyPageContent.tsx`

Line 18's `href="/vocabulary/flashcards"` becomes
`href="/flashcards?tab=vocabulary"`.

## Data Flow

Both tabs' data flow are otherwise unchanged: `FlashcardsReview` still
fetches its own review cards client-side via `getReviewCards`/`submitReview`,
`VocabularyFlashcards` still fetches via `getVocabularyReviewCards`/
`submitVocabularyReview`. Only the page shell and effect-cancellation guard
change.

## Error Handling

No new error states. Auth redirect, empty-deck ("All caught up!") messaging,
and per-tab loading text all carry over unchanged from today.

## Testing

Same convention as the rest of this codebase (no test framework exists):
`npx tsc --noEmit` for type-checking, plus manual browser verification —
both tabs render and switch correctly, `/flashcards?tab=vocabulary` deep-link
works, `/vocabulary/flashcards` redirects correctly, and the flash-then-shift
symptom is gone on repeated dev-server reloads of both tabs.

## Out of Scope (YAGNI)

- Persisting a "last used tab" preference (explicitly decided against —
  default is always `terms`).
- Any change to how `FlashcardsReview` or `VocabularyFlashcards` fetch or
  shuffle cards beyond the cancellation guard.
- Any change to `VocabularyPageContent.tsx` beyond the one link's `href`.
