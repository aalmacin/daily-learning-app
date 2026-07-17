# Disable Vocabulary Flashcards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-word toggle that excludes a vocabulary word from the `/vocabulary/flashcards` review queue without deleting it or losing its SRS schedule.

**Architecture:** A `flashcards_disabled` boolean column on `vocabulary_words` drives everything. The two review queries (`getDueVocabularyWords`, `getNewVocabularyWords`) add a direct `.eq('flashcards_disabled', false)` filter (no join — a word is its own card). A focused db writer flips the flag, a server action wraps it, and a toggle in `VocabularyWordRow` calls it. Disabled words stay fully visible/editable in the word list.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase (Postgres), TypeScript, React 19, Tailwind.

## Global Constraints

- Always use explicit types; never suppress type errors. (`VocabularyWord` gains `flashcards_disabled: boolean`.)
- No test framework exists in this repo (scripts: dev/build/start/lint only). Verification is `yarn build` + `yarn lint` plus manual checks. Do NOT set up a test framework or write automated tests — TDD is not applicable.
- The migration SQL file is created but NOT applied by the implementer (project rule: do not run supabase commands). The user applies it. Migration version must be `20260716000002` (000000 and 000001 prefixes are already taken) and use `ADD COLUMN IF NOT EXISTS`.
- Do not read `.env` files. Do not commit unless the operator running the plan is committing per task (this run: commit per task).
- Behavior mirrors the term feature: word-level only; disabled words are hidden from review only (stay visible/editable in the list); re-enable only flips the boolean and never touches `interval_step` / `next_review` / `last_reviewed`.

---

### Task 1: Schema + data-model plumbing for `vocabulary_words.flashcards_disabled`

**Files:**
- Create: `supabase/migrations/20260716000002_vocabulary_flashcards_disabled.sql`
- Modify: `lib/db.ts:1329-1348` (add field to `VocabularyWord` type)

**Interfaces:**
- Produces: `VocabularyWord.flashcards_disabled: boolean`. All vocabulary reads use `select('*')`, so every `getVocabularyWord*` reader returns the column with no query change.

- [ ] **Step 1: Create the migration file**

`supabase/migrations/20260716000002_vocabulary_flashcards_disabled.sql`:

```sql
ALTER TABLE vocabulary_words ADD COLUMN IF NOT EXISTS flashcards_disabled boolean NOT NULL DEFAULT false;
```

- [ ] **Step 2: Add the field to the `VocabularyWord` type**

In `lib/db.ts`, the `VocabularyWord` type currently ends with:

```ts
  interval_step: number;
  next_review: string | null;
  last_reviewed: string | null;
  created_at: string;
  updated_at: string;
};
```

Add the new field right after `updated_at: string;` (before the closing `};`):

```ts
  created_at: string;
  updated_at: string;
  flashcards_disabled: boolean;
};
```

- [ ] **Step 3: Typecheck**

Run: `yarn build`
Expected: build succeeds. If adding the required field surfaces a type error in a hand-built `VocabularyWord` literal, fix it there. Note: `insertVocabularyWord` takes an `Omit<VocabularyWord, ...>` input and callers build that input object — if the compiler now requires `flashcards_disabled` in that input, add `flashcards_disabled: false` at the call site(s), OR add `'flashcards_disabled'` to the `Omit<...>` list on `insertVocabularyWord`'s parameter so new words rely on the DB default. Prefer adding it to the `Omit` list (cleaner — the DB default handles it). Fix any such errors before continuing.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260716000002_vocabulary_flashcards_disabled.sql lib/db.ts
git commit -m "feat: add flashcards_disabled column and VocabularyWord field"
```

---

### Task 2: Exclude disabled words from the review queues + add the writer

**Files:**
- Modify: `lib/db.ts:1461-1474` (`getDueVocabularyWords`)
- Modify: `lib/db.ts:1476-1487` (`getNewVocabularyWords`)
- Modify: `lib/db.ts` (add `setVocabularyWordDisabled` near `resetVocabularyReview`, ~line 1536)

**Interfaces:**
- Consumes: `VocabularyWord.flashcards_disabled` (Task 1).
- Produces:
  - `getDueVocabularyWords` / `getNewVocabularyWords` return only words with `flashcards_disabled = false`.
  - `setVocabularyWordDisabled(id: number, userId: string, disabled: boolean): Promise<VocabularyWord>`.

- [ ] **Step 1: Filter `getDueVocabularyWords`**

In `lib/db.ts`, the current query builder is:

```ts
  let query = getSupabase()
    .from('vocabulary_words')
    .select('*')
    .eq('user_id', userId)
    .not('next_review', 'is', null)
    .lte('next_review', new Date().toISOString());
```

Add the filter:

```ts
  let query = getSupabase()
    .from('vocabulary_words')
    .select('*')
    .eq('user_id', userId)
    .eq('flashcards_disabled', false)
    .not('next_review', 'is', null)
    .lte('next_review', new Date().toISOString());
```

- [ ] **Step 2: Filter `getNewVocabularyWords`**

Current:

```ts
  let query = getSupabase()
    .from('vocabulary_words')
    .select('*')
    .eq('user_id', userId)
    .is('next_review', null);
```

Add the filter:

```ts
  let query = getSupabase()
    .from('vocabulary_words')
    .select('*')
    .eq('user_id', userId)
    .eq('flashcards_disabled', false)
    .is('next_review', null);
```

- [ ] **Step 3: Add the `setVocabularyWordDisabled` writer**

In `lib/db.ts`, immediately after the `resetVocabularyReview` function (which ends around line 1536), add a writer mirroring its shape:

```ts
export async function setVocabularyWordDisabled(id: number, userId: string, disabled: boolean): Promise<VocabularyWord> {
  const { data, error } = await getSupabase()
    .from('vocabulary_words')
    .update({ flashcards_disabled: disabled } as unknown as never)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) throw error;
  return data as VocabularyWord;
}
```

- [ ] **Step 4: Typecheck**

Run: `yarn build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts
git commit -m "feat: exclude disabled words from vocabulary review and add disable writer"
```

---

### Task 3: Server action to toggle the flag

**Files:**
- Modify: `actions/vocabulary.ts` (import `setVocabularyWordDisabled`, add action)

**Interfaces:**
- Consumes: `setVocabularyWordDisabled(id, userId, disabled)` (Task 2).
- Produces: `setVocabularyWordFlashcardsDisabled(id: number, disabled: boolean): Promise<VocabularyWord>`.

- [ ] **Step 1: Import the writer**

In `actions/vocabulary.ts`, the named import block from `@/lib/db` includes `resetVocabularyReview,`. Add `setVocabularyWordDisabled,` to that import list (e.g. right after `resetVocabularyReview,`):

```ts
  reviewVocabularyWord,
  resetVocabularyReview,
  setVocabularyWordDisabled,
  setMainContextSentence,
```

- [ ] **Step 2: Add the action**

The existing `resetVocabularyReviewAction` is the pattern to mirror:

```ts
export async function resetVocabularyReviewAction(id: number): Promise<VocabularyWord> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const word = await resetVocabularyReview(id, user.id);
  revalidatePath('/vocabulary');
  return word;
}
```

Add this new action right after it:

```ts
export async function setVocabularyWordFlashcardsDisabled(id: number, disabled: boolean): Promise<VocabularyWord> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const word = await setVocabularyWordDisabled(id, user.id, disabled);
  revalidatePath('/vocabulary');
  revalidatePath('/vocabulary/flashcards');
  return word;
}
```

- [ ] **Step 3: Typecheck**

Run: `yarn build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add actions/vocabulary.ts
git commit -m "feat: add setVocabularyWordFlashcardsDisabled server action"
```

---

### Task 4: Toggle UI in the vocabulary word row

**Files:**
- Modify: `components/VocabularyWordRow.tsx`

**Interfaces:**
- Consumes: `setVocabularyWordFlashcardsDisabled` (Task 3); `word.flashcards_disabled` (Task 1).
- Produces: user-facing "Include in flashcard review" toggle in the expanded row's action bar.

- [ ] **Step 1: Import the action**

In `components/VocabularyWordRow.tsx`, the current import on line 4 is:

```ts
import { removeVocabularyWord, resetVocabularyReviewAction, setWordMainContext, regenerateVocabularyWord } from '@/actions/vocabulary';
```

Add the new action:

```ts
import { removeVocabularyWord, resetVocabularyReviewAction, setWordMainContext, regenerateVocabularyWord, setVocabularyWordFlashcardsDisabled } from '@/actions/vocabulary';
```

- [ ] **Step 2: Add the toggle handler**

Add this handler alongside the other handlers in the component (e.g. after `handleRegenerate`). It calls the action in the existing `startTransition` and passes the updated word to `onUpdated` so the parent list re-renders the row:

```ts
  const handleToggleDisabled = () => {
    startTransition(async () => {
      const updated = await setVocabularyWordFlashcardsDisabled(w.id, !w.flashcards_disabled);
      onUpdated(updated);
    });
  };
```

- [ ] **Step 3: Render the toggle in the action bar**

In `components/VocabularyWordRow.tsx`, the SRS-info + actions block is:

```tsx
          <div className="pt-2 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
            <div className="flex flex-wrap gap-2 text-xs text-zinc-400 dark:text-zinc-500">
              {w.next_review ? (
                <>
                  <span>Interval: {SRS_INTERVALS[w.interval_step]}d</span>
                  <span>Next: {formatDate(w.next_review)}</span>
                  <span>Last: {formatDate(w.last_reviewed)}</span>
                </>
              ) : (
                <span>New — not yet reviewed</span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleRegenerate}
                disabled={isPending}
                className="px-2 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
              >
                Regenerate
              </button>
```

Add an "Include in flashcard review" label+checkbox as the first item in the `flex gap-2` actions `<div>` (immediately before the Regenerate button):

```tsx
            <div className="flex gap-2 items-center">
              <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={!w.flashcards_disabled}
                  onChange={handleToggleDisabled}
                  disabled={isPending}
                  className="accent-zinc-900 dark:accent-zinc-100"
                />
                In review
              </label>
              <button
                onClick={handleRegenerate}
                disabled={isPending}
                className="px-2 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
              >
                Regenerate
              </button>
```

(Only the wrapping `<div className="flex gap-2">` gains `items-center` and the new `<label>` is inserted before Regenerate; the Reset and Delete buttons are unchanged.)

- [ ] **Step 4: Add the disabled helper line**

Directly below the closing `</div>` of the `pt-2 flex ...` row (still inside the expanded `space-y-4` container), add a helper line shown only when disabled:

```tsx
          {w.flashcards_disabled && (
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              Hidden from flashcard review. Its schedule is kept.
            </p>
          )}
```

- [ ] **Step 5: Typecheck + lint**

Run: `yarn build && yarn lint`
Expected: `yarn build` succeeds. `yarn lint` shows only the 2 pre-existing `lib/db.ts:240-241` errors (prefer-const) and unrelated pre-existing warnings — no new issues in `components/VocabularyWordRow.tsx`.

- [ ] **Step 6: Manual verification** (operator applies the migration first; the implementer does not)

With `yarn dev` (port 5023) after the migration is applied:
1. On the `/vocabulary` list, expand a word that has a due card. The "In review" checkbox is checked.
2. Uncheck it → the "Hidden from flashcard review" helper line appears. Open `/vocabulary/flashcards` → that word is no longer offered.
3. Reload `/vocabulary` and expand the word → checkbox stays unchecked (persisted).
4. Re-check it → open `/vocabulary/flashcards` → the word is offered again; its Interval/Next on the row are unchanged.

- [ ] **Step 7: Commit**

```bash
git add components/VocabularyWordRow.tsx
git commit -m "feat: add include-in-review toggle to vocabulary word row"
```

---

## Self-Review

- **Spec coverage:** Schema (Task 1), `VocabularyWord` type (Task 1), both review-queue filters (Task 2), db writer (Task 2), server action (Task 3), UI toggle + helper (Task 4), re-enable resumes schedule (Task 2 writer only updates `flashcards_disabled`). Testing: manual verification (Task 4 Step 6) — automated tests intentionally deferred (no harness), per Global Constraints.
- **Placeholder scan:** none — every step has concrete code/commands.
- **Type consistency:** `flashcards_disabled: boolean` used identically across type, writer, action, and component; `setVocabularyWordDisabled(id, userId, disabled)` (db) vs `setVocabularyWordFlashcardsDisabled(id, disabled)` (action) are distinct by design and each call site matches its signature.
