# Vocabulary Spelling/Idiom Correction — Design

**Date:** 2026-07-06
**Status:** Approved (pending spec review)

## Goal

Today, whatever text a user types into the Vocabulary "Add" form (a word or
an idiom) is stored and analyzed verbatim — a typo like "seren dipty" or a
garbled idiom like "kick the can down the street" is accepted as-is. Instead,
the AI should correct spelling/wording to the proper form before it's
analyzed and saved. If the input is too mangled to identify anything real,
the entry should fail instead of saving garbage.

## Decisions

- **Visibility:** Silent auto-correct. The corrected word/idiom is simply
  what gets saved and shown — no separate confirmation step. The batch-add
  UX (type multiple lines, each resolves independently) is unchanged.
- **Unrecognizable input:** Reject with an error. Surfaces through the exact
  same failure path other `addVocabularyWord` errors already use (the
  pending entry flips to an error state in `VocabularyForm`/`vocabStore`).
- **Implementation shape:** Merge correction into the existing
  `analyzeVocabulary` call rather than adding a separate correction round
  trip. One LLM call total; the same call that corrects the term also
  analyzes it, so the analysis is guaranteed to be about the corrected term.
- **Scope:** Only `addVocabularyWord` (new word/idiom creation).
  `regenerateVocabularyWord` calls `analyzeVocabulary` on an already-stored
  (already-corrected) word and doesn't write the `word` field, so it needs no
  changes.

## Components & Interfaces

### `lib/openai.ts`

```ts
export type VocabularyAnalysis = {
  corrected: string;
  recognized: boolean;
  definition: string;
  context_sentences: { sentence: string; setting: string }[];
  connections: string;
  morphology: string;
};
```

- `buildVocabularyPrompt`: add instructions for the LLM to
  - fix spelling typos (for `word`) or normalize wording to the standard
    form (for `idiom`), returned as `corrected`;
  - set `recognized: false` if the input is too mangled to identify a real
    word/idiom at all (in which case other fields may be best-effort/empty).
- `analyzeVocabulary` validation: additionally require `corrected` to be a
  non-empty string and `recognized` to be a boolean. Same
  "Invalid response shape" throw pattern as today for anything missing/wrong
  type.

### `actions/vocabulary.ts`

`addVocabularyWord`:

```ts
export async function addVocabularyWord(
  word: string,
  type: 'word' | 'idiom',
): Promise<VocabularyWord> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const analysis = await analyzeVocabulary(word, type);
  if (!analysis.recognized) {
    throw new Error(`Could not recognize a valid ${type} from "${word}"`);
  }

  const correctedWord = analysis.corrected;
  const mainSentence = analysis.context_sentences[0];

  const entry = await insertVocabularyWord({
    user_id: user.id,
    word: correctedWord,
    type,
    definition: analysis.definition,
    context: fillBlank(mainSentence.sentence, correctedWord),
    context_sentences: analysis.context_sentences,
    connections: analysis.connections,
    morphology: analysis.morphology,
    flashcard_sentence: null,
  });

  revalidatePath('/vocabulary');
  return entry;
}
```

The only change from today: the raw `word` parameter is used to *ask* the
LLM, but `analysis.corrected` is what gets stored and filled into the
context sentence.

## Data Flow

**Add word/idiom:** User submits raw text → `analyzeVocabulary(word, type)`
asks the LLM to correct and analyze in one call → if `recognized` is false,
throw (entry shows as failed, same as any other error today) → otherwise
insert using `analysis.corrected` as the stored word and for filling the
main context sentence's blank.

**Regenerate:** Unaffected — operates on the already-corrected stored word.

## Error Handling

- Malformed LLM response (missing/wrong-typed `corrected` or `recognized`,
  or existing validation failures on `context_sentences`/etc.) →
  `analyzeVocabulary` throws before any DB write, same as existing pattern.
- `recognized: false` → `addVocabularyWord` throws a descriptive error before
  any DB write. Flows through `VocabularyForm`'s existing `.catch()` into
  `rejectVocabResult`, so the entry shows as a failed/error row exactly like
  today's other failures (e.g. network errors).

## Out of Scope (YAGNI)

- Showing the user what the original typed text was vs. the correction.
- A confirmation/approval step before saving a corrected entry.
- Correcting or re-validating existing stored words (no backfill).
- Duplicate detection when a correction causes two entries to converge on
  the same word (no uniqueness constraint exists today; unchanged).
