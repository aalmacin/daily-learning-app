# Plan: Show newly-added vocabulary words directly in the main list

## Context

On `/vocabulary`, adding a word currently shows a transient "processing/done"
card (`VocabularyResult`, driven by `vocabStore`) above the persistent list
(`VocabularyList`). The two live in disconnected state: `VocabularyList`
holds its own `words` state seeded once from `initialWords` and never
receives the newly-added word, so the word only appears in the permanent
list after a full page reload. The user wants the added word to land in the
main list immediately, with no separate view.

Decision (confirmed with user): while a word is being analyzed, show an
inline pending row directly in the list (not a separate card area); once
analysis finishes it becomes a normal row in place; on error, show an inline
dismissible error row in the list.

Scope is limited to `app/vocabulary/page.tsx` and `VocabularyList.tsx`.
`VocabularyResult.tsx` stays as-is and keeps being used by `AddPanel.tsx`
(homepage "Vocabulary" tab), which has no persistent list to merge into, so
its transient-card feedback is still the right UX there. Do not touch
`AddPanel.tsx`, `VocabularySearchResults.tsx`, or `SearchBar.tsx` — they
already manage their own state independently and are out of scope.

## Global Constraints

- Do not change `VocabularyResult.tsx` or remove it — `AddPanel.tsx` still
  imports and renders it.
- `ErrorVocabResult` currently has no `type` field, so error rows can't be
  filtered to the active word/idiom tab. Add `type: 'word' | 'idiom'` to
  `ErrorVocabResult` and thread it through `rejectVocabResult`.
- The "done" merge must not duplicate a word already in the persisted list
  (e.g. re-render race) — dedupe by `id` before prepending.
- Once a `done` entry is merged into `VocabularyList`'s local state, it must
  be removed from `vocabStore.activeWords` (via `dismissWord`) so it isn't
  rendered twice (once as a list row, once as a pending/error placeholder).
- Keep existing tab counts, expand/collapse, update/delete behavior on
  `VocabularyWordRow` unchanged.
- Run `npx tsc --noEmit` and existing lint/test commands for touched files
  before calling a task done.

## Task 1: Inline pending/error rows and live merge in the vocabulary list

**Files:** `store/vocabStore.ts`, `components/VocabularyForm.tsx`,
`components/VocabularyList.tsx`, `app/vocabulary/page.tsx`

**Steps:**

1. `store/vocabStore.ts`:
   - Add `type: 'word' | 'idiom'` to the `ErrorVocabResult` type.
   - Update `rejectVocabResult(key: string, error: string, type: 'word' | 'idiom')`
     to include `type` in the constructed `ErrorVocabResult`.

2. `components/VocabularyForm.tsx`:
   - Update the `.catch()` call site to pass `type` (already in closure
     scope from the `type` state variable) to `rejectVocabResult`.

3. `components/VocabularyList.tsx`:
   - Subscribe to `vocabStore` via `useStore(vocabStore, (s) => s.activeWords)`.
   - Add a `useEffect` that watches `activeWords`: for every entry with
     `status === 'done'` not already present in local `words` (by `id`),
     prepend it into `words` state, then call `dismissWord(entry.key)` to
     remove it from the store's `activeWords`.
   - Compute `pendingForTab = activeWords.filter((w) => w.status !== 'done' && w.type === activeTab)`.
   - Render `pendingForTab` above the persisted rows within the tab's list
     (each entry as a pending row with a spinner + word name + dismiss
     button for `status === 'processing'`, or an error row with the word +
     error message + dismiss button for `status === 'error'`, calling
     `dismissWord(entry.key)` on dismiss). Style consistent with the
     existing `VocabularyWordRow` bordered/rounded row look (not the
     `VocabularyResult` card padding).
   - Update the "no items yet" empty state to only show when both
     `filtered` and `pendingForTab` are empty.
   - Tab counts stay based on persisted `words` only (no change needed).

4. `app/vocabulary/page.tsx`:
   - Remove the `VocabularyResult` import and the `<VocabularyResult />`
     element. `VocabularyForm` and `VocabularyList` remain.

**Verification:** `npx tsc --noEmit`. Manually reason through: add a word →
pending row appears in the correct tab immediately → on success it's
replaced in place by the real row with no separate card and no reload
needed; on rejection (unrecognized word) → inline error row appears in the
correct tab, dismissible.

**Report:** DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED per the
implementer contract.
