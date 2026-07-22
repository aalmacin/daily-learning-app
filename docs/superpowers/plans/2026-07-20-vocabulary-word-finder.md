# Vocabulary Word Finder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Find a word" tab to the vocabulary page where a learner describes a meaning or situation in a sentence and gets back up to 3 candidate words/idioms with an example each, any of which can be added straight into their vocabulary list.

**Architecture:** One new one-shot `lib/openai.ts` function (`findVocabularyWords`) does the LLM lookup. One new server action (`findVocabularyCandidates`) wraps it with an auth check — no DB reads/writes, matching the spec's "ephemeral, no new table" decision. One new client component (`VocabularyWordFinder`) renders the search box and candidate cards, reusing the *existing* `addPendingWords`/`processVocabularyWord` helpers from `store/vocabStore.ts` for the "Add" button — this is the same code path `VocabularyForm` already uses, so added words get full definition/context/connections/morphology/image generation and show up in the app's existing floating pending-results panel (`components/VocabularyResult.tsx`, mounted globally via `components/AddPanel.tsx`) with no new UI needed for that part. `VocabularyPageContent.tsx` gets a third tab that swaps in this component in place of the existing form + list.

**Tech Stack:** Next.js App Router, TypeScript, OpenAI SDK (`gpt-5.4-mini`, `chat.completions.create`), `@tanstack/store` (existing `vocabStore`).

## Global Constraints

- No unit-test framework exists in this repo (no jest/vitest/playwright config, no test script in `package.json`). Do **not** introduce one. Each task's verification step is `npx tsc --noEmit` (must report no new errors). The final task is a manual verification pass in the browser, per this project's "start the dev server and use the feature in a browser" requirement for UI changes.
- No new database table or migration — the search itself is not persisted (per spec: "Persistence: None").
- Every new/changed field must be typed; no `any`.
- Adding a candidate must go through the existing `addVocabularyWord` action (via `processVocabularyWord`) unchanged — do not create a second, parallel "add word" code path.
- This repo's `next` package is a modified version with breaking changes from the `next` you may know from training — if a step in this plan touches App Router routing/config behavior in a way that seems off, check `node_modules/next/dist/docs/` before assuming your prior knowledge of Next.js is correct. (None of the tasks below touch routing/config, only existing client components and server actions, so this is unlikely to come up.)

---

### Task 1: `lib/openai.ts` — `findVocabularyWords`

**Files:**
- Modify: `lib/openai.ts` — insert after `evaluateVocabularySentence` (currently ends at `lib/openai.ts:411`), before `buildImagePrompt` (currently starts at `lib/openai.ts:413`)

**Interfaces:**
- Consumes: the existing `client` OpenAI instance already used by `analyzeVocabulary`/`evaluateVocabularySentence` in this file.
- Produces:
  - `export type VocabularyCandidate = { word: string; type: 'word' | 'idiom'; example: string }`
  - `export async function findVocabularyWords(sentence: string): Promise<VocabularyCandidate[]>`

- [ ] **Step 1: Insert the type and function**

Insert between `lib/openai.ts:411` (the closing `}` of `evaluateVocabularySentence`) and `lib/openai.ts:413` (`export async function buildImagePrompt`):

```ts
export type VocabularyCandidate = {
  word: string;
  type: 'word' | 'idiom';
  example: string;
};

const WORD_FINDER_SYSTEM_PROMPT = `You help a language learner find the word or idiom they're trying to think of. Given a sentence or description of a meaning or situation, suggest up to 3 English words or idioms that best fit. Respond with a JSON object with exactly this shape:

{ "candidates": [{ "word": string, "type": "word" | "idiom", "example": string }] }

Each "example" is a natural sentence using that candidate in a context similar to what the learner described. If nothing fits well, return an empty "candidates" array. Respond ONLY with valid JSON, no markdown or extra text.`;

export async function findVocabularyWords(sentence: string): Promise<VocabularyCandidate[]> {
  const response = await client.chat.completions.create({
    model: 'gpt-5.4-mini',
    messages: [
      { role: 'system', content: WORD_FINDER_SYSTEM_PROMPT },
      { role: 'user', content: sentence },
    ],
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error('Empty response from OpenAI');

  const parsed = JSON.parse(raw) as Partial<{ candidates: unknown }>;
  if (!Array.isArray(parsed.candidates)) {
    throw new Error('Invalid response shape from OpenAI');
  }

  return parsed.candidates.slice(0, 3).map((c): VocabularyCandidate => {
    const candidate = c as Partial<{ word: unknown; type: unknown; example: unknown }>;
    if (
      typeof candidate.word !== 'string' ||
      candidate.word.trim().length === 0 ||
      (candidate.type !== 'word' && candidate.type !== 'idiom') ||
      typeof candidate.example !== 'string' ||
      candidate.example.trim().length === 0
    ) {
      throw new Error('Invalid candidate shape from OpenAI');
    }
    return { word: candidate.word, type: candidate.type, example: candidate.example };
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors inside `lib/openai.ts` itself. No other file references `findVocabularyWords`/`VocabularyCandidate` yet, so no errors should appear anywhere else either.

- [ ] **Step 3: Commit**

```bash
git add lib/openai.ts
git commit -m "feat: add findVocabularyWords for the vocabulary word finder"
```

---

### Task 2: `actions/vocabulary.ts` — `findVocabularyCandidates`

**Files:**
- Modify: `actions/vocabulary.ts` — update the `@/lib/openai` import block (`actions/vocabulary.ts:30-36`), add the new action after `submitVocabularySentenceAttemptAction` (currently ends at `actions/vocabulary.ts:224`)

**Interfaces:**
- Consumes: `findVocabularyWords`, `type VocabularyCandidate` from `@/lib/openai` (Task 1); existing `getCurrentUser` from `@/lib/auth`.
- Produces: `export async function findVocabularyCandidates(sentence: string): Promise<VocabularyCandidate[]>`

- [ ] **Step 1: Update the `@/lib/openai` import**

Replace `actions/vocabulary.ts:30-36`:

```ts
import {
  analyzeVocabulary,
  buildImagePrompt,
  generateVocabularyImage,
  chatAboutVocabulary,
  evaluateVocabularySentence,
} from '@/lib/openai';
```

with:

```ts
import {
  analyzeVocabulary,
  buildImagePrompt,
  generateVocabularyImage,
  chatAboutVocabulary,
  evaluateVocabularySentence,
  findVocabularyWords,
  type VocabularyCandidate,
} from '@/lib/openai';
```

- [ ] **Step 2: Add the action after `submitVocabularySentenceAttemptAction`**

Add after the existing `submitVocabularySentenceAttemptAction` function (ends at `actions/vocabulary.ts:224`), before `getVocabularyReviewCards` (starts at `actions/vocabulary.ts:226`):

```ts
export async function findVocabularyCandidates(sentence: string): Promise<VocabularyCandidate[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const trimmed = sentence.trim();
  if (!trimmed) throw new Error("Enter a sentence describing the word you're looking for");

  return findVocabularyWords(trimmed);
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `actions/vocabulary.ts`.

- [ ] **Step 4: Commit**

```bash
git add actions/vocabulary.ts
git commit -m "feat: add findVocabularyCandidates action"
```

---

### Task 3: New `VocabularyWordFinder` component

**Files:**
- Create: `components/VocabularyWordFinder.tsx`

**Interfaces:**
- Consumes: `findVocabularyCandidates` from `@/actions/vocabulary` (Task 2); `type VocabularyCandidate` from `@/lib/openai` (Task 1); `addPendingWords`, `processVocabularyWord` from `@/store/vocabStore` (existing, unchanged).
- Produces: `export function VocabularyWordFinder(): JSX.Element`

- [ ] **Step 1: Write the component**

```tsx
'use client'

import { useState } from 'react'
import { findVocabularyCandidates } from '@/actions/vocabulary'
import { addPendingWords, processVocabularyWord } from '@/store/vocabStore'
import type { VocabularyCandidate } from '@/lib/openai'

function candidateKey(candidate: VocabularyCandidate): string {
  return `${candidate.word.toLowerCase()}-${candidate.type}`
}

export function VocabularyWordFinder() {
  const [sentence, setSentence] = useState('')
  const [candidates, setCandidates] = useState<VocabularyCandidate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [addedKeys, setAddedKeys] = useState<Set<string>>(new Set())

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = sentence.trim()
    if (!trimmed) return
    setError(null)
    setIsPending(true)
    try {
      const result = await findVocabularyCandidates(trimmed)
      setCandidates(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsPending(false)
    }
  }

  function handleAdd(candidate: VocabularyCandidate) {
    const key = crypto.randomUUID()
    addPendingWords([{ key, word: candidate.word, type: candidate.type }])
    processVocabularyWord(key, candidate.word, candidate.type)
    setAddedKeys((prev) => new Set(prev).add(candidateKey(candidate)))
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <label htmlFor="word-finder-sentence" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Describe what you mean
        </label>
        <textarea
          id="word-finder-sentence"
          value={sentence}
          onChange={(e) => setSentence(e.target.value)}
          placeholder="a word for when you do something bad but on purpose to look good later"
          rows={3}
          disabled={isPending}
          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500 resize-y disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!sentence.trim() || isPending}
          className="self-start rounded-lg bg-zinc-900 dark:bg-zinc-50 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Finding…' : 'Find'}
        </button>
      </form>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {candidates !== null && candidates.length === 0 && !error && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No matches — try rephrasing.</p>
      )}

      {candidates !== null && candidates.length > 0 && (
        <div className="flex flex-col gap-3">
          {candidates.map((candidate) => {
            const key = candidateKey(candidate)
            const added = addedKeys.has(key)
            return (
              <div
                key={key}
                className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">{candidate.word}</span>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 capitalize">
                      {candidate.type}
                    </span>
                  </span>
                  <button
                    onClick={() => handleAdd(candidate)}
                    disabled={added}
                    className="text-xs font-medium rounded-md px-3 py-1.5 bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {added ? 'Added' : 'Add'}
                  </button>
                </div>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">{candidate.example}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `components/VocabularyWordFinder.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/VocabularyWordFinder.tsx
git commit -m "feat: add VocabularyWordFinder component"
```

---

### Task 4: Wire the "Find a word" tab into `VocabularyPageContent`

**Files:**
- Modify: `components/VocabularyPageContent.tsx` (full-file rewrite — currently 52 lines)

**Interfaces:**
- Consumes: `VocabularyWordFinder` (Task 3).

- [ ] **Step 1: Rewrite the file**

Replace the full contents of `components/VocabularyPageContent.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { VocabularyList } from '@/components/VocabularyList';
import { VocabularyForm } from '@/components/VocabularyForm';
import { VocabularyWordFinder } from '@/components/VocabularyWordFinder';
import type { VocabularyWord } from '@/lib/db';

type Tab = 'word' | 'idiom' | 'find';

const TAB_LABELS: Record<Tab, string> = {
  word: 'Words',
  idiom: 'Idioms',
  find: 'Find a word',
};

type Props = {
  initialWords: VocabularyWord[];
};

export function VocabularyPageContent({ initialWords }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('word');
  const [counts, setCounts] = useState({ word: 0, idiom: 0 });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {(['word', 'idiom', 'find'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'border-b-2 border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-50'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            {TAB_LABELS[tab]}
            {tab !== 'find' && (
              <span className="ml-1.5 text-xs text-zinc-400 dark:text-zinc-500">
                ({counts[tab]})
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Vocabulary
        </h1>
        <Link
          href="/flashcards?tab=vocabulary"
          className="px-3 py-1.5 text-sm font-medium rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
        >
          Flashcards
        </Link>
      </div>
      {activeTab === 'find' ? (
        <VocabularyWordFinder />
      ) : (
        <>
          <VocabularyForm type={activeTab} />
          <VocabularyList initialWords={initialWords} activeTab={activeTab} onCountsChange={setCounts} />
        </>
      )}
    </div>
  );
}
```

Note: in the `else` branch, TypeScript narrows `activeTab` from `Tab` (`'word' | 'idiom' | 'find'`) down to `'word' | 'idiom'` automatically because the `if` branch already handled `'find'` — `VocabularyList`'s `activeTab` prop (typed `'word' | 'idiom'`) will accept it with no cast needed.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors anywhere in the project — this is the last file touched by this plan.

- [ ] **Step 3: Lint**

Run: `yarn lint`
Expected: no new lint errors introduced by this change.

- [ ] **Step 4: Commit**

```bash
git add components/VocabularyPageContent.tsx
git commit -m "feat: add Find a word tab to the vocabulary page"
```

---

### Task 5: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Verify the new tab appears**

Run: `yarn dev`
In the browser, go to `/vocabulary`. Confirm a third tab "Find a word" appears alongside "Words"/"Idioms", with no count badge next to it.

- [ ] **Step 2: Verify a successful search**

Click "Find a word". Type a description (e.g. "a word for when you do something bad but on purpose to look good later") and submit. Confirm up to 3 candidate cards appear, each showing a word/idiom, a type badge, and one example sentence.

- [ ] **Step 3: Verify adding a candidate**

Click "Add" on one candidate. Confirm the button flips to a disabled "Added" state, and the floating pending-results panel (used elsewhere in the app for adding words) shows the word processing and then completing with full definition/context/connections/morphology — i.e. identical to adding a word through the normal Add Vocabulary form.

- [ ] **Step 4: Verify the added word appears in the list**

Switch to the "Words" (or "Idioms", depending on what was added) tab. Confirm the newly added word now appears in the list.

- [ ] **Step 5: Verify empty/no-match handling**

Go back to "Find a word" and submit a description that shouldn't match anything sensible (e.g. a string of random characters). Confirm either an empty-candidates message ("No matches — try rephrasing.") or a small, reasonable candidate list — not a crash or unhandled error.

- [ ] **Step 6: Verify error handling preserves input**

Temporarily disconnect network (or use browser devtools to block the request) and submit a search. Confirm an inline error message appears and the typed sentence remains in the textarea (not cleared).

- [ ] **Step 7: Verify tab switching preserves nothing unexpected**

Search, get results, switch to "Words" tab, then switch back to "Find a word". Confirm the search box and results have reset (per the "ephemeral" design decision) — this is expected behavior, not a bug.
