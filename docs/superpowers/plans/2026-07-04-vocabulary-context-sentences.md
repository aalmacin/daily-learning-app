# Vocabulary Context Sentences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single `context` sentence with 5 varied example sentences (`context_sentences`), one of which is "main" — the main sentence drives the flashcard front (cloze) and the image-generation prompt, and the user can override which one is main from the word list.

**Architecture:** Add a nullable `context_sentences` jsonb column that stores an ordered array of `{ sentence, setting }` (index 0 = main); keep the existing `context` column as a derived cache of the main sentence with the word filled in, so `buildImagePrompt`/legacy code paths need zero changes. A new shared `VocabularyContextSentences` component renders the list (read-only or with a "set as main" control) in all three places Context is shown today.

**Tech Stack:** Next.js App Router, TypeScript, Supabase (Postgres + JS client), OpenAI SDK (`gpt-5.4-mini`).

## Global Constraints

- No unit-test framework exists in this repo (no jest/vitest/playwright config, no test script in `package.json`). Do **not** introduce one for this feature. Each task's verification step is `npx tsc --noEmit` (must report no new errors) plus, where noted, a manual check. The final task is an end-to-end manual verification via the dev server, per this project's existing "start the dev server and use the feature in a browser" requirement for UI changes.
- Do not run any `supabase` CLI command (project rule). The migration SQL file is created for the user to apply manually.
- `__blank__` is the existing convention for marking where the word goes in a sentence (see current `flashcard_sentence` field) — reuse it verbatim, do not invent a new marker.
- Every new/changed field must be typed; no `any`.

---

### Task 1: Migration — add `context_sentences`, relax `flashcard_sentence`

**Files:**
- Create: `supabase/migrations/20260704000000_vocabulary_context_sentences.sql`

**Interfaces:**
- Produces: DB column `vocabulary_words.context_sentences` (jsonb, nullable), and `vocabulary_words.flashcard_sentence` becomes nullable. No code depends on this at typecheck time — later tasks depend on it at runtime.

- [ ] **Step 1: Write the migration file**

```sql
alter table vocabulary_words
  add column context_sentences jsonb,
  alter column flashcard_sentence drop not null;
```

- [ ] **Step 2: Sanity-check the SQL**

Run: `cat supabase/migrations/20260704000000_vocabulary_context_sentences.sql`
Expected: file contains exactly the two-statement `alter table` above, no syntax errors visible on inspection. Do not run `supabase db push` or any other `supabase` command — flag to the user that they need to apply this migration manually before the feature works at runtime.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260704000000_vocabulary_context_sentences.sql
git commit -m "feat: add vocabulary context_sentences column"
```

---

### Task 2: `lib/db.ts` — types, `fillBlank`, `insertVocabularyWord`, `setMainContextSentence`

**Files:**
- Modify: `lib/db.ts:1318-1336` (type), add new function after `resetVocabularyReview` (currently ends at `lib/db.ts:1495`)

**Interfaces:**
- Consumes: existing `getSupabase()` helper already used throughout `lib/db.ts`.
- Produces:
  - `export type ContextSentence = { sentence: string; setting: string }`
  - `export function fillBlank(sentence: string, word: string): string`
  - `VocabularyWord.context_sentences: ContextSentence[] | null`
  - `VocabularyWord.flashcard_sentence: string | null`
  - `export async function setMainContextSentence(wordId: number, userId: string, index: number): Promise<VocabularyWord>`

Note: `insertVocabularyWord`'s signature is `Omit<VocabularyWord, 'id' | 'created_at' | 'updated_at' | 'image_url' | 'image_prompt' | 'image_model' | 'interval_step' | 'next_review' | 'last_reviewed'>` — since `context_sentences` isn't in that exclusion list, it's automatically required in the input type once the `VocabularyWord` type below changes. No edit to the function body itself is needed; Task 4 supplies the new field at the call site.

- [ ] **Step 1: Add `ContextSentence` type and `fillBlank` helper directly above `VocabularyWord`**

Replace (`lib/db.ts:1318`):

```ts
export type VocabularyWord = {
```

with:

```ts
export type ContextSentence = { sentence: string; setting: string };

export function fillBlank(sentence: string, word: string): string {
  return sentence.replace('__blank__', word);
}

export type VocabularyWord = {
```

- [ ] **Step 2: Update the `VocabularyWord` type fields**

In the same type body (`lib/db.ts:1324-1327` originally), change:

```ts
  context: string;
  connections: string;
  morphology: string;
  flashcard_sentence: string;
```

to:

```ts
  context: string;
  context_sentences: ContextSentence[] | null;
  connections: string;
  morphology: string;
  flashcard_sentence: string | null;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: a new error in `actions/vocabulary.ts` (the only caller of `insertVocabularyWord`), since it doesn't yet pass `context_sentences` and still passes the old `analysis.context`/`analysis.flashcard_sentence` shape — this is fixed in Task 4. No errors should appear inside `lib/db.ts` itself.

- [ ] **Step 4: Add `setMainContextSentence` after `resetVocabularyReview`**

Add after the existing `resetVocabularyReview` function (ends at `lib/db.ts:1495`):

```ts
export async function setMainContextSentence(
  wordId: number,
  userId: string,
  index: number,
): Promise<VocabularyWord> {
  const { data: word, error: fetchError } = await getSupabase()
    .from('vocabulary_words')
    .select('*')
    .eq('id', wordId)
    .eq('user_id', userId)
    .single();
  if (fetchError) throw fetchError;

  const current = word as VocabularyWord;
  const sentences = current.context_sentences;
  if (!sentences || index < 0 || index >= sentences.length) {
    throw new Error('Invalid context sentence index');
  }

  const reordered = [sentences[index], ...sentences.slice(0, index), ...sentences.slice(index + 1)];
  const newContext = fillBlank(reordered[0].sentence, current.word);

  const { data, error } = await getSupabase()
    .from('vocabulary_words')
    .update({
      context: newContext,
      context_sentences: reordered,
    } as unknown as never)
    .eq('id', wordId)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) throw error;
  return data as VocabularyWord;
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors from `lib/db.ts` itself (errors from callers not yet updated are expected and will clear in Task 4).

- [ ] **Step 6: Commit**

```bash
git add lib/db.ts
git commit -m "feat: add context_sentences type, fillBlank helper, setMainContextSentence"
```

---

### Task 3: `lib/openai.ts` — generate 5 context sentences instead of `context`/`flashcard_sentence`

**Files:**
- Modify: `lib/openai.ts:278-297` (`VocabularyAnalysis` type + `buildVocabularyPrompt`), `lib/openai.ts:299-327` (`analyzeVocabulary` validation)

**Interfaces:**
- Consumes: nothing new.
- Produces: `VocabularyAnalysis = { definition: string; context_sentences: { sentence: string; setting: string }[]; connections: string; morphology: string }`, still exported from `lib/openai.ts`, still returned by `analyzeVocabulary(word, type)`.

- [ ] **Step 1: Replace the type and prompt builder**

Replace `lib/openai.ts:278-297`:

```ts
export type VocabularyAnalysis = {
  definition: string;
  context: string;
  connections: string;
  morphology: string;
  flashcard_sentence: string;
};

function buildVocabularyPrompt(type: 'word' | 'idiom'): string {
  const typeLabel = type === 'word' ? 'word' : 'idiom/phrase';
  return `You are a vocabulary learning assistant. Given a ${typeLabel}, respond with a JSON object with exactly these fields:

- "definition": What the ${typeLabel} means AND what it does NOT mean (common misconceptions). 2-3 sentences.
- "context": An example sentence that sounds like something a real person would actually say in everyday conversation — chatting with a coworker, a friend, or a stranger. Keep it casual, natural, and light; no need to be deep or literary. Pick a situation where using the ${typeLabel} genuinely fits so the usage feels natural, not forced.
- "connections": Connect the ${typeLabel} to a well-known person, event, character, or cultural reference to aid memory. For example, "Alfred the butler in Batman is a factotum — he does everything for Bruce Wayne." 1-2 sentences.
- "morphology": The structural analysis — Latin or Greek roots, prefixes, suffixes, morphemes, etymology. Explain how the parts build the meaning. 1-3 sentences.
- "flashcard_sentence": A sentence using the ${typeLabel} where the ${typeLabel} itself is replaced with a blank marker __blank__. Like the context field, it should sound like natural everyday speech someone would use at work or with friends. It must be different from the context sentence and provide enough clues for someone to guess the ${typeLabel}.

Respond ONLY with valid JSON, no markdown or extra text.`;
}
```

with:

```ts
export type VocabularyAnalysis = {
  definition: string;
  context_sentences: { sentence: string; setting: string }[];
  connections: string;
  morphology: string;
};

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

- [ ] **Step 2: Replace the validation in `analyzeVocabulary`**

Replace `lib/openai.ts:315-324`:

```ts
  const parsed = JSON.parse(raw) as Partial<VocabularyAnalysis>;
  if (
    typeof parsed.definition !== 'string' ||
    typeof parsed.context !== 'string' ||
    typeof parsed.connections !== 'string' ||
    typeof parsed.morphology !== 'string' ||
    typeof parsed.flashcard_sentence !== 'string'
  ) {
    throw new Error('Invalid response shape from OpenAI');
  }
```

with:

```ts
  const parsed = JSON.parse(raw) as Partial<VocabularyAnalysis>;
  const sentences = parsed.context_sentences;
  const validSentences =
    Array.isArray(sentences) &&
    sentences.length === 5 &&
    sentences.every(
      (s) =>
        typeof s === 'object' &&
        s !== null &&
        typeof (s as { sentence?: unknown }).sentence === 'string' &&
        typeof (s as { setting?: unknown }).setting === 'string' &&
        (s as { sentence: string }).sentence.split('__blank__').length === 2,
    );

  if (
    typeof parsed.definition !== 'string' ||
    !validSentences ||
    typeof parsed.connections !== 'string' ||
    typeof parsed.morphology !== 'string'
  ) {
    throw new Error('Invalid response shape from OpenAI');
  }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors only in `actions/vocabulary.ts` (still using old `analysis.context`/`analysis.flashcard_sentence` — fixed in Task 4). No errors inside `lib/openai.ts` itself.

- [ ] **Step 4: Commit**

```bash
git add lib/openai.ts
git commit -m "feat: generate 5 varied context sentences instead of context/flashcard_sentence"
```

---

### Task 4: `actions/vocabulary.ts` — wire up insert and the new "set main" action

**Files:**
- Modify: `actions/vocabulary.ts:1-48` (imports + `addVocabularyWord`)
- Add: new exported action `setWordMainContext` after `generateWordImage` (currently ends at `actions/vocabulary.ts:85`)

**Interfaces:**
- Consumes: `fillBlank`, `setMainContextSentence` from `@/lib/db` (Task 2); `analyzeVocabulary` return shape from Task 3.
- Produces: `export async function setWordMainContext(wordId: number, index: number): Promise<VocabularyWord>`

- [ ] **Step 1: Update the import list**

Replace `actions/vocabulary.ts:4-17`:

```ts
import {
  getVocabularyWords,
  getVocabularyWordById,
  insertVocabularyWord,
  deleteVocabularyWord,
  uploadVocabularyImage,
  updateVocabularyImage,
  getDueVocabularyWords,
  getNewVocabularyWords,
  reviewVocabularyWord,
  resetVocabularyReview,
  getUserSettings,
  type VocabularyWord,
} from '@/lib/db';
```

with:

```ts
import {
  getVocabularyWords,
  getVocabularyWordById,
  insertVocabularyWord,
  deleteVocabularyWord,
  uploadVocabularyImage,
  updateVocabularyImage,
  getDueVocabularyWords,
  getNewVocabularyWords,
  reviewVocabularyWord,
  resetVocabularyReview,
  setMainContextSentence,
  fillBlank,
  getUserSettings,
  type VocabularyWord,
} from '@/lib/db';
```

- [ ] **Step 2: Update `addVocabularyWord`**

Replace `actions/vocabulary.ts:26-48`:

```ts
export async function addVocabularyWord(
  word: string,
  type: 'word' | 'idiom',
): Promise<VocabularyWord> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const analysis = await analyzeVocabulary(word, type);

  const entry = await insertVocabularyWord({
    user_id: user.id,
    word,
    type,
    definition: analysis.definition,
    context: analysis.context,
    connections: analysis.connections,
    morphology: analysis.morphology,
    flashcard_sentence: analysis.flashcard_sentence,
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

- [ ] **Step 3: Add `setWordMainContext` after `generateWordImage`**

Add after the existing `generateWordImage` function (ends at `actions/vocabulary.ts:85`):

```ts
export async function setWordMainContext(
  wordId: number,
  index: number,
): Promise<VocabularyWord> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const entry = await setMainContextSentence(wordId, user.id, index);
  revalidatePath('/vocabulary');
  return entry;
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `actions/vocabulary.ts`. Remaining errors, if any, should only be in the three components fixed in Tasks 5-8.

- [ ] **Step 5: Commit**

```bash
git add actions/vocabulary.ts
git commit -m "feat: derive context from main sentence, add setWordMainContext action"
```

---

### Task 5: New shared `VocabularyContextSentences` component

**Files:**
- Create: `components/VocabularyContextSentences.tsx`

**Interfaces:**
- Consumes: `ContextSentence` type from `@/lib/db` (Task 2).
- Produces:
```ts
export function VocabularyContextSentences(props: {
  context: string;
  contextSentences: ContextSentence[] | null;
  word: string;
  onSetMain?: (index: number) => void;
}): JSX.Element
```
Renders the legacy single-string fallback when `contextSentences` is null/empty; otherwise renders all entries with the word filled in and a "Main" badge on index 0. `onSetMain` is only passed by `VocabularyList` — when present, every non-main row gets a "Set as main" button.

- [ ] **Step 1: Write the component**

```tsx
'use client';

import type { ContextSentence } from '@/lib/db';

type Props = {
  context: string;
  contextSentences: ContextSentence[] | null;
  word: string;
  onSetMain?: (index: number) => void;
};

export function VocabularyContextSentences({ context, contextSentences, word, onSetMain }: Props) {
  if (!contextSentences || contextSentences.length === 0) {
    return (
      <div className="pt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">
          Context
        </h4>
        <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
          {context}
        </p>
      </div>
    );
  }

  return (
    <div className="pt-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">
        Context
      </h4>
      <ul className="space-y-2">
        {contextSentences.map((cs, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
            <div className="flex-1 whitespace-pre-wrap">
              {cs.sentence.replace('__blank__', word)}
              <span className="ml-2 text-xs text-zinc-400 dark:text-zinc-500">({cs.setting})</span>
              {i === 0 && (
                <span className="ml-2 inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                  Main
                </span>
              )}
            </div>
            {onSetMain && i !== 0 && (
              <button
                type="button"
                onClick={() => onSetMain(i)}
                className="shrink-0 text-xs text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
              >
                Set as main
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `components/VocabularyContextSentences.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/VocabularyContextSentences.tsx
git commit -m "feat: add VocabularyContextSentences component"
```

---

### Task 6: `components/VocabularyFlashcards.tsx` — front sentence + back Context section

**Files:**
- Modify: `components/VocabularyFlashcards.tsx:1-6` (imports), `:33` (add derived front sentence), `:110-119` (front render), `:133` (Context section)

**Interfaces:**
- Consumes: `VocabularyContextSentences` (Task 5).

- [ ] **Step 1: Import the new component**

Replace `components/VocabularyFlashcards.tsx:6`:

```ts
import { VocabularyImage } from '@/components/VocabularyImage';
```

with:

```ts
import { VocabularyImage } from '@/components/VocabularyImage';
import { VocabularyContextSentences } from '@/components/VocabularyContextSentences';
```

- [ ] **Step 2: Derive the front sentence**

Replace `components/VocabularyFlashcards.tsx:33`:

```ts
  const current = cards[currentIndex] ?? null;
```

with:

```ts
  const current = cards[currentIndex] ?? null;
  const frontSentence = current?.context_sentences?.[0]?.sentence ?? current?.flashcard_sentence ?? '';
```

- [ ] **Step 3: Use it in the front render**

Replace `components/VocabularyFlashcards.tsx:113-117`:

```tsx
                  {!showBack ? (
                    renderCloze(current.flashcard_sentence)
                  ) : (
                    renderComplete(current.flashcard_sentence, current.word)
                  )}
```

with:

```tsx
                  {!showBack ? (
                    renderCloze(frontSentence)
                  ) : (
                    renderComplete(frontSentence, current.word)
                  )}
```

- [ ] **Step 4: Swap the Context section**

Replace `components/VocabularyFlashcards.tsx:133`:

```tsx
                  <DetailSection title="Context" content={current.context} />
```

with:

```tsx
                  <VocabularyContextSentences
                    context={current.context}
                    contextSentences={current.context_sentences}
                    word={current.word}
                  />
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `components/VocabularyFlashcards.tsx`.

- [ ] **Step 6: Commit**

```bash
git add components/VocabularyFlashcards.tsx
git commit -m "feat: flashcard front uses main context sentence"
```

---

### Task 7: `components/VocabularyResult.tsx` — swap Context section (read-only)

**Files:**
- Modify: `components/VocabularyResult.tsx:1-7` (imports), `:97` (Context section)

**Interfaces:**
- Consumes: `VocabularyContextSentences` (Task 5).

- [ ] **Step 1: Import the new component**

Replace `components/VocabularyResult.tsx:7`:

```ts
import { VocabularyImage } from '@/components/VocabularyImage'
```

with:

```ts
import { VocabularyImage } from '@/components/VocabularyImage'
import { VocabularyContextSentences } from '@/components/VocabularyContextSentences'
```

- [ ] **Step 2: Swap the Context section**

Replace `components/VocabularyResult.tsx:97`:

```tsx
          <Section title="Context" content={entry.context} />
```

with:

```tsx
          <VocabularyContextSentences
            context={entry.context}
            contextSentences={entry.context_sentences}
            word={entry.word}
          />
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `components/VocabularyResult.tsx`.

- [ ] **Step 4: Commit**

```bash
git add components/VocabularyResult.tsx
git commit -m "feat: done vocab card shows all context sentences"
```

---

### Task 8: `components/VocabularyList.tsx` — swap Context section with "set as main" control

**Files:**
- Modify: `components/VocabularyList.tsx:1-6` (imports), add `handleSetMain` after `handleReset` (`:34-39`), `:101` (Context section)

**Interfaces:**
- Consumes: `VocabularyContextSentences` (Task 5), `setWordMainContext` action (Task 4).

- [ ] **Step 1: Update imports**

Replace `components/VocabularyList.tsx:4-6`:

```ts
import { removeVocabularyWord, resetVocabularyReviewAction } from '@/actions/vocabulary';
import { SRS_INTERVALS, type VocabularyWord } from '@/lib/db';
import { VocabularyImage } from '@/components/VocabularyImage';
```

with:

```ts
import { removeVocabularyWord, resetVocabularyReviewAction, setWordMainContext } from '@/actions/vocabulary';
import { SRS_INTERVALS, type VocabularyWord } from '@/lib/db';
import { VocabularyImage } from '@/components/VocabularyImage';
import { VocabularyContextSentences } from '@/components/VocabularyContextSentences';
```

- [ ] **Step 2: Add `handleSetMain` after `handleReset`**

Replace `components/VocabularyList.tsx:34-39`:

```ts
  const handleReset = (id: number) => {
    startTransition(async () => {
      const updated = await resetVocabularyReviewAction(id);
      setWords((prev) => prev.map((w) => (w.id === id ? updated : w)));
    });
  };
```

with:

```ts
  const handleReset = (id: number) => {
    startTransition(async () => {
      const updated = await resetVocabularyReviewAction(id);
      setWords((prev) => prev.map((w) => (w.id === id ? updated : w)));
    });
  };

  const handleSetMain = (id: number, index: number) => {
    startTransition(async () => {
      const updated = await setWordMainContext(id, index);
      setWords((prev) => prev.map((w) => (w.id === id ? updated : w)));
    });
  };
```

- [ ] **Step 3: Swap the Context section**

Replace `components/VocabularyList.tsx:101`:

```tsx
                    <Section title="Context" content={w.context} />
```

with:

```tsx
                    <VocabularyContextSentences
                      context={w.context}
                      contextSentences={w.context_sentences}
                      word={w.word}
                      onSetMain={(index) => handleSetMain(w.id, index)}
                    />
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors anywhere in the project (this is the last file using the old `Section`/`DetailSection` Context call sites).

- [ ] **Step 5: Lint**

Run: `yarn lint`
Expected: no new lint errors.

- [ ] **Step 6: Commit**

```bash
git add components/VocabularyList.tsx
git commit -m "feat: let users pick which context sentence is main"
```

---

### Task 9: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Apply the migration**

Ask the user to run the migration from Task 1 against their Supabase project (Supabase CLI or dashboard) — this implementation does not run `supabase` commands. Do not proceed with runtime verification until confirmed applied.

- [ ] **Step 2: Start the dev server and add a new word**

Run: `yarn dev`
In the browser, add a new vocabulary word or idiom. Confirm:
- The request succeeds and the new word appears with a working "Context" section listing 5 sentences, each with a distinct setting label, one marked "Main".
- The 5 settings are visibly varied (not all the same situation).

- [ ] **Step 3: Verify the flashcard front**

Open the flashcards review view for that word. Confirm the front shows a cloze sentence (blank in place of the word) matching the main context sentence's wording, and flipping reveals the word filled into that same sentence.

- [ ] **Step 4: Verify "set as main" in the word list**

In the word list, expand the new word and click "Set as main" on a different sentence. Confirm the badge moves, `context` updates, and re-opening the flashcard front now shows the newly-chosen sentence.

- [ ] **Step 5: Verify image generation still works**

Click "Generate image" on the word. Confirm it succeeds (uses the current main sentence as the prompt basis, per unchanged `buildImagePrompt`/`generateWordImage` code path).

- [ ] **Step 6: Verify a pre-existing (legacy) word still works**

Open a word created before this change (no `context_sentences`). Confirm its Context section still shows its single legacy sentence with no "Main" badge or "Set as main" buttons, and its flashcard front still works via the `flashcard_sentence` fallback.
