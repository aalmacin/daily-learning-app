# Vocabulary Flashcard Front-Side Clue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a short, italicized clue below the front-side sentence on vocabulary/idiom flashcards, derived from the entry's existing `definition`, with the word/idiom itself (and common inflections) redacted.

**Architecture:** A new pure function `getFlashcardClue(word, definition)` in `lib/vocabulary-clue.ts` extracts the first sentence of the definition and redacts occurrences of the word/idiom (plus simple inflections) via a generated regex. `VocabularyFlashcards.tsx` calls it at render time and displays the result under the sentence — no new AI call, no DB migration, no server action.

**Tech Stack:** TypeScript, React (Next.js client component), no test framework (see constraint below).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-16-vocabulary-flashcard-clue-design.md`.
- No test framework exists in this repo (no jest/vitest, no `*.test.ts` files, `package.json` has no test script). Do not introduce one for this feature — verify the pure function with a temporary scratch script run via `npx tsx` (deleted before commit, never committed), verify types via `npx tsc --noEmit`, and verify the UI manually through the running dev server.
- Types must be explicit; do not use `any`.
- Applies only to `VocabularyWord` (`type: 'word' | 'idiom'`) flashcards in `VocabularyFlashcards.tsx`. Does not touch the separate term-based `Flashcard` system (`FlashcardsReview.tsx`).
- Per project convention (confirmed prior session), subagent-driven implementers may commit per task without pausing for extra approval; merging/pushing/opening a PR still requires an explicit choice at the end.

---

### Task 1: `getFlashcardClue` utility

**Files:**
- Create: `lib/vocabulary-clue.ts`

**Interfaces:**
- Produces: `getFlashcardClue(word: string, definition: string): string`, consumed by Task 2's `VocabularyFlashcards.tsx`.

- [ ] **Step 1: Write the implementation**

Create `lib/vocabulary-clue.ts`:

```ts
const STOPWORDS = new Set(['the', 'a', 'an', 'in', 'on', 'of', 'to', 'and', 'or', 'but']);
const SUFFIXES = ['ing', 'ed', 'es', 's'];

function escapeRegex(token: string): string {
  return token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stem(token: string): string {
  const lower = token.toLowerCase();
  for (const suffix of SUFFIXES) {
    if (lower.endsWith(suffix) && lower.length - suffix.length >= 3) {
      return lower.slice(0, lower.length - suffix.length);
    }
  }
  return lower;
}

function buildRedactionRegex(word: string): RegExp {
  const tokens = word.trim().split(/\s+/);
  const parts = tokens.map((token) => {
    const lower = token.toLowerCase();
    if (STOPWORDS.has(lower)) {
      return `\\b${escapeRegex(lower)}\\b`;
    }
    return `\\b${escapeRegex(stem(token))}\\w*\\b`;
  });
  return new RegExp(parts.join('\\s+'), 'gi');
}

function firstSentence(text: string): string {
  const trimmed = text.trim();
  const parts = trimmed.split(/(?<=[.!?])\s+/);
  return (parts[0] ?? trimmed).trim();
}

export function getFlashcardClue(word: string, definition: string): string {
  const sentence = firstSentence(definition);
  const regex = buildRedactionRegex(word);
  return sentence.replace(regex, '____').trim();
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors referencing `lib/vocabulary-clue.ts`.

- [ ] **Step 3: Verify behavior with a scratch script**

Create a temporary file at the repo root, `tmp-verify-clue.ts`:

```ts
import { getFlashcardClue } from './lib/vocabulary-clue';

const cases: [string, string, string][] = [
  ['literal word', 'run', 'To run is to move quickly on foot. It is faster than walking.'],
  ['inflected word', 'run', 'Running is a fast form of movement on foot. It burns calories.'],
  ['idiom literal', 'kick the bucket', 'To kick the bucket means to die, often used humorously.'],
  ['idiom inflected', 'kick the bucket', 'Kicked the bucket is slang for dying, often used humorously.'],
  ['word absent', 'serendipity', 'A fortunate discovery made by accident. It often leads to great inventions.'],
  ['stopword fragment', 'in the loop', 'Being in the loop means staying informed. It is a workplace phrase.'],
];

for (const [label, word, definition] of cases) {
  console.log(`${label}: ${JSON.stringify(getFlashcardClue(word, definition))}`);
}
```

Run: `npx tsx tmp-verify-clue.ts`

Expected output (word/inflections replaced with `____`, only first sentence kept):
```
literal word: "To ____ is to move quickly on foot."
inflected word: "____ is a fast form of movement on foot."
idiom literal: "To ____ means to die, often used humorously."
idiom inflected: "____ is slang for dying, often used humorously."
word absent: "A fortunate discovery made by accident."
stopword fragment: "Being ____ means staying informed."
```

If any line doesn't match, fix `lib/vocabulary-clue.ts` and rerun before proceeding.

- [ ] **Step 4: Delete the scratch script**

Run: `rm tmp-verify-clue.ts`
Expected: File removed, not committed.

- [ ] **Step 5: Commit**

```bash
git add lib/vocabulary-clue.ts
git commit -m "feat: add vocabulary flashcard clue redaction utility"
```

---

### Task 2: Render the clue on the flashcard front

**Files:**
- Modify: `components/VocabularyFlashcards.tsx:1-9` (imports), `:35-36` (derived values), `:114-122` (front render)

**Interfaces:**
- Consumes: `getFlashcardClue(word: string, definition: string): string` from Task 1.

- [ ] **Step 1: Import the utility**

In `components/VocabularyFlashcards.tsx`, add to the import block (after the existing imports, currently lines 1-8):

```ts
import { getFlashcardClue } from '@/lib/vocabulary-clue';
```

- [ ] **Step 2: Compute the clue for the current card**

Replace:

```ts
  const current = cards[currentIndex] ?? null;
  const frontSentence = current?.context_sentences?.[0]?.sentence ?? current?.flashcard_sentence ?? '';
```

with:

```ts
  const current = cards[currentIndex] ?? null;
  const frontSentence = current?.context_sentences?.[0]?.sentence ?? current?.flashcard_sentence ?? '';
  const clue = current ? getFlashcardClue(current.word, current.definition) : '';
```

- [ ] **Step 3: Render the clue under the sentence**

Replace the front block:

```tsx
              {/* Front */}
              <div className="p-6 sm:p-8 min-h-[160px] flex items-center justify-center">
                <p className="text-base sm:text-lg text-zinc-700 dark:text-zinc-300 leading-8 text-center">
                  {!showBack ? (
                    renderCloze(frontSentence)
                  ) : (
                    renderComplete(frontSentence, current.word)
                  )}
                </p>
              </div>
```

with:

```tsx
              {/* Front */}
              <div className="p-6 sm:p-8 min-h-[160px] flex flex-col items-center justify-center">
                <p className="text-base sm:text-lg text-zinc-700 dark:text-zinc-300 leading-8 text-center">
                  {!showBack ? (
                    renderCloze(frontSentence)
                  ) : (
                    renderComplete(frontSentence, current.word)
                  )}
                </p>
                {clue && (
                  <p className="mt-2 text-sm italic text-zinc-400 dark:text-zinc-500 text-center">
                    {clue}
                  </p>
                )}
              </div>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Manual end-to-end verification**

Run: `yarn dev` (or check if already running), then in the browser:

1. Go to the Vocabulary flashcards review page.
2. Confirm a `word`-type card shows a small italic clue line under the sentence, and the clue text does not contain the actual word or an inflected form of it.
3. Confirm an `idiom`-type card behaves the same way (clue present, idiom not revealed).
4. Click "Show Answer" and confirm the clue line stays visible alongside the full definition and revealed word.
5. If no cards are due, add a new word (e.g. `serendipity`) and a new idiom (e.g. `kick the bucket`) via the Vocabulary add form first, then repeat steps 2-4 on the new cards.

- [ ] **Step 6: Commit**

```bash
git add components/VocabularyFlashcards.tsx
git commit -m "feat: show redacted definition clue on vocabulary flashcard front"
```

---

## Final Step

After Task 2 passes, stop and present the standard finishing-a-development-branch options (merge, PR, or further changes) — do not merge or push without the user's explicit choice.
