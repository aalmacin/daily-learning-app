# Plan: Spaced Repetition for Vocabulary Flashcards

Spec: `docs/superpowers/specs/2026-07-03-vocabulary-spaced-repetition-design.md`
Base commit: `178efd1`

## Global Constraints

- **Reuse, do not redefine** `SRS_INTERVALS` (`lib/db.ts`, `[1, 3, 7, 14, 30, 60]`).
- `reviewVocabularyWord` must use the **identical algorithm** to `reviewFlashcard`
  (`lib/db.ts`): correct → `min(interval_step + 1, SRS_INTERVALS.length - 1)`;
  incorrect → `0`; `next_review = start-of-today(timezone) + SRS_INTERVALS[newStep]`
  days; `last_reviewed = now`. Reuse the existing `getStartOfDay` helper.
- **Do not modify** the terms flashcard behavior (`reviewFlashcard`, `getReviewCards`,
  `FlashcardsReview`, `FlashcardSection`, `flashcards` table). Follow their patterns.
- **No `any`, no `@ts-ignore`, no ignored types** (project rule). All new code fully typed.
- **Do NOT run Supabase commands.** Migrations are SQL files only, applied by the user.
- **Timezone**: resolve via `getUserSettings(user.id)` and pass `settings?.timezone`,
  exactly as `submitReview` does in `actions/flashcards.ts`.
- **Verification gates** (this project has NO unit-test harness — do not add one):
  `npx tsc --noEmit`, `npm run lint`, `npm run build` must all pass.
- Follow existing file conventions (Supabase `as unknown as never` cast idiom in
  `lib/db.ts`, `'use server'` action style, Tailwind class patterns).

## Task 1: Data layer + server actions

**Files:** `supabase/migrations/2026-07-03-vocabulary-srs-columns.sql` (new),
`lib/db.ts`, `actions/vocabulary.ts`.

### 1a. Migration
Create `supabase/migrations/2026-07-03-vocabulary-srs-columns.sql`:
```sql
ALTER TABLE vocabulary_words
  ADD COLUMN interval_step INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN next_review   TIMESTAMPTZ,
  ADD COLUMN last_reviewed TIMESTAMPTZ;
CREATE INDEX idx_vocabulary_words_user_next_review
  ON vocabulary_words(user_id, next_review);
```

### 1b. `lib/db.ts`
- Add to the `VocabularyWord` type (after `image_model`):
  `interval_step: number;`, `next_review: string | null;`, `last_reviewed: string | null;`
- Add functions (mirror the corresponding flashcard functions; filter by optional
  `type?: 'word' | 'idiom'`):
  - `getDueVocabularyWords(userId: string, type?: 'word' | 'idiom'): Promise<VocabularyWord[]>`
    — `.eq('user_id', userId)`, `.not('next_review', 'is', null)`,
    `.lte('next_review', new Date().toISOString())`, optional `.eq('type', type)`,
    `.order('next_review', { ascending: true })`.
  - `getNewVocabularyWords(userId: string, type?: 'word' | 'idiom'): Promise<VocabularyWord[]>`
    — `.eq('user_id', userId)`, `.is('next_review', null)`, optional `.eq('type', type)`.
  - `reviewVocabularyWord(id: number, userId: string, correct: boolean, timezone?: string): Promise<VocabularyWord>`
    — fetch row, compute `newStep`, update `interval_step` / `next_review` /
    `last_reviewed` per the Global Constraints algorithm, return updated row.
    Reuse `getStartOfDay(timezone)` and `SRS_INTERVALS`.
  - `resetVocabularyReview(id: number, userId: string): Promise<VocabularyWord>`
    — update `interval_step: 0, next_review: null, last_reviewed: null`, return row.

### 1c. `actions/vocabulary.ts`
- `getVocabularyReviewCards(type?: 'word' | 'idiom'): Promise<{ due: VocabularyWord[]; new: VocabularyWord[] }>`
  — auth; `Promise.all([getDueVocabularyWords, getNewVocabularyWords])`; return `{ due, new }`.
  No per-day throttle (a vocab word is a single card; grading always pushes
  `next_review` at least one day out).
- `submitVocabularyReview(id: number, correct: boolean): Promise<VocabularyWord>`
  — auth; `getUserSettings`; `reviewVocabularyWord(id, user.id, correct, settings?.timezone)`;
  `revalidatePath('/vocabulary/flashcards')`.
- `resetVocabularyReviewAction(id: number): Promise<VocabularyWord>`
  — auth; `resetVocabularyReview(id, user.id)`; `revalidatePath('/vocabulary')`.

**Verify:** `npx tsc --noEmit` and `npm run lint` clean.

## Task 2: Review-session UI

**Files:** `components/VocabularyFlashcards.tsx` (rebuild),
`app/vocabulary/flashcards/page.tsx`, `components/VocabularyList.tsx`.

### 2a. `components/VocabularyFlashcards.tsx`
Rebuild on the `components/FlashcardsReview.tsx` pattern:
- Props: none required (self-fetching). Remove the `words` prop.
- State: `filter: 'all' | 'word' | 'idiom'`, `cards: VocabularyWord[]`, `currentIndex`,
  `showBack`, `loading`, `isPending` (useTransition).
- `loadCards(type?)`: call `getVocabularyReviewCards(filter === 'all' ? undefined : filter)`;
  set `cards = [...due, ...shuffle(new)]`; reset index/showBack. Call in `useEffect` on
  mount and when `filter` changes (useCallback like `FlashcardsReview`).
- Keep the existing **all / word / idiom** filter buttons.
- Front: existing `renderCloze(current.flashcard_sentence)`.
- **Show Answer** reveals `renderComplete(...)` plus the existing rich back
  (Definition / Context / Connections / Morphology + `<VocabularyImage>`). Keep the
  `VocabularyImage` `onGenerated` local-state update (update the matching card in `cards`).
- Replace the single "Next Card" button with **Incorrect / Correct** buttons (red/green,
  same styling as `FlashcardsReview`) that call `submitVocabularyReview(current.id, correct)`
  inside `startTransition`, then advance (`currentIndex + 1`, or empty the deck when last).
- Show the "Incorrect: 1 day / Correct: N days" hint (N = `SRS_INTERVALS[min(step+1, len-1)]`)
  and `X due / Y new` progress (due = `next_review !== null`).
- Loading state and "All caught up!" empty state.

### 2b. `app/vocabulary/flashcards/page.tsx`
- Remove the `getVocabularyWords` preload. Keep auth (`getCurrentUser` / redirect).
- Render `<VocabularyFlashcards />` with no props.

### 2c. `components/VocabularyList.tsx`
In the expanded word card, before Delete, add an SR status row + **Reset** button
mirroring `FlashcardSection` (`components/FlashcardSection.tsx`):
- If `w.next_review`: show `Interval: {SRS_INTERVALS[w.interval_step]}d`,
  `Next: {formatted}`, `Last: {formatted}`. Else: "New — not yet reviewed".
- **Reset** button calls `resetVocabularyReviewAction(w.id)` (in a transition) and updates
  local `words` state with the returned row.

**Verify:** `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean.
`/vocabulary/flashcards` and `/vocabulary` build successfully.
