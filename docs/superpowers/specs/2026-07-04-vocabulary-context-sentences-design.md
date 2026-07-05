# Vocabulary Context Sentences — Design

**Date:** 2026-07-04
**Status:** Approved (pending spec review)

## Goal

Replace the single `context` example sentence with 5 varied example sentences
(different settings — work, personal, casual, etc.), one of which is the
"main" sentence. The main sentence drives both the flashcard front (cloze,
replacing today's separate `flashcard_sentence`) and the image-generation
prompt. The LLM picks a default main sentence; the user can override which
one is main from the word list.

## Decisions

- **Front format:** Cloze (word blanked out), same mechanic as today — just
  sourced from the main context sentence instead of the separate
  `flashcard_sentence` field.
- **Backfill:** None. Existing rows keep working via their existing
  `context`/`flashcard_sentence` values; they don't get the 5-sentence array
  until the word is deleted and re-added.
- **Main selection:** LLM picks a default (first item in the returned array);
  user can override afterward.
- **Image on override:** Unaffected automatically. Overriding main only
  updates `context` (and thus the front sentence); the existing image stays
  until the user manually regenerates it.
- **Setting labels:** Stored and displayed. Each sentence has a short
  free-text `setting` label (e.g. "at work", "texting a friend").
- **Override control location:** Word list only (`VocabularyList`). The
  flashcard back and the "done" result card show the 5 sentences read-only.

## Data Model

Migration adds one nullable column and relaxes one constraint on
`vocabulary_words`:

| Column              | Type  | Purpose                                                        |
| -------------------- | ----- | ---------------------------------------------------------------|
| `context_sentences`  | JSONB | Array of exactly 5 `{ sentence, setting }` objects, or null    |
| `flashcard_sentence` | TEXT  | Relaxed to nullable (`DROP NOT NULL`); no longer written for new words |

`sentence` uses the existing `__blank__` marker convention (same as today's
`flashcard_sentence`) in place of the word/idiom.

**Array order encodes "main"**: index 0 is always the current main sentence.
No separate index/boolean column. Overriding main = reordering the array so
the chosen entry moves to index 0.

The existing `context` column is unchanged in type, but its meaning becomes a
derived cache: always kept equal to `context_sentences[0].sentence` with
`__blank__` replaced by the actual word. This means `buildImagePrompt` /
`generateWordImage`, and any legacy row without `context_sentences`, need
**no changes** — they keep reading `word.context` exactly as before.

`VocabularyWord` type (`lib/db.ts`) gains:

```ts
context_sentences: { sentence: string; setting: string }[] | null;
```

and `flashcard_sentence` becomes `string | null`.

> The migration SQL is provided for the user to apply manually
> (Supabase CLI/dashboard). The implementation does not run Supabase commands.

## Components & Interfaces

### `lib/openai.ts`

```ts
export type VocabularyAnalysis = {
  definition: string;
  context_sentences: { sentence: string; setting: string }[]; // exactly 5
  connections: string;
  morphology: string;
};
```

- `buildVocabularyPrompt` drops the `context` and `flashcard_sentence` fields,
  adds one field: `context_sentences` — an array of exactly 5 objects, each
  with a natural everyday sentence (word/idiom replaced by `__blank__`) and a
  short `setting` label. Instruct the LLM to vary settings (work, personal,
  casual, texting a friend, formal, etc.) and to order the array with the
  single best/most natural sentence first.
- `analyzeVocabulary` validation: `context_sentences` must be an array of
  length 5; each entry's `sentence` and `setting` must be strings; each
  `sentence` must contain the `__blank__` marker exactly once. Throw on any
  violation (same "Invalid response shape" pattern as today).
- `buildImagePrompt` / `generateVocabularyImage`: **unchanged**.

### `lib/db.ts`

- `VocabularyWord`: add `context_sentences`, loosen `flashcard_sentence` as
  above.
- `insertVocabularyWord`: accept `context_sentences` (jsonb) in its params;
  `flashcard_sentence` becomes optional/omitted for new inserts.
- New helper:

```ts
// Moves context_sentences[index] to the front and updates `context` to match
// (word substituted for __blank__). Scoped by user_id.
export async function setMainContextSentence(
  wordId: number, userId: string, index: number,
): Promise<VocabularyWord>;
```

### `actions/vocabulary.ts`

- `addVocabularyWord`: after `analyzeVocabulary`, derive `context` from
  `analysis.context_sentences[0].sentence` (blank filled with `word`) via a
  small shared helper (e.g. `fillBlank(sentence, word)` —
  `sentence.replace(/__blank__/g, word)`), and insert `context_sentences`
  alongside it. `flashcard_sentence` is not written (stored as null).
- New action:

```ts
export async function setWordMainContext(
  wordId: number, index: number,
): Promise<VocabularyWord>;
```

Auth-checked, delegates to `setMainContextSentence`, revalidates
`/vocabulary`.

### `components/VocabularyFlashcards.tsx`

- Front: sentence source becomes
  `current.context_sentences?.[0]?.sentence ?? current.flashcard_sentence ?? ''`.
  `renderCloze` / `renderComplete` are unchanged — they already operate on any
  `__blank__`-marked string.
- Back "Context" section: read-only. If `context_sentences` present, render
  all 5 (blank filled with the word) with their `setting` label, main one
  visually marked (e.g. a small "Main" badge on index 0). If null (legacy
  row), render exactly as today — single paragraph from `context`.

### `components/VocabularyResult.tsx`

- Same read-only Context rendering as the flashcard back (5 sentences +
  labels, or legacy single string).

### `components/VocabularyList.tsx`

- Same rendering as above, plus: each sentence row gets a control (e.g. a
  small star/"Set as main" button) that calls `setWordMainContext(word.id, i)`
  and updates local state on success. Only rendered when `context_sentences`
  is present (legacy rows have nothing to choose between).

## Data Flow

**Word creation:** `analyzeVocabulary` returns 5 sentences → `context`
derived from index 0 → both `context` and `context_sentences` inserted →
`flashcard_sentence` left null.

**Review:** Flashcard front reads `context_sentences[0]` (falls back to
`flashcard_sentence` for legacy rows) → cloze rendering unchanged.

**Override:** User clicks "set as main" in the word list → array reordered,
`context` updated to match → next review/image-generate action reads the new
`context` automatically. Existing image is untouched until manually
regenerated.

**Image generation:** Unchanged — reads `word.context`, which now always
reflects the current main sentence.

## Error Handling

- Malformed LLM response (wrong array length, missing `__blank__`, non-string
  fields) → `analyzeVocabulary` throws before any DB write, same as existing
  validation failures.
- `setWordMainContext` / `setMainContextSentence`: invalid `index` (out of
  0–4 range, or word has no `context_sentences`) → throw; no partial update.
- Legacy rows (`context_sentences` null) never show the override control, so
  there's no invalid-index path from the UI for them.

## Out of Scope (YAGNI)

- Backfilling existing rows with 5 sentences.
- Auto-regenerating the image when main is overridden.
- Editing individual sentence text or setting labels by hand.
- Exposing the override control anywhere but the word list.
- Changing the number of sentences (fixed at 5) or making it configurable.
