# Disable a Vocabulary Word's Flashcard from Review

## Problem

Some vocabulary words should stay in the collection but stop appearing in the
`/vocabulary/flashcards` spaced-repetition review. This mirrors the term-level
`flashcards_disabled` feature, applied to the vocabulary subsystem.

Unlike terms (which own a separate `flashcards` table), a vocabulary word *is* its own
flashcard — the SRS columns (`interval_step`, `next_review`, `last_reviewed`) live directly
on `vocabulary_words`. So "disable a word's flashcard" means "exclude this word from
vocabulary review."

## Decisions

Inherited from the term feature (`2026-07-16-disable-term-flashcards-design.md`):

- **Granularity:** word-level. Each word is one card, so the toggle is inherently per-word.
- **Scope of hide:** disabled words remain fully visible and editable in the vocabulary
  word list. Only the `/vocabulary/flashcards` review queue excludes them.
- **Re-enable:** resumes the word's existing SRS schedule. Only the boolean flips; no
  schedule column is touched. A word that was due becomes due again immediately.

## Design

### 1. Schema

New migration `supabase/migrations/20260716000002_vocabulary_flashcards_disabled.sql`:

```sql
ALTER TABLE vocabulary_words ADD COLUMN IF NOT EXISTS flashcards_disabled boolean NOT NULL DEFAULT false;
```

Version `20260716000002` avoids the `20260716000000` / `20260716000001` prefixes already in
use. `IF NOT EXISTS` keeps the apply idempotent. The `false` default keeps all existing
words enabled. The migration file is created but not applied by the implementer (project
rule: do not run supabase commands).

### 2. Data layer (`lib/db.ts`)

- Add `flashcards_disabled: boolean` to the `VocabularyWord` type. All vocabulary reads use
  `select('*')`, so the column flows through automatically.
- In `getDueVocabularyWords` and `getNewVocabularyWords`, add `.eq('flashcards_disabled', false)`.
  No join is needed — it is a direct column on `vocabulary_words`.
- Add a focused writer mirroring `resetVocabularyReview`:

  ```ts
  setVocabularyWordDisabled(id: number, userId: string, disabled: boolean): Promise<VocabularyWord>
  ```

  Updates only `flashcards_disabled`, returns the updated row.

### 3. Server action (`actions/vocabulary.ts`)

```ts
setVocabularyWordFlashcardsDisabled(id: number, disabled: boolean): Promise<VocabularyWord>
```

Auth-guarded like the other vocabulary actions. Calls `setVocabularyWordDisabled(id, user.id, disabled)`,
then `revalidatePath('/vocabulary')` and `revalidatePath('/vocabulary/flashcards')`, returns
the updated word.

### 4. UI (`VocabularyWordRow`)

- In the expanded row's action bar (alongside Regenerate / Reset / Delete), add an
  "Include in flashcard review" toggle.
- On change, call `setVocabularyWordFlashcardsDisabled` inside the component's existing
  `useTransition`, and pass the returned word to the existing `onUpdated` callback so the
  parent list stays in sync (no separate optimistic local state needed — `onUpdated` already
  drives the row from `word`).
- A short helper line appears when the word is disabled.

### 5. Testing

No test framework exists in the repo. Verification is `yarn build` + `yarn lint`, plus
manual checks:

- Disable a word that has a due card → it no longer appears in `/vocabulary/flashcards`.
- Re-enable the word → it returns to review with its schedule intact.
- Toggle state persists across a reload.

## Out of scope (YAGNI)

- No idiom-vs-word distinction for the toggle (applies per word regardless of `type`).
- No bulk enable/disable.
- No hiding disabled words from the word list.
