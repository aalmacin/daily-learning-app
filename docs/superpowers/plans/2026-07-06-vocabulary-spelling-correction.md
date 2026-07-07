# Vocabulary Spelling/Idiom Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user adds a word or idiom to their vocabulary, the AI corrects spelling/wording errors before analyzing and saving it, instead of storing the raw (possibly misspelled) input verbatim.

**Architecture:** Extend the existing `analyzeVocabulary` OpenAI call in `lib/openai.ts` to return two new fields (`corrected`, `recognized`) alongside its existing analysis fields. `addVocabularyWord` in `actions/vocabulary.ts` then uses `analysis.corrected` (not the raw input) for storage, and throws if `analysis.recognized` is false. One LLM call total — no new round trip.

**Tech Stack:** Next.js server actions, `openai` npm client (`gpt-5.4-mini`, JSON mode), TypeScript.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-06-vocabulary-spelling-correction-design.md`.
- No test framework exists in this repo (no jest/vitest, no `*.test.ts` files, `package.json` has no test script). Do not introduce one for this feature — verify via TypeScript compilation (`npx tsc --noEmit`) plus manual end-to-end verification through the running dev server, matching this codebase's existing convention of no automated test suite.
- Per the user's global instructions: do **not** run `git commit` at the end of any task. Stop after the final task and ask the user whether to commit.
- Types must be explicit; do not use `any`.
- Only `addVocabularyWord` changes behavior. `regenerateVocabularyWord` (actions/vocabulary.ts:99) is untouched — it operates on an already-corrected stored word and never writes the `word` field.

---

### Task 1: Add correction fields to the vocabulary analysis prompt/type

**Files:**
- Modify: `lib/openai.ts:278-337` (`VocabularyAnalysis` type, `buildVocabularyPrompt`, `analyzeVocabulary`)

**Interfaces:**
- Produces: `VocabularyAnalysis` gains `corrected: string` and `recognized: boolean`, consumed by Task 2's `addVocabularyWord`.

- [ ] **Step 1: Update the `VocabularyAnalysis` type**

In `lib/openai.ts`, replace:

```ts
export type VocabularyAnalysis = {
  definition: string;
  context_sentences: { sentence: string; setting: string }[];
  connections: string;
  morphology: string;
};
```

with:

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

- [ ] **Step 2: Update `buildVocabularyPrompt` to ask for correction**

Replace the current `buildVocabularyPrompt` function body:

```ts
function buildVocabularyPrompt(type: 'word' | 'idiom'): string {
  const typeLabel = type === 'word' ? 'word' : 'idiom/phrase';
  return `You are a vocabulary learning assistant. Given a ${typeLabel}, respond with a JSON object with exactly these fields:

- "definition": What the ${typeLabel} means AND what it does NOT mean (common misconceptions). 2-3 sentences.
- "context_sentences": An array of exactly 5 objects, each with a "sentence" and a "setting" field. Each "sentence" must sound like something a real person would actually say in everyday conversation, with the ${typeLabel} itself replaced by the literal marker __blank__ (exactly once per sentence). Each "setting" is a short 2-4 word label describing where the sentence happens, and the 5 settings must be clearly different from each other (for example: "at work", "texting a friend", "family dinner", "formal email", "casual chat with a stranger"). Order the array with the single best, most natural sentence first — that one becomes the flashcard's main example sentence.
- "connections": Connect the ${typeLabel} to a well-known person, event, character, or cultural reference to aid memory. For example, "Alfred the butler in Batman is a factotum — he does everything for Bruce Wayne." 1-2 sentences.
- "morphology": The structural analysis — Latin or Greek roots, prefixes, suffixes, morphemes, etymology. Explain how the parts build the meaning. 1-3 sentences.

Respond ONLY with valid JSON, no markdown or extra text.`;
}
```

with:

```ts
function buildVocabularyPrompt(type: 'word' | 'idiom'): string {
  const typeLabel = type === 'word' ? 'word' : 'idiom/phrase';
  return `You are a vocabulary learning assistant. Given a ${typeLabel} that may contain typos or non-standard wording, respond with a JSON object with exactly these fields:

- "corrected": The properly spelled ${typeLabel} (for a word: fix spelling typos to the real word; for an idiom: normalize to the standard, commonly recognized wording). If the input is already correct, return it unchanged.
- "recognized": true if you can confidently identify a real, well-known ${typeLabel} from the input; false if the input is too mangled, nonsensical, or unrecognizable to identify one. If false, still fill in the other fields with your best effort.
- "definition": What the ${typeLabel} means AND what it does NOT mean (common misconceptions). 2-3 sentences.
- "context_sentences": An array of exactly 5 objects, each with a "sentence" and a "setting" field. Each "sentence" must sound like something a real person would actually say in everyday conversation, with the ${typeLabel} itself replaced by the literal marker __blank__ (exactly once per sentence). Each "setting" is a short 2-4 word label describing where the sentence happens, and the 5 settings must be clearly different from each other (for example: "at work", "texting a friend", "family dinner", "formal email", "casual chat with a stranger"). Order the array with the single best, most natural sentence first — that one becomes the flashcard's main example sentence.
- "connections": Connect the ${typeLabel} to a well-known person, event, character, or cultural reference to aid memory. For example, "Alfred the butler in Batman is a factotum — he does everything for Bruce Wayne." 1-2 sentences.
- "morphology": The structural analysis — Latin or Greek roots, prefixes, suffixes, morphemes, etymology. Explain how the parts build the meaning. 1-3 sentences.

Respond ONLY with valid JSON, no markdown or extra text.`;
}
```

- [ ] **Step 3: Update `analyzeVocabulary`'s response validation**

Replace the validation block inside `analyzeVocabulary`:

```ts
  if (
    typeof parsed.definition !== 'string' ||
    !validSentences ||
    typeof parsed.connections !== 'string' ||
    typeof parsed.morphology !== 'string'
  ) {
    throw new Error('Invalid response shape from OpenAI');
  }

  return parsed as VocabularyAnalysis;
```

with:

```ts
  if (
    typeof parsed.corrected !== 'string' ||
    parsed.corrected.trim().length === 0 ||
    typeof parsed.recognized !== 'boolean' ||
    typeof parsed.definition !== 'string' ||
    !validSentences ||
    typeof parsed.connections !== 'string' ||
    typeof parsed.morphology !== 'string'
  ) {
    throw new Error('Invalid response shape from OpenAI');
  }

  return parsed as VocabularyAnalysis;
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors referencing `lib/openai.ts`. (Task 2 hasn't updated its call site yet, so `actions/vocabulary.ts` may still compile fine since it only reads the fields it already used — `corrected`/`recognized` are additive.)

---

### Task 2: Use the corrected word and reject unrecognized input in `addVocabularyWord`

**Files:**
- Modify: `actions/vocabulary.ts:30-54` (`addVocabularyWord`)

**Interfaces:**
- Consumes: `VocabularyAnalysis` from Task 1 (`corrected: string`, `recognized: boolean`, plus existing fields).
- Produces: `addVocabularyWord(word, type)` — same signature and return type (`Promise<VocabularyWord>`) as today; now throws `Error('Could not recognize a valid ${type} from "${word}"')` when the AI can't identify a real word/idiom.

- [ ] **Step 1: Update `addVocabularyWord`**

Replace:

```ts
export async function addVocabularyWord(
  word: string,
  type: 'word' | 'idiom',
): Promise<VocabularyWord> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const analysis = await analyzeVocabulary(word, type);
  const mainSentence = analysis.context_sentences[0];

  const entry = await insertVocabularyWord({
    user_id: user.id,
    word,
    type,
    definition: analysis.definition,
    context: fillBlank(mainSentence.sentence, word),
    context_sentences: analysis.context_sentences,
    connections: analysis.connections,
    morphology: analysis.morphology,
    flashcard_sentence: null,
  });

  revalidatePath('/vocabulary');
  return entry;
}
```

with:

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

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

---

### Task 3: Manual end-to-end verification

**Files:** None (verification only).

**Interfaces:**
- Consumes: The running app's Vocabulary add flow (`/vocabulary` page, `VocabularyForm`).

- [ ] **Step 1: Start the dev server**

Run: `yarn dev` (or check if already running)
Expected: Server up on port 5023.

- [ ] **Step 2: Verify a correctly-spelled word still works**

In the browser, go to the Vocabulary page, add the word `serendipity` (Word tab). Confirm it resolves to a "done" entry with `serendipity` as the stored word, a definition, 5 context sentences, connections, and morphology — same shape as before this change.

- [ ] **Step 3: Verify a misspelled word gets corrected**

Add the misspelled word `seren dipty` (Word tab). Confirm the resulting saved entry shows the corrected spelling `serendipity` (or equivalent correct form), not the raw typo, in the vocabulary list.

- [ ] **Step 4: Verify a garbled idiom gets corrected**

Switch to the Idiom tab, add `kick the can down the street`. Confirm the saved entry's word is normalized to the standard idiom `kick the can down the road` (or equivalent correct form).

- [ ] **Step 5: Verify gibberish input is rejected**

Add the nonsense input `asdkfjqwer` (Word tab). Confirm the entry shows as a failed/error row in the pending list (not saved to the vocabulary list), with an error message mentioning it couldn't be recognized.

- [ ] **Step 6: Confirm no regression in existing vocabulary list/flashcards**

Open the vocabulary list and flashcards review page. Confirm previously-existing words (created before this change) still render correctly — this change doesn't touch stored rows, only new inserts.

---

## Final Step

After Task 3 passes, stop and ask the user whether to commit the changes — do not run `git commit` automatically.
