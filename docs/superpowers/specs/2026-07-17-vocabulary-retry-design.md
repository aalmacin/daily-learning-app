# Retry failed vocabulary/idiom generation

## Goal

When generating a vocabulary word or idiom fails, show a **Retry** button on the
error card so the user can re-attempt without re-typing the word.

## Current behavior

- `VocabularyForm` submits words. For each, it calls `addVocabularyWord(word, type)`
  inside `onSubmit`, then `resolveVocabResult` on success or `rejectVocabResult` on
  failure. The orchestration lives in the form's submit closure.
- `store/vocabStore.ts` holds `activeWords: VocabResult[]` with statuses
  `processing | error | done`. An `error` entry already carries `key`, `word`, `type`,
  and `error`.
- `VocabularyResult`'s `ErrorCard` renders the word, error message, and a Dismiss
  button only.

## Design

Extract the per-word processing into one shared function so the form and the retry
button share a single code path.

### 1. `store/vocabStore.ts`

- Add `retryVocabResult(key: string)`: flips an existing `error` entry back to
  `{ status: 'processing', key, word, type }`, preserving `key`, `word`, `type`.
- Add `processVocabularyWord(key: string, word: string, type: 'word' | 'idiom')`:
  calls the `addVocabularyWord` server action, then `resolveVocabResult(key, w)` on
  success or `rejectVocabResult(key, message, type)` on failure. This is the single
  orchestration path. It returns void (fire-and-forget promise handling internally),
  matching the form's existing pattern.

### 2. `components/VocabularyForm.tsx`

- `onSubmit` becomes: `addPendingWords(keyed)` then
  `keyed.forEach(({ key, word }) => processVocabularyWord(key, word, type))`.
- The `onAdded?.()` callback still fires on success — `processVocabularyWord` accepts
  an optional `onResolved` callback, or the form keeps its own `.then` by having the
  helper return the promise. Chosen approach: helper accepts an optional
  `onResolved?: () => void` so the form passes `onAdded`.

### 3. `components/VocabularyResult.tsx` — `ErrorCard`

- Add a **Retry** button next to Dismiss. On click:
  `retryVocabResult(key)` (restores the spinner) then
  `processVocabularyWord(key, word, type)`.
- Retry is shown for **all** errors (including "not recognized"); no error-type
  distinction.
- `ErrorCard` needs `type` in addition to its current props to call the helper.
  `VocabCard` already has the full `ErrorVocabResult` entry, so pass `entry.type`.

## Testing

- E2E is out of scope for this change unless requested. Manual verification:
  1. Force a failure (e.g. gibberish word) → error card shows Retry.
  2. Click Retry → card returns to "Analyzing…" spinner, then resolves or errors again.
  3. A recovered word (after fixing the transient cause) resolves to a done card.

## Out of scope

- Distinguishing transient vs. permanent errors.
- Auto-retry / backoff.
- Retry for image generation or other flows.
