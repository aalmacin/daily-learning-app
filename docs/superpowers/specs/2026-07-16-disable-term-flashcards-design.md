# Disable a Term's Flashcards from Review

## Problem

Some terms should stay in the knowledge base but stop appearing in the `/flashcards`
spaced-repetition review. Today every term with cards is eligible for review, with no way
to pause one without deleting its cards (which loses the SRS schedule).

## Decisions

- **Granularity:** term-level only. Disabling a term hides all of its cards from review.
  No per-card disable flag.
- **Scope of hide:** disabled terms and their cards remain fully visible and editable on
  the term detail page. Only the `/flashcards` review queue excludes them.
- **Re-enable:** resumes each card's existing SRS schedule (`interval_step`,
  `next_review`, `last_reviewed` are untouched). A card that was due becomes due again
  immediately on re-enable.

## Design

### 1. Schema

New migration `supabase/migrations/<timestamp>_term_flashcards_disabled.sql`:

```sql
ALTER TABLE terms ADD COLUMN flashcards_disabled boolean NOT NULL DEFAULT false;
```

The `false` default keeps all existing terms enabled. The migration file is created but
not applied by the implementer (project rule: do not run supabase commands).

### 2. Data layer (`lib/db.ts`)

- Add `flashcards_disabled: boolean` to the `Term` type. Because it is not omitted from
  `TermRow` and existing term reads use `select('*')`, `getTermById` and list queries pick
  up the column without further query changes.
- Add `flashcards_disabled` to `updateTerm`'s allowed `fields` mapping.
- In `getDueFlashcards` and `getNewFlashcards`, switch the terms join to an inner join and
  filter disabled terms out at the source:

  ```ts
  .select('*, terms!inner(name, flashcards_disabled)')
  .eq('terms.flashcards_disabled', false)
  ```

  The existing row mapping continues to read `terms.name`; the extra selected column is
  only used for filtering.

### 3. Server action (`actions/flashcards.ts`)

```ts
setTermFlashcardsDisabled(termId: number, disabled: boolean): Promise<Term>
```

Auth-guarded like the other actions. Calls `updateTerm(termId, { flashcards_disabled: disabled })`,
then `revalidatePath('/terms/${termId}')` and `revalidatePath('/flashcards')`.

### 4. UI (`FlashcardSection`, term detail Step 4)

- `FlashcardSection` gains a `flashcardsDisabled: boolean` prop, passed from `term` in
  `TermDetailPage`.
- A toggle in the section header labeled "Include in flashcard review" with a helper line:
  "Disabled terms are hidden from review but keep their cards and schedule."
- Uses `useTransition`. On failure it reverts the optimistic state and shows the existing
  error styling used elsewhere in the component.

### 5. Testing

Playwright e2e:

- Disable a term that has a due card → the card no longer appears in the `/flashcards`
  review queue.
- Re-enable the term → the card returns to review with its schedule intact.
- Toggle state persists across a page reload.

## Out of scope (YAGNI)

- Per-card disable.
- Terms-table badge or bulk enable/disable.
- Hiding disabled cards on the term detail page.
