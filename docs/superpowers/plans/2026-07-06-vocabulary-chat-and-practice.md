# Vocabulary Chat and Sentence Practice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give vocabulary words two AI-assisted affordances — a persistent Q&A chat ("Ask AI") and a persistent sentence-practice flow ("Practice a sentence") — surfaced everywhere a vocabulary word is shown in depth (word list, search results, flashcard review back).

**Architecture:** Two new tables (`vocabulary_chats`, `vocabulary_sentence_attempts`) attach directly to `vocabulary_words` (no intermediate "attempt" container, unlike terms' `concept_refinements`). Two new `lib/openai.ts` functions power each affordance. Four new server actions in `actions/vocabulary.ts` wrap them with auth/ownership checks matching the existing `regenerateVocabularyWord` pattern. Two new lazy-loaded client components render each affordance, composed by a single shared `VocabularyAssistant` component that both `VocabularyWordRow` and `VocabularyFlashcards` render — no UI duplicated across call sites.

**Tech Stack:** Next.js App Router, TypeScript, Supabase (Postgres + JS client), OpenAI SDK (`gpt-5.4-mini`, `chat.completions.create`).

## Global Constraints

- No unit-test framework exists in this repo (no jest/vitest/playwright config, no test script in `package.json`). Do **not** introduce one. Each task's verification step is `npx tsc --noEmit` (must report no new errors), plus `yarn lint` where noted. The final task is a manual verification pass, per this project's "start the dev server and use the feature in a browser" requirement for UI changes.
- Do not run any `supabase` CLI command. The migration SQL file is created for the user to apply manually.
- Every new/changed field must be typed; no `any`.
- Ownership is verified once per action via the existing `getVocabularyWordById(wordId, user.id)` — new DB-layer functions take a plain `wordId` with no `userId` param, exactly like `getChatsByRefinementId(refinementId)` does for terms (RLS is the last line of defense; the action layer is the actual gate, matching `regenerateVocabularyWord`'s existing pattern in `actions/vocabulary.ts`).
- Chat and sentence-practice history are independent per-word conversations — no shared "attempt/refinement" table, no conversational memory between sentence-practice attempts (each is evaluated independently).

---

### Task 1: Migration — `vocabulary_chats` and `vocabulary_sentence_attempts`

**Files:**
- Create: `supabase/migrations/20260706000000_vocabulary_chat_and_practice.sql`

**Interfaces:**
- Produces: DB tables `vocabulary_chats(id, word_id, role, content, created_at)` and `vocabulary_sentence_attempts(id, word_id, sentence, is_correct, feedback, created_at)`, both cascade-deleted with their word and RLS-scoped through `vocabulary_words.user_id`.

- [ ] **Step 1: Write the migration file**

```sql
create table vocabulary_chats (
  id bigint generated always as identity primary key,
  word_id bigint not null references vocabulary_words(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index vocabulary_chats_word_id_idx on vocabulary_chats(word_id);

alter table vocabulary_chats enable row level security;

create policy "Users can manage their own vocabulary chats"
  on vocabulary_chats
  for all
  using (
    exists (
      select 1 from vocabulary_words w
      where w.id = vocabulary_chats.word_id
      and w.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from vocabulary_words w
      where w.id = vocabulary_chats.word_id
      and w.user_id = auth.uid()
    )
  );

create table vocabulary_sentence_attempts (
  id bigint generated always as identity primary key,
  word_id bigint not null references vocabulary_words(id) on delete cascade,
  sentence text not null,
  is_correct boolean not null,
  feedback text not null,
  created_at timestamptz not null default now()
);

create index vocabulary_sentence_attempts_word_id_idx on vocabulary_sentence_attempts(word_id);

alter table vocabulary_sentence_attempts enable row level security;

create policy "Users can manage their own vocabulary sentence attempts"
  on vocabulary_sentence_attempts
  for all
  using (
    exists (
      select 1 from vocabulary_words w
      where w.id = vocabulary_sentence_attempts.word_id
      and w.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from vocabulary_words w
      where w.id = vocabulary_sentence_attempts.word_id
      and w.user_id = auth.uid()
    )
  );
```

- [ ] **Step 2: Sanity-check the SQL**

Run: `cat supabase/migrations/20260706000000_vocabulary_chat_and_practice.sql`
Expected: file contains exactly the two `create table` blocks with their indexes and RLS policies above, no syntax errors visible on inspection. Do not run any `supabase` command — flag to the user that they need to apply this migration manually before the feature works at runtime.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260706000000_vocabulary_chat_and_practice.sql
git commit -m "feat: add vocabulary_chats and vocabulary_sentence_attempts tables"
```

---

### Task 2: `lib/db.ts` — types and DB functions

**Files:**
- Modify: `lib/db.ts` — insert after `updateVocabularyAnalysis` (currently ends at `lib/db.ts:1572`), before `getTermsByCategory` (currently starts at `lib/db.ts:1574`)

**Interfaces:**
- Consumes: existing `getSupabase()` helper already used throughout `lib/db.ts`.
- Produces:
  - `export type VocabularyChatMessage = { id: number; word_id: number; role: 'user' | 'assistant'; content: string; created_at: string }`
  - `export type VocabularySentenceAttempt = { id: number; word_id: number; sentence: string; is_correct: boolean; feedback: string; created_at: string }`
  - `export async function getVocabularyChatMessages(wordId: number): Promise<VocabularyChatMessage[]>`
  - `export async function insertVocabularyChatMessages(wordId: number, messages: Array<{ role: 'user' | 'assistant'; content: string }>): Promise<VocabularyChatMessage[]>`
  - `export async function getVocabularySentenceAttempts(wordId: number): Promise<VocabularySentenceAttempt[]>`
  - `export async function insertVocabularySentenceAttempt(wordId: number, sentence: string, isCorrect: boolean, feedback: string): Promise<VocabularySentenceAttempt>`

- [ ] **Step 1: Insert the types and functions**

Insert between `lib/db.ts:1572` (the closing `}` of `updateVocabularyAnalysis`) and `lib/db.ts:1574` (`export async function getTermsByCategory`):

```ts
export type VocabularyChatMessage = {
  id: number;
  word_id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
};

export type VocabularySentenceAttempt = {
  id: number;
  word_id: number;
  sentence: string;
  is_correct: boolean;
  feedback: string;
  created_at: string;
};

export async function getVocabularyChatMessages(wordId: number): Promise<VocabularyChatMessage[]> {
  const { data, error } = await getSupabase()
    .from('vocabulary_chats')
    .select('*')
    .eq('word_id', wordId)
    .order('id', { ascending: true });
  if (error) throw error;
  return data as VocabularyChatMessage[];
}

export async function insertVocabularyChatMessages(
  wordId: number,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<VocabularyChatMessage[]> {
  const rows = messages.map((m) => ({ word_id: wordId, role: m.role, content: m.content }));
  const { data, error } = await getSupabase()
    .from('vocabulary_chats')
    .insert(rows as unknown as never)
    .select();
  if (error) throw error;
  return data as VocabularyChatMessage[];
}

export async function getVocabularySentenceAttempts(wordId: number): Promise<VocabularySentenceAttempt[]> {
  const { data, error } = await getSupabase()
    .from('vocabulary_sentence_attempts')
    .select('*')
    .eq('word_id', wordId)
    .order('id', { ascending: true });
  if (error) throw error;
  return data as VocabularySentenceAttempt[];
}

export async function insertVocabularySentenceAttempt(
  wordId: number,
  sentence: string,
  isCorrect: boolean,
  feedback: string,
): Promise<VocabularySentenceAttempt> {
  const { data, error } = await getSupabase()
    .from('vocabulary_sentence_attempts')
    .insert({ word_id: wordId, sentence, is_correct: isCorrect, feedback } as unknown as never)
    .select()
    .single();
  if (error) throw error;
  return data as VocabularySentenceAttempt;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors inside `lib/db.ts` itself. No other file references these new exports yet, so no errors should appear anywhere else either.

- [ ] **Step 3: Commit**

```bash
git add lib/db.ts
git commit -m "feat: add vocabulary chat and sentence-attempt DB functions"
```

---

### Task 3: `lib/openai.ts` — chat and sentence-evaluation LLM functions

**Files:**
- Modify: `lib/openai.ts` — insert after `analyzeVocabulary` (currently ends at `lib/openai.ts:337`), before `buildImagePrompt` (currently starts at `lib/openai.ts:339`)

**Interfaces:**
- Consumes: nothing new (uses the existing `client` OpenAI instance already used by `analyzeVocabulary`/`chatAboutTerm` in this file).
- Produces:
  - `export async function chatAboutVocabulary(word: string, type: 'word' | 'idiom', definition: string, history: Array<{ role: 'user' | 'assistant'; content: string }>, question: string): Promise<string>`
  - `export async function evaluateVocabularySentence(word: string, type: 'word' | 'idiom', definition: string, sentence: string): Promise<{ isCorrect: boolean; feedback: string }>`

- [ ] **Step 1: Insert the two functions**

Insert between `lib/openai.ts:337` (the closing `}` of `analyzeVocabulary`) and `lib/openai.ts:339` (`export async function buildImagePrompt`):

```ts
const VOCABULARY_CHAT_SYSTEM_PROMPT = (word: string, type: 'word' | 'idiom', definition: string) => {
  const typeLabel = type === 'word' ? 'word' : 'idiom/phrase';
  return `You are a vocabulary tutor helping the user understand the ${typeLabel} "${word}".
Definition: ${definition}
Answer only questions about this ${typeLabel}'s meaning, usage, origin, or related words. Be concise: respond in plain prose, no markdown, no bullet points. Maximum 2 short paragraphs.`;
};

export async function chatAboutVocabulary(
  word: string,
  type: 'word' | 'idiom',
  definition: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  question: string,
): Promise<string> {
  const response = await client.chat.completions.create({
    model: 'gpt-5.4-mini',
    messages: [
      { role: 'system', content: VOCABULARY_CHAT_SYSTEM_PROMPT(word, type, definition) },
      ...history,
      { role: 'user', content: question },
    ],
  });

  const answer = response.choices[0]?.message?.content;
  if (!answer) throw new Error('Empty response from OpenAI');
  return answer;
}

function buildSentenceEvaluationPrompt(type: 'word' | 'idiom'): string {
  const typeLabel = type === 'word' ? 'word' : 'idiom/phrase';
  return `You are a vocabulary tutor. Given a ${typeLabel}, its definition, and a sentence a learner wrote attempting to use it, judge whether the ${typeLabel} is used correctly and naturally. Respond with a JSON object with exactly these fields:

- "is_correct": true if the ${typeLabel} is used correctly and naturally in the sentence, false otherwise.
- "feedback": 1-2 sentences. If correct, briefly say why it works. If incorrect or awkward, briefly explain why and give a corrected example sentence.

Respond ONLY with valid JSON, no markdown or extra text.`;
}

export async function evaluateVocabularySentence(
  word: string,
  type: 'word' | 'idiom',
  definition: string,
  sentence: string,
): Promise<{ isCorrect: boolean; feedback: string }> {
  const response = await client.chat.completions.create({
    model: 'gpt-5.4-mini',
    messages: [
      { role: 'system', content: buildSentenceEvaluationPrompt(type) },
      {
        role: 'user',
        content: `${type === 'word' ? 'Word' : 'Idiom'}: ${word}\nDefinition: ${definition}\nSentence: ${sentence}`,
      },
    ],
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error('Empty response from OpenAI');

  const parsed = JSON.parse(raw) as Partial<{ is_correct: unknown; feedback: unknown }>;
  if (typeof parsed.is_correct !== 'boolean' || typeof parsed.feedback !== 'string') {
    throw new Error('Invalid response shape from OpenAI');
  }

  return { isCorrect: parsed.is_correct, feedback: parsed.feedback };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors inside `lib/openai.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add lib/openai.ts
git commit -m "feat: add chatAboutVocabulary and evaluateVocabularySentence"
```

---

### Task 4: `actions/vocabulary.ts` — chat and practice actions

**Files:**
- Modify: `actions/vocabulary.ts` — update the import block (`actions/vocabulary.ts:4-28`), add new actions after `setWordMainContext` (currently ends at `actions/vocabulary.ts:143`)

**Interfaces:**
- Consumes: `getVocabularyChatMessages`, `insertVocabularyChatMessages`, `getVocabularySentenceAttempts`, `insertVocabularySentenceAttempt`, `type VocabularyChatMessage`, `type VocabularySentenceAttempt` from `@/lib/db` (Task 2); `chatAboutVocabulary`, `evaluateVocabularySentence` from `@/lib/openai` (Task 3).
- Produces:
  - `export async function getVocabularyChat(wordId: number): Promise<VocabularyChatMessage[]>`
  - `export async function askVocabularyQuestion(wordId: number, question: string): Promise<VocabularyChatMessage[]>`
  - `export async function getVocabularySentenceHistory(wordId: number): Promise<VocabularySentenceAttempt[]>`
  - `export async function submitVocabularySentenceAttempt(wordId: number, sentence: string): Promise<VocabularySentenceAttempt>`

- [ ] **Step 1: Update the import block**

Replace `actions/vocabulary.ts:4-27`:

```ts
import {
  getVocabularyWords,
  searchVocabularyWords,
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
  updateVocabularyAnalysis,
  fillBlank,
  getUserSettings,
  type VocabularyWord,
} from '@/lib/db';
import {
  analyzeVocabulary,
  buildImagePrompt,
  generateVocabularyImage,
} from '@/lib/openai';
import { isValidImageModel, DEFAULT_IMAGE_MODEL } from '@/lib/imageModels';
import { getCurrentUser } from '@/lib/auth';
```

with:

```ts
import {
  getVocabularyWords,
  searchVocabularyWords,
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
  updateVocabularyAnalysis,
  getVocabularyChatMessages,
  insertVocabularyChatMessages,
  getVocabularySentenceAttempts,
  insertVocabularySentenceAttempt,
  fillBlank,
  getUserSettings,
  type VocabularyWord,
  type VocabularyChatMessage,
  type VocabularySentenceAttempt,
} from '@/lib/db';
import {
  analyzeVocabulary,
  buildImagePrompt,
  generateVocabularyImage,
  chatAboutVocabulary,
  evaluateVocabularySentence,
} from '@/lib/openai';
import { isValidImageModel, DEFAULT_IMAGE_MODEL } from '@/lib/imageModels';
import { getCurrentUser } from '@/lib/auth';
```

- [ ] **Step 2: Add the four new actions after `setWordMainContext`**

Add after the existing `setWordMainContext` function (ends at `actions/vocabulary.ts:143`):

```ts
export async function getVocabularyChat(wordId: number): Promise<VocabularyChatMessage[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const word = await getVocabularyWordById(wordId, user.id);
  if (!word) throw new Error('Word not found');
  return getVocabularyChatMessages(wordId);
}

export async function askVocabularyQuestion(
  wordId: number,
  question: string,
): Promise<VocabularyChatMessage[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const word = await getVocabularyWordById(wordId, user.id);
  if (!word) throw new Error('Word not found');

  const history = await getVocabularyChatMessages(wordId);
  const answer = await chatAboutVocabulary(
    word.word,
    word.type,
    word.definition,
    history.map((m) => ({ role: m.role, content: m.content })),
    question,
  );
  await insertVocabularyChatMessages(wordId, [
    { role: 'user', content: question },
    { role: 'assistant', content: answer },
  ]);
  return getVocabularyChatMessages(wordId);
}

export async function getVocabularySentenceHistory(wordId: number): Promise<VocabularySentenceAttempt[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const word = await getVocabularyWordById(wordId, user.id);
  if (!word) throw new Error('Word not found');
  return getVocabularySentenceAttempts(wordId);
}

export async function submitVocabularySentenceAttemptAction(
  wordId: number,
  sentence: string,
): Promise<VocabularySentenceAttempt> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const word = await getVocabularyWordById(wordId, user.id);
  if (!word) throw new Error('Word not found');

  const { isCorrect, feedback } = await evaluateVocabularySentence(
    word.word,
    word.type,
    word.definition,
    sentence,
  );
  return insertVocabularySentenceAttempt(wordId, sentence, isCorrect, feedback);
}
```

Note the action is named `submitVocabularySentenceAttemptAction` (not `submitVocabularySentenceAttempt`) — that name is already taken by the `lib/db.ts` function imported above. Task 6's UI component must call `submitVocabularySentenceAttemptAction` from `@/actions/vocabulary`, not `submitVocabularySentenceAttempt`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `actions/vocabulary.ts`.

- [ ] **Step 4: Commit**

```bash
git add actions/vocabulary.ts
git commit -m "feat: add vocabulary chat and sentence-practice actions"
```

---

### Task 5: New `VocabularyChatPanel` component

**Files:**
- Create: `components/VocabularyChatPanel.tsx`

**Interfaces:**
- Consumes: `getVocabularyChat`, `askVocabularyQuestion` from `@/actions/vocabulary` (Task 4); `type VocabularyChatMessage` from `@/lib/db`.
- Produces: `export function VocabularyChatPanel(props: { wordId: number; word: string }): JSX.Element`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { useState, useEffect, useTransition } from 'react';
import { askVocabularyQuestion, getVocabularyChat } from '@/actions/vocabulary';
import type { VocabularyChatMessage } from '@/lib/db';

type Props = {
  wordId: number;
  word: string;
};

export function VocabularyChatPanel({ wordId, word }: Props) {
  const [messages, setMessages] = useState<VocabularyChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getVocabularyChat(wordId)
      .then((result) => {
        if (!cancelled) setMessages(result);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [wordId]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question) return;
    setInput('');
    setError(null);

    startTransition(async () => {
      try {
        const result = await askVocabularyQuestion(wordId, question);
        setMessages(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
        setInput(question);
      }
    });
  }

  const isDisabled = loading || isPending;

  return (
    <div>
      {messages.length > 0 && (
        <div className="px-1 py-1 flex flex-col gap-2 max-h-64 overflow-y-auto">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`text-xs rounded-lg px-3 py-2 max-w-[80%] leading-relaxed ${
                msg.role === 'user'
                  ? 'self-end bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200'
                  : 'self-start bg-cyan-50 dark:bg-cyan-950 text-cyan-900 dark:text-cyan-100'
              }`}
            >
              {msg.content}
            </div>
          ))}
        </div>
      )}
      {error && <p className="px-1 py-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
      <form onSubmit={handleSubmit} className="pt-2 flex gap-2">
        <input
          type="text"
          aria-label={`Ask a question about ${word}`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={loading ? 'Loading…' : `Ask about ${word}…`}
          disabled={isDisabled}
          className="flex-1 px-2.5 py-1.5 text-xs border border-zinc-200 dark:border-zinc-700 rounded-md bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!input.trim() || isDisabled}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? '…' : 'Ask'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `components/VocabularyChatPanel.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/VocabularyChatPanel.tsx
git commit -m "feat: add VocabularyChatPanel component"
```

---

### Task 6: New `VocabularySentencePracticePanel` component

**Files:**
- Create: `components/VocabularySentencePracticePanel.tsx`

**Interfaces:**
- Consumes: `getVocabularySentenceHistory`, `submitVocabularySentenceAttemptAction` from `@/actions/vocabulary` (Task 4); `type VocabularySentenceAttempt` from `@/lib/db`.
- Produces: `export function VocabularySentencePracticePanel(props: { wordId: number; word: string }): JSX.Element`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { useState, useEffect, useTransition } from 'react';
import { getVocabularySentenceHistory, submitVocabularySentenceAttemptAction } from '@/actions/vocabulary';
import type { VocabularySentenceAttempt } from '@/lib/db';

type Props = {
  wordId: number;
  word: string;
};

export function VocabularySentencePracticePanel({ wordId, word }: Props) {
  const [attempts, setAttempts] = useState<VocabularySentenceAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getVocabularySentenceHistory(wordId)
      .then((result) => {
        if (!cancelled) setAttempts(result);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [wordId]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const sentence = input.trim();
    if (!sentence) return;
    setInput('');
    setError(null);

    startTransition(async () => {
      try {
        const attempt = await submitVocabularySentenceAttemptAction(wordId, sentence);
        setAttempts((prev) => [...prev, attempt]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
        setInput(sentence);
      }
    });
  }

  const isDisabled = loading || isPending;

  return (
    <div>
      {attempts.length > 0 && (
        <div className="flex flex-col gap-2 max-h-64 overflow-y-auto px-1 py-1">
          {attempts.map((attempt) => (
            <div
              key={attempt.id}
              className="text-xs rounded-lg px-3 py-2 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
            >
              <p className="text-zinc-800 dark:text-zinc-200">
                <span
                  className={
                    attempt.is_correct
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }
                >
                  {attempt.is_correct ? '✓' : '✗'}
                </span>{' '}
                {attempt.sentence}
              </p>
              <p className="mt-1 text-zinc-500 dark:text-zinc-400 leading-relaxed">{attempt.feedback}</p>
            </div>
          ))}
        </div>
      )}
      {error && <p className="px-1 py-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
      <form onSubmit={handleSubmit} className="pt-2 flex gap-2">
        <input
          type="text"
          aria-label={`Write a sentence using ${word}`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={loading ? 'Loading…' : `Use "${word}" in a sentence…`}
          disabled={isDisabled}
          className="flex-1 px-2.5 py-1.5 text-xs border border-zinc-200 dark:border-zinc-700 rounded-md bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!input.trim() || isDisabled}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? '…' : 'Check'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `components/VocabularySentencePracticePanel.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/VocabularySentencePracticePanel.tsx
git commit -m "feat: add VocabularySentencePracticePanel component"
```

---

### Task 7: New `VocabularyAssistant` component

**Files:**
- Create: `components/VocabularyAssistant.tsx`

**Interfaces:**
- Consumes: `VocabularyChatPanel` (Task 5), `VocabularySentencePracticePanel` (Task 6).
- Produces: `export function VocabularyAssistant(props: { wordId: number; word: string }): JSX.Element`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { useState } from 'react';
import { VocabularyChatPanel } from '@/components/VocabularyChatPanel';
import { VocabularySentencePracticePanel } from '@/components/VocabularySentencePracticePanel';

type Props = {
  wordId: number;
  word: string;
};

export function VocabularyAssistant({ wordId, word }: Props) {
  const [chatOpen, setChatOpen] = useState(false);
  const [practiceOpen, setPracticeOpen] = useState(false);

  return (
    <div className="pt-2 space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setChatOpen((prev) => !prev)}
          className={`flex-1 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
            chatOpen
              ? 'border-cyan-500 bg-cyan-50 text-cyan-700 dark:border-cyan-600 dark:bg-cyan-950 dark:text-cyan-300'
              : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
          }`}
        >
          Ask AI
        </button>
        <button
          type="button"
          onClick={() => setPracticeOpen((prev) => !prev)}
          className={`flex-1 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
            practiceOpen
              ? 'border-cyan-500 bg-cyan-50 text-cyan-700 dark:border-cyan-600 dark:bg-cyan-950 dark:text-cyan-300'
              : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
          }`}
        >
          Practice a sentence
        </button>
      </div>
      {chatOpen && (
        <div className="border border-cyan-500 dark:border-cyan-600 rounded-lg overflow-hidden px-3 py-2">
          <VocabularyChatPanel wordId={wordId} word={word} />
        </div>
      )}
      {practiceOpen && (
        <div className="border border-cyan-500 dark:border-cyan-600 rounded-lg overflow-hidden px-3 py-2">
          <VocabularySentencePracticePanel wordId={wordId} word={word} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `components/VocabularyAssistant.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/VocabularyAssistant.tsx
git commit -m "feat: add VocabularyAssistant component"
```

---

### Task 8: Wire `VocabularyAssistant` into `VocabularyWordRow`

**Files:**
- Modify: `components/VocabularyWordRow.tsx:1-7` (imports), `:89-95` (after the `VocabularyImage` block)

**Interfaces:**
- Consumes: `VocabularyAssistant` (Task 7).

- [ ] **Step 1: Import the component**

Replace `components/VocabularyWordRow.tsx:7`:

```ts
import { VocabularyContextSentences } from '@/components/VocabularyContextSentences';
```

with:

```ts
import { VocabularyContextSentences } from '@/components/VocabularyContextSentences';
import { VocabularyAssistant } from '@/components/VocabularyAssistant';
```

- [ ] **Step 2: Render it after the image block**

Replace `components/VocabularyWordRow.tsx:89-95`:

```tsx
          <VocabularyImage
            wordId={w.id}
            word={w.word}
            imageUrl={w.image_url}
            imageModel={w.image_model}
            onGenerated={(imageUrl, imageModel) => onUpdated({ ...w, image_url: imageUrl, image_model: imageModel })}
          />
```

with:

```tsx
          <VocabularyImage
            wordId={w.id}
            word={w.word}
            imageUrl={w.image_url}
            imageModel={w.image_model}
            onGenerated={(imageUrl, imageModel) => onUpdated({ ...w, image_url: imageUrl, image_model: imageModel })}
          />
          <VocabularyAssistant wordId={w.id} word={w.word} />
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `components/VocabularyWordRow.tsx`.

- [ ] **Step 4: Commit**

```bash
git add components/VocabularyWordRow.tsx
git commit -m "feat: show Ask AI and Practice a sentence on the word list and search results"
```

---

### Task 9: Wire `VocabularyAssistant` into `VocabularyFlashcards`

**Files:**
- Modify: `components/VocabularyFlashcards.tsx:1-7` (imports), `:142-149` (after the `VocabularyImage` block on the card back)

**Interfaces:**
- Consumes: `VocabularyAssistant` (Task 7).

- [ ] **Step 1: Import the component**

Replace `components/VocabularyFlashcards.tsx:7`:

```ts
import { VocabularyContextSentences } from '@/components/VocabularyContextSentences';
```

with:

```ts
import { VocabularyContextSentences } from '@/components/VocabularyContextSentences';
import { VocabularyAssistant } from '@/components/VocabularyAssistant';
```

- [ ] **Step 2: Render it after the image block on the card back**

Replace `components/VocabularyFlashcards.tsx:142-149`:

```tsx
                  <VocabularyImage
                    key={current.id}
                    wordId={current.id}
                    word={current.word}
                    imageUrl={current.image_url}
                    imageModel={current.image_model}
                    onGenerated={handleImageGenerated}
                  />
```

with:

```tsx
                  <VocabularyImage
                    key={current.id}
                    wordId={current.id}
                    word={current.word}
                    imageUrl={current.image_url}
                    imageModel={current.image_model}
                    onGenerated={handleImageGenerated}
                  />
                  <VocabularyAssistant wordId={current.id} word={current.word} />
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `components/VocabularyFlashcards.tsx`. This should be the last file with any outstanding errors — the project should be fully clean project-wide at this point.

- [ ] **Step 4: Lint**

Run: `yarn lint`
Expected: no new lint errors (pre-existing issues in unrelated files, e.g. `lib/db.ts:239-240` `prefer-const`, are not introduced by this change).

- [ ] **Step 5: Commit**

```bash
git add components/VocabularyFlashcards.tsx
git commit -m "feat: show Ask AI and Practice a sentence on the flashcard back"
```

---

### Task 10: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Apply the migration**

Ask the user to run the migration from Task 1 against their Supabase project (Supabase CLI or dashboard) — this implementation does not run `supabase` commands. Do not proceed with runtime verification until confirmed applied.

- [ ] **Step 2: Verify the word list**

Run: `yarn dev`
In the browser, expand a vocabulary word in the `/vocabulary` list. Confirm two new buttons appear: "Ask AI" and "Practice a sentence", both collapsed by default.

- [ ] **Step 3: Verify the chat**

Click "Ask AI". Type a question about the word (e.g. "When would I use this word?") and submit. Confirm a response appears, the input clears, and re-expanding the word later (or reloading the page and re-expanding) still shows the same conversation.

- [ ] **Step 4: Verify sentence practice**

Click "Practice a sentence". Type a sentence using the word and submit. Confirm a verdict (✓ or ✗) plus feedback text appears, the input clears, and the attempt persists across reload.

- [ ] **Step 5: Verify search results**

Search for the same word via the header search bar (Vocabulary scope). Confirm the expanded result shows the same "Ask AI" / "Practice a sentence" buttons and the same persisted history as the word list.

- [ ] **Step 6: Verify the flashcard back**

Open `/vocabulary/flashcards`, flip to a card's back for the same word. Confirm "Ask AI" / "Practice a sentence" appear there too, and interacting with either reflects the same persisted history as the other two surfaces.

- [ ] **Step 7: Verify a fresh word with no history**

Add a brand-new word, expand it, open both panels. Confirm both start empty (no messages, no attempts) with no errors.
