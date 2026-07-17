# Disable Term Flashcards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a term-level toggle that excludes a term's flashcards from the `/flashcards` review queue without deleting cards or losing their SRS schedule.

**Architecture:** A `flashcards_disabled` boolean column on `terms` drives everything. The two review queries (`getDueFlashcards`, `getNewFlashcards`) inner-join `terms` and filter it out. A server action flips the flag; a toggle in the term detail `FlashcardSection` calls it. Disabled terms stay fully visible and editable everywhere else.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase (Postgres), TypeScript, React 19, Tailwind.

## Global Constraints

- Always use explicit types; never suppress type errors. (`Term` gains `flashcards_disabled: boolean`.)
- No new test framework is introduced. Verification is `yarn lint` + `yarn build` (typecheck) plus the manual checks in each task. Automated e2e is deferred — the repo has no Playwright/test harness.
- The migration SQL file is created but NOT applied by the implementer (project rule: do not run supabase commands). The user applies it.
- Do not read `.env` files. Do not commit unless the human explicitly asks — leave commits to the operator running the plan.

---

### Task 1: Schema + data-model plumbing for `flashcards_disabled`

**Files:**
- Create: `supabase/migrations/20260716000000_term_flashcards_disabled.sql`
- Modify: `lib/db.ts:14-31` (add field to `Term` type)
- Modify: `lib/db.ts:369` (add field to `updateTerm` mapping)

**Interfaces:**
- Produces: `Term.flashcards_disabled: boolean`; `updateTerm(id, { flashcards_disabled })` now persists the column. `TermRow` already includes it (it is not omitted from `Term`), and existing term reads use `select('*')`, so `getTermById` and list queries return it with no further change.

- [ ] **Step 1: Create the migration file**

`supabase/migrations/20260716000000_term_flashcards_disabled.sql`:

```sql
ALTER TABLE terms ADD COLUMN flashcards_disabled boolean NOT NULL DEFAULT false;
```

- [ ] **Step 2: Add the field to the `Term` type**

In `lib/db.ts`, the `Term` type ends with `notes: string | null;` at line 30. Add the new field right after it (before the closing `};` on line 31):

```ts
  notes: string | null;
  flashcards_disabled: boolean;
};
```

- [ ] **Step 3: Persist the field in `updateTerm`**

In `lib/db.ts`, immediately after line 369 (`if (updates.notes !== undefined) fields.notes = updates.notes;`), add:

```ts
  if (updates.flashcards_disabled !== undefined) fields.flashcards_disabled = updates.flashcards_disabled;
```

- [ ] **Step 4: Typecheck**

Run: `yarn build`
Expected: build succeeds. Adding a required field to `Term` may surface type errors anywhere a `Term` literal is constructed by hand — the `updateTerm`/`insertTerm` return objects build `{ ...row, ... }` from `select('*')` rows, so `row` already carries `flashcards_disabled` and spreads it. If the compiler flags a hand-built `Term` object missing the field, add `flashcards_disabled: false` there. Fix any such errors before continuing.

- [ ] **Step 5: Commit** (only if the operator is committing per task)

```bash
git add supabase/migrations/20260716000000_term_flashcards_disabled.sql lib/db.ts
git commit -m "feat: add flashcards_disabled column and Term field"
```

---

### Task 2: Exclude disabled terms from the review queues

**Files:**
- Modify: `lib/db.ts:1105-1110` (`getDueFlashcards` query)
- Modify: `lib/db.ts:1143-1147` (`getNewFlashcards` query)

**Interfaces:**
- Consumes: `Term.flashcards_disabled` (Task 1).
- Produces: `getDueFlashcards` and `getNewFlashcards` return only cards whose term has `flashcards_disabled = false`. Return shape (`Flashcard & { term_name: string }`) is unchanged.

- [ ] **Step 1: Filter `getDueFlashcards`**

In `lib/db.ts`, the current `getDueFlashcards` query builder is:

```ts
  let query = getSupabase()
    .from('flashcards')
    .select('*, terms(name)')
    .eq('user_id', userId)
    .not('next_review', 'is', null)
    .lte('next_review', new Date().toISOString());
```

Replace it with an inner join plus the filter:

```ts
  let query = getSupabase()
    .from('flashcards')
    .select('*, terms!inner(name, flashcards_disabled)')
    .eq('user_id', userId)
    .eq('terms.flashcards_disabled', false)
    .not('next_review', 'is', null)
    .lte('next_review', new Date().toISOString());
```

The row mapper below still reads `terms.name` and spreads the rest — no change needed there. (`flashcards_disabled` rides along on the joined object but is unused in the mapping; that is fine.)

- [ ] **Step 2: Filter `getNewFlashcards`**

In `lib/db.ts`, the current `getNewFlashcards` query builder is:

```ts
  let query = getSupabase()
    .from('flashcards')
    .select('*, terms(name)')
    .eq('user_id', userId)
    .is('next_review', null);
```

Replace it with:

```ts
  let query = getSupabase()
    .from('flashcards')
    .select('*, terms!inner(name, flashcards_disabled)')
    .eq('user_id', userId)
    .eq('terms.flashcards_disabled', false)
    .is('next_review', null);
```

- [ ] **Step 3: Typecheck**

Run: `yarn build`
Expected: build succeeds.

- [ ] **Step 4: Commit** (only if the operator is committing per task)

```bash
git add lib/db.ts
git commit -m "feat: exclude disabled terms from flashcard review queues"
```

---

### Task 3: Server action to toggle the flag

**Files:**
- Modify: `actions/flashcards.ts` (add action + import `updateTerm`, `Term`)

**Interfaces:**
- Consumes: `updateTerm(termId, { flashcards_disabled })` (Task 1).
- Produces: `setTermFlashcardsDisabled(termId: number, disabled: boolean): Promise<Term>` — auth-guarded server action.

- [ ] **Step 1: Extend the imports**

In `actions/flashcards.ts`, the import block from `@/lib/db` (lines 4-17) currently ends with `type Flashcard,`. Add `updateTerm` to the named imports and `type Term` alongside `type Flashcard`:

```ts
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
  getUserSettings,
  getTermIdsReviewedToday,
  updateTerm,
  type Flashcard,
  type Term,
} from '@/lib/db';
```

- [ ] **Step 2: Add the action**

Append to `actions/flashcards.ts` (after the last function, `getFlashcardCategories`):

```ts
export async function setTermFlashcardsDisabled(termId: number, disabled: boolean): Promise<Term> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const updated = await updateTerm(termId, { flashcards_disabled: disabled });
  if (!updated) throw new Error('Term not found');
  revalidatePath(`/terms/${termId}`);
  revalidatePath('/flashcards');
  return updated;
}
```

- [ ] **Step 3: Typecheck**

Run: `yarn build`
Expected: build succeeds.

- [ ] **Step 4: Commit** (only if the operator is committing per task)

```bash
git add actions/flashcards.ts
git commit -m "feat: add setTermFlashcardsDisabled server action"
```

---

### Task 4: Toggle UI in the term detail flashcard section

**Files:**
- Modify: `components/FlashcardSection.tsx` (add `flashcardsDisabled` prop + toggle)
- Modify: `components/TermDetailPage.tsx:692-698` (pass the prop)

**Interfaces:**
- Consumes: `setTermFlashcardsDisabled` (Task 3); `term.flashcards_disabled` (Task 1).
- Produces: user-facing toggle "Include in flashcard review" in the Flashcards section header.

- [ ] **Step 1: Add the prop and state to `FlashcardSection`**

In `components/FlashcardSection.tsx`, extend `Props` (lines 13-17) and the component signature/state.

Update the import on line 4 to include the new action:

```ts
import { addFlashcard, editFlashcard, removeFlashcard, resetFlashcard, setTermFlashcardsDisabled } from '@/actions/flashcards';
```

Extend `Props`:

```ts
type Props = {
  termId: number;
  formattedNote: string;
  initialFlashcards: Flashcard[];
  flashcardsDisabled: boolean;
};
```

Update the signature and add state (top of the component body, alongside the other `useState` calls):

```ts
export function FlashcardSection({ termId, formattedNote, initialFlashcards, flashcardsDisabled }: Props) {
  const [flashcards, setFlashcards] = useState(initialFlashcards);
  const [disabled, setDisabled] = useState(flashcardsDisabled);
```

- [ ] **Step 2: Add the toggle handler**

Add this handler alongside the other handlers in `FlashcardSection` (e.g. after `handleReset`). It optimistically flips state and reverts on failure using the existing `error` state:

```ts
  const handleToggleDisabled = () => {
    const next = !disabled;
    setDisabled(next);
    setError(null);
    startTransition(async () => {
      try {
        await setTermFlashcardsDisabled(termId, next);
      } catch (e) {
        setDisabled(!next);
        setError(e instanceof Error ? e.message : 'Failed to update');
      }
    });
  };
```

- [ ] **Step 3: Render the toggle in the section header**

In `components/FlashcardSection.tsx`, the header block is:

```tsx
      <div className="flex items-center gap-2 mb-3">
        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-700 text-xs font-bold text-zinc-700 dark:text-zinc-200">
          4
        </span>
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Flashcards
        </span>
      </div>
```

Replace it with a version that adds the toggle on the right and a helper line:

```tsx
      <div className="mb-3 space-y-1">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-700 text-xs font-bold text-zinc-700 dark:text-zinc-200">
            4
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Flashcards
          </span>
          <label className="ml-auto flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 select-none cursor-pointer">
            <input
              type="checkbox"
              checked={!disabled}
              onChange={handleToggleDisabled}
              disabled={isPending}
              className="accent-zinc-900 dark:accent-zinc-100"
            />
            Include in flashcard review
          </label>
        </div>
        {disabled && (
          <p className="text-xs text-zinc-400 dark:text-zinc-500 pl-7">
            Disabled terms are hidden from review but keep their cards and schedule.
          </p>
        )}
      </div>
```

- [ ] **Step 4: Pass the prop from `TermDetailPage`**

In `components/TermDetailPage.tsx`, the `FlashcardSection` usage (lines 693-697) currently is:

```tsx
                <FlashcardSection
                  termId={term.id}
                  formattedNote={viewing.refinement_formatted_note}
                  initialFlashcards={initialFlashcards}
                />
```

Add the prop:

```tsx
                <FlashcardSection
                  termId={term.id}
                  formattedNote={viewing.refinement_formatted_note}
                  initialFlashcards={initialFlashcards}
                  flashcardsDisabled={term.flashcards_disabled}
                />
```

- [ ] **Step 5: Typecheck + lint**

Run: `yarn build && yarn lint`
Expected: both succeed.

- [ ] **Step 6: Manual verification**

Apply the migration first (operator/user runs it; the implementer does not). Then, with the dev server (`yarn dev`, port 5023):
1. Open a term that has at least one due flashcard. In the Flashcards section, "Include in flashcard review" is checked.
2. Uncheck it → helper text appears. Open `/flashcards` → that term's card is no longer offered.
3. Reload the term page → checkbox stays unchecked (persisted).
4. Re-check it → open `/flashcards` → the card is offered again with its prior schedule (interval/next-review unchanged on the term page).

- [ ] **Step 7: Commit** (only if the operator is committing per task)

```bash
git add components/FlashcardSection.tsx components/TermDetailPage.tsx
git commit -m "feat: add include-in-review toggle to flashcard section"
```

---

## Self-Review

- **Spec coverage:** Schema (Task 1), data-layer type + `updateTerm` (Task 1), review-queue filtering both queries (Task 2), server action (Task 3), UI toggle + prop wiring (Task 4), re-enable resumes schedule (no schedule fields are touched anywhere — Task 3 only flips the boolean). Testing: spec called for Playwright e2e; deferred to manual verification (Task 4 Step 6) because the repo has no test harness — called out in Global Constraints.
- **Placeholder scan:** none — every step has concrete code/commands.
- **Type consistency:** `flashcards_disabled: boolean` used identically in the type, `updateTerm`, the action, and the component; `setTermFlashcardsDisabled(termId, disabled)` signature matches between Task 3 and its call in Task 4.
