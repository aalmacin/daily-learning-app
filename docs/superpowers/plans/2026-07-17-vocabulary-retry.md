# Vocabulary Retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a Retry button on the vocabulary/idiom error card so a failed generation can be re-attempted without re-typing.

**Architecture:** Extract the per-word "call action + resolve/reject" orchestration out of `VocabularyForm` into a shared `processVocabularyWord` helper in the store module. Add `retryVocabResult` to flip an error entry back to processing. The form and the new Retry button both drive the single helper.

**Tech Stack:** Next.js 16 (App Router), React 19, `@tanstack/store`, `@tanstack/react-store`, TypeScript, Tailwind.

## Global Constraints

- **No test runner exists** in this repo (scripts: `dev`, `build`, `start`, `lint` only). Do NOT add Vitest/Jest — verification is `npx tsc --noEmit`, `npm run lint`, and manual checks.
- Always use explicit types; never use `any` or `@ts-ignore`.
- The error entry type in the store is `ErrorVocabResult = { status: 'error'; key: string; word: string; error: string; type: 'word' | 'idiom' }`.
- Retry is shown for **all** errors (including "not recognized"); no error-type distinction.
- Follow existing file patterns; this change touches only `store/vocabStore.ts`, `components/VocabularyForm.tsx`, `components/VocabularyResult.tsx`.

---

### Task 1: Store helpers — `retryVocabResult` and `processVocabularyWord`

**Files:**
- Modify: `store/vocabStore.ts`

**Interfaces:**
- Consumes: existing `addPendingWords`, `resolveVocabResult`, `rejectVocabResult` in the same file; `addVocabularyWord` from `@/actions/vocabulary` with signature `(word: string, type: 'word' | 'idiom') => Promise<VocabularyWord & { fromDb: boolean }>`.
- Produces:
  - `retryVocabResult(key: string): void`
  - `processVocabularyWord(key: string, word: string, type: 'word' | 'idiom', onResolved?: () => void): void`

- [ ] **Step 1: Add the server-action import at the top of `store/vocabStore.ts`**

Add below the existing imports (after the `VocabularyWord` type import on line 2):

```typescript
import { addVocabularyWord } from '@/actions/vocabulary'
```

- [ ] **Step 2: Add `retryVocabResult` after `rejectVocabResult`**

Insert after the `rejectVocabResult` function (currently ends around line 43):

```typescript
export function retryVocabResult(key: string) {
  vocabStore.setState((state) => ({
    ...state,
    activeWords: state.activeWords.map((w) =>
      w.status === 'error' && w.key === key
        ? ({ status: 'processing', key, word: w.word, type: w.type } as PendingVocabResult)
        : w
    ),
  }))
}
```

- [ ] **Step 3: Add `processVocabularyWord` after `retryVocabResult`**

```typescript
export function processVocabularyWord(
  key: string,
  word: string,
  type: 'word' | 'idiom',
  onResolved?: () => void,
) {
  addVocabularyWord(word, type)
    .then((w) => {
      resolveVocabResult(key, w)
      onResolved?.()
    })
    .catch((e) => rejectVocabResult(key, e instanceof Error ? e.message : 'Something went wrong', type))
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (exit 0). `PendingVocabResult` is already exported/defined at the top of the file, so the cast in Step 2 resolves.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no errors for `store/vocabStore.ts`.

- [ ] **Step 6: Commit**

```bash
git add store/vocabStore.ts
git commit -m "feat: add retry and shared processVocabularyWord store helpers"
```

---

### Task 2: Refactor `VocabularyForm` to use `processVocabularyWord`

**Files:**
- Modify: `components/VocabularyForm.tsx`

**Interfaces:**
- Consumes: `processVocabularyWord(key, word, type, onResolved?)` from `@/store/vocabStore` (Task 1); existing `addPendingWords`.
- Produces: no new exports. Behavior is unchanged — pure refactor removing the inline `.then/.catch`.

- [ ] **Step 1: Update the store import**

Change line 6 from:

```typescript
import { addPendingWords, resolveVocabResult, rejectVocabResult } from '@/store/vocabStore'
```

to:

```typescript
import { addPendingWords, processVocabularyWord } from '@/store/vocabStore'
```

- [ ] **Step 2: Remove the now-unused action import**

Delete line 5:

```typescript
import { addVocabularyWord } from '@/actions/vocabulary'
```

(`addVocabularyWord` is now called only inside `processVocabularyWord`.)

- [ ] **Step 3: Replace the per-word loop in `onSubmit`**

Replace this block (currently lines 32-39):

```typescript
      keyed.forEach(({ key, word }) => {
        addVocabularyWord(word, type)
          .then((w) => {
            resolveVocabResult(key, w)
            onAdded?.()
          })
          .catch((e) => rejectVocabResult(key, e instanceof Error ? e.message : 'Something went wrong', type))
      })
```

with:

```typescript
      keyed.forEach(({ key, word }) => processVocabularyWord(key, word, type, onAdded))
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (exit 0). No unused-import errors for `resolveVocabResult`/`rejectVocabResult`/`addVocabularyWord`.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no errors for `components/VocabularyForm.tsx`.

- [ ] **Step 6: Commit**

```bash
git add components/VocabularyForm.tsx
git commit -m "refactor: use shared processVocabularyWord in VocabularyForm"
```

---

### Task 3: Add Retry button to `ErrorCard`

**Files:**
- Modify: `components/VocabularyResult.tsx`

**Interfaces:**
- Consumes: `retryVocabResult(key)` and `processVocabularyWord(key, word, type, onResolved?)` from `@/store/vocabStore` (Task 1); existing `dismissWord`.
- Produces: no new exports. `ErrorCard` gains a `type: 'word' | 'idiom'` prop.

- [ ] **Step 1: Update the store import**

Change the import on line 5 to add `retryVocabResult` and `processVocabularyWord`:

```typescript
import { vocabStore, dismissWord, removeWordFromStore, updateWordImageInStore, retryVocabResult, processVocabularyWord, type VocabResult, type DoneVocabResult } from '@/store/vocabStore'
```

- [ ] **Step 2: Update `ErrorCard` to accept `type` and render a Retry button**

Replace the entire `ErrorCard` function (currently lines 44-54) with:

```typescript
function ErrorCard({ word, error, vocabKey, type }: { word: string; error: string; vocabKey: string; type: 'word' | 'idiom' }) {
  const handleRetry = () => {
    retryVocabResult(vocabKey)
    processVocabularyWord(vocabKey, word, type)
  }

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-red-200 dark:border-red-900 p-6 flex flex-col gap-2">
      <div className="flex items-center">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{word}</span>
        <DismissButton onDismiss={() => dismissWord(vocabKey)} />
      </div>
      <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      <button
        onClick={handleRetry}
        className="self-start text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        Retry
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Pass `type` from `VocabCard`**

In `VocabCard` (currently line 142), change the error branch from:

```typescript
  if (entry.status === 'error') return <ErrorCard word={entry.word} error={entry.error} vocabKey={entry.key} />
```

to:

```typescript
  if (entry.status === 'error') return <ErrorCard word={entry.word} error={entry.error} vocabKey={entry.key} type={entry.type} />
```

(`entry` is narrowed to `ErrorVocabResult` here, which has `type`.)

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (exit 0).

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no errors for `components/VocabularyResult.tsx`.

- [ ] **Step 6: Manual verification**

Run `npm run dev`, open the vocabulary page, and:
1. Submit a word that will fail (e.g. gibberish like `zzxqqp`) → the error card shows the message and a **Retry** button.
2. Click **Retry** → the card returns to the "Analyzing…" spinner (processing), then resolves to a done card or errors again.
3. Confirm Dismiss still removes the card.

- [ ] **Step 7: Commit**

```bash
git add components/VocabularyResult.tsx
git commit -m "feat: add retry button to failed vocabulary generation"
```

---

## Self-Review

- **Spec coverage:** `retryVocabResult` + `processVocabularyWord` (Task 1) ✓; form reuse (Task 2) ✓; ErrorCard Retry button shown for all errors (Task 3) ✓; manual verification steps ✓. Out-of-scope items (error-type distinction, auto-retry, image retry) are not implemented, matching the spec.
- **Placeholder scan:** No TBD/TODO; all code shown in full.
- **Type consistency:** `processVocabularyWord(key, word, type, onResolved?)` signature identical across Tasks 1–3; `retryVocabResult(key)` consistent; `ErrorCard` `type` prop typed `'word' | 'idiom'` matching `ErrorVocabResult.type`.
