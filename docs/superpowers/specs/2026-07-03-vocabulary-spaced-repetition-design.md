# Spaced Repetition for Vocabulary Flashcards

**Date:** 2026-07-03
**Status:** Approved

## Goal

Replace the current "browse all words randomly" vocabulary flashcard page with a
spaced-repetition review session that reuses the exact system already proven in the
terms flashcards (`components/FlashcardsReview.tsx`, `reviewFlashcard` in `lib/db.ts`).

## Current State

- `vocabulary_words` has no scheduling columns.
- `components/VocabularyFlashcards.tsx` receives all words from the server page and
  cycles through them in random order with a "Next Card" button. No grading, no
  scheduling.
- The terms system already implements SRS: `interval_step`, `next_review`,
  `last_reviewed`, `SRS_INTERVALS = [1, 3, 7, 14, 30, 60]`, Correct/Incorrect grading,
  and a due+new review session.

## Approach

Mirror the terms architecture directly. Reuse `SRS_INTERVALS` and the identical review
algorithm. No changes to the working terms code path. No shared-engine refactor (YAGNI).

## Changes

### 1. Schema — `supabase/migrations/2026-07-03-vocabulary-srs-columns.sql`

```sql
ALTER TABLE vocabulary_words
  ADD COLUMN interval_step INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN next_review   TIMESTAMPTZ,
  ADD COLUMN last_reviewed TIMESTAMPTZ;
CREATE INDEX idx_vocabulary_words_user_next_review
  ON vocabulary_words(user_id, next_review);
```

Existing words default to `interval_step = 0, next_review = NULL`, so they are treated
as **new** with no backfill needed. The migration is applied by the user (project rule:
do not run Supabase commands).

### 2. `lib/db.ts`

- Extend the `VocabularyWord` type with `interval_step: number`,
  `next_review: string | null`, `last_reviewed: string | null`.
- Reuse the exported `SRS_INTERVALS`.
- New functions, filtered by optional `type: 'word' | 'idiom'` (the vocab analogue of
  the terms category filter):
  - `getDueVocabularyWords(userId, type?)` — `next_review` not null AND `<= now`,
    ordered by `next_review` ascending.
  - `getNewVocabularyWords(userId, type?)` — `next_review IS NULL`.
  - `reviewVocabularyWord(id, userId, correct, timezone?)` — identical to
    `reviewFlashcard`: correct → `min(interval_step + 1, len-1)`, incorrect → `0`;
    `next_review = start-of-today(timezone) + SRS_INTERVALS[newStep]` days;
    `last_reviewed = now`.
  - `resetVocabularyReview(id, userId)` — set `interval_step = 0`,
    `next_review = null`, `last_reviewed = null`.

### 3. `actions/vocabulary.ts`

- `getVocabularyReviewCards(type?)` → `{ due: VocabularyWord[]; new: VocabularyWord[] }`.
  Fetches due + new (new shuffled by the client, matching `FlashcardsReview`).
  **Simplification vs terms:** no "one card per item per day" throttle. Terms need it
  because one term owns many cloze cards; a vocabulary word is exactly one card, and
  grading always pushes `next_review` at least one day out, so a word cannot recur in
  the same session.
- `submitVocabularyReview(id, correct)` — calls `reviewVocabularyWord`, then
  `revalidatePath('/vocabulary/flashcards')`.
- `resetVocabularyReviewAction(id)` — calls `resetVocabularyReview`, then
  `revalidatePath('/vocabulary')` (for the optional list Reset button).

### 4. `components/VocabularyFlashcards.tsx` (rebuild)

Rebuilt on the `FlashcardsReview` pattern:

- Self-fetches due + new via `getVocabularyReviewCards` on mount and whenever the
  filter changes. Order: due first, then shuffled new.
- Keeps the existing **all / word / idiom** filter (maps to the terms category filter).
- Front: existing cloze render on `flashcard_sentence`.
- **Show Answer** reveals the filled sentence plus the existing rich back
  (Definition, Context, Connections, Morphology, and the `VocabularyImage`). We keep the
  richer back rather than the terms' minimal answer view.
- Replaces "Next Card" with **Incorrect / Correct** buttons, showing the
  "Incorrect: 1 day / Correct: N days" hint and `X due / Y new` progress.
- Empty state: "All caught up!".

### 5. `app/vocabulary/flashcards/page.tsx`

No longer preloads all words. Keeps the auth check and renders the self-fetching
`<VocabularyFlashcards />`.

### 6. Optional parity add-on — `components/VocabularyList.tsx`

In the expanded word card, show the word's interval / next-review and a **Reset**
button, mirroring `FlashcardSection` for terms. Included by default; low cost.

## Out of Scope

- Sharing/extracting a generic SR engine between terms and vocab.
- Any change to the existing terms flashcard behavior.
- Per-word multiple flashcards (a vocab word remains a single card).

## Testing

- `reviewVocabularyWord`: correct advances the interval step (capped at the last
  interval) and schedules `next_review` at start-of-today + interval; incorrect resets
  to step 0 (1 day). Timezone respected.
- `getDueVocabularyWords` / `getNewVocabularyWords`: correct partitioning by
  `next_review` and `type` filter.
- Review session: due-first ordering, grading advances the card and removes it from the
  session, empty state when nothing is due.
