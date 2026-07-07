# Vocabulary Chat and Sentence Practice — Design

**Date:** 2026-07-06
**Status:** Approved (pending spec review)

## Goal

Give vocabulary words/idioms the same kind of AI help terms already have via
the research chat, adapted to two distinct capabilities:

1. **Ask AI** — a free-form conversational chat scoped to one word/idiom
   (ask about meaning, usage, origin, related words).
2. **Practice a sentence** — submit a sentence attempting to use the
   word/idiom; get a quick correct/needs-work verdict plus a short
   explanation (and a corrected example when it's off).

Both are separate, independently-toggleable affordances (not merged into one
chat) and both persist their history per word.

## Decisions

- **Feature shape:** Two separate affordances, not a single unified chat.
  Chat is for open-ended questions; practice is a dedicated
  submit-a-sentence-get-feedback flow.
- **Persistence:** Both chat messages and sentence attempts are saved to the
  DB per word, so they're still there when you come back to that word later.
- **Feedback format:** Structured — `is_correct: boolean` + a short
  `feedback` string (1-2 sentences; includes a corrected example when
  `is_correct` is false).
- **Web search:** Not included for vocabulary chat (unlike the term research
  chat). Vocabulary questions are about meaning/usage, not fast-changing
  facts — no need for the Responses API / web_search tool machinery.
- **UI placement:** Both panels appear everywhere a vocabulary word is
  presented in depth — the word list (`VocabularyList`/`VocabularyWordRow`),
  the vocabulary search dropdown (`VocabularySearchResults`), **and** the
  flashcard review back (`VocabularyFlashcards`). A single shared
  `VocabularyAssistant` component (not duplicated per call site) provides
  the two toggle buttons and their panels.
- **No shared container table:** Unlike terms (where chat hangs off a
  `concept_refinements` "attempt" row), vocabulary has no attempt/refinement
  concept. Chat messages and sentence attempts attach directly to
  `vocabulary_words` — simpler, no intermediate table.

## Data Model

Two new tables, both cascade-deleted with their word and RLS-scoped through
`vocabulary_words.user_id` (join, since neither table stores `user_id`
directly):

```sql
create table vocabulary_chats (
  id bigint generated always as identity primary key,
  word_id bigint not null references vocabulary_words(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create table vocabulary_sentence_attempts (
  id bigint generated always as identity primary key,
  word_id bigint not null references vocabulary_words(id) on delete cascade,
  sentence text not null,
  is_correct boolean not null,
  feedback text not null,
  created_at timestamptz not null default now()
);
```

Both get an index on `word_id` and an RLS policy analogous to
`research_chats`' (join through the parent table to check
`vocabulary_words.user_id = auth.uid()`).

`lib/db.ts` gains:

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
```

New `lib/db.ts` functions (no `userId` param — ownership is verified once at
the action layer via the existing `getVocabularyWordById(wordId, userId)`,
matching the `getChatsByRefinementId(refinementId)` convention):

- `getVocabularyChatMessages(wordId): Promise<VocabularyChatMessage[]>`
- `insertVocabularyChatMessages(wordId, messages: { role, content }[]): Promise<void>`
- `getVocabularySentenceAttempts(wordId): Promise<VocabularySentenceAttempt[]>`
- `insertVocabularySentenceAttempt(wordId, sentence, isCorrect, feedback): Promise<VocabularySentenceAttempt>`

## LLM Layer (`lib/openai.ts`)

```ts
export async function chatAboutVocabulary(
  word: string,
  type: 'word' | 'idiom',
  definition: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  question: string,
): Promise<string>;
```

One `chat.completions.create` call (model `gpt-5.4-mini`, same as
`analyzeVocabulary` — no Responses API, no web_search tool). System prompt
scopes the assistant to answering only questions about that word/idiom's
meaning, usage, origin, or related words; concise plain prose, no markdown,
max 2 short paragraphs. `input` messages = `[system, ...history, {role:
'user', content: question}]`, so the model sees the full prior conversation
every turn, same as `chatAboutTerm`.

```ts
export async function evaluateVocabularySentence(
  word: string,
  type: 'word' | 'idiom',
  definition: string,
  sentence: string,
): Promise<{ isCorrect: boolean; feedback: string }>;
```

One-shot `chat.completions.create` call with `response_format: { type:
'json_object' }`. System prompt: given the word/idiom, its definition, and a
learner's sentence, judge whether it's used correctly and naturally; return
JSON `{ "is_correct": boolean, "feedback": string }`; feedback is 1-2
sentences, and when `is_correct` is false it briefly explains why and gives a
corrected example sentence.

## Actions (`actions/vocabulary.ts`)

All four auth-checked and ownership-verified via the existing
`getVocabularyWordById(wordId, user.id)` (throwing `Not authenticated` /
`Word not found` exactly like `generateWordImage`/`regenerateVocabularyWord`
already do):

```ts
export async function getVocabularyChat(wordId: number): Promise<VocabularyChatMessage[]>;
export async function askVocabularyQuestion(wordId: number, question: string): Promise<VocabularyChatMessage[]>;
export async function getVocabularySentenceHistory(wordId: number): Promise<VocabularySentenceAttempt[]>;
export async function submitVocabularySentenceAttempt(wordId: number, sentence: string): Promise<VocabularySentenceAttempt>;
```

`askVocabularyQuestion` flow: load word → load existing history
(`getVocabularyChatMessages`) → `chatAboutVocabulary(word.word, word.type,
word.definition, history, question)` → `insertVocabularyChatMessages(wordId,
[{role:'user',content:question}, {role:'assistant',content:answer}])` →
return the refreshed full message list.

`submitVocabularySentenceAttempt` flow: load word → `evaluateVocabularySentence(word.word,
word.type, word.definition, sentence)` → `insertVocabularySentenceAttempt(wordId,
sentence, isCorrect, feedback)` → return the new attempt row.

## Components

### `components/VocabularyAssistant.tsx` (new)

```ts
type Props = {
  wordId: number;
  word: string;
  type: 'word' | 'idiom';
  definition: string;
};
```

Renders two toggle buttons, "Ask AI" and "Practice a sentence" (mirroring the
term card's "Research" toggle button style). Each reveals its panel
independently; both can be open at once. Panels are only mounted (and only
fetch their data) once toggled open — no eager loading for every word in a
list.

### `components/VocabularyChatPanel.tsx` (new)

Mirrors `ResearchChat`'s structure, minus `useWeb`/citations: on mount, loads
`getVocabularyChat(wordId)`; message list (user right-aligned, assistant
left-aligned, scrollable); text input + submit; calls
`askVocabularyQuestion(wordId, question)` on submit, optimistic input clear,
error handling matching `ResearchChat`'s pattern (restore input text on
failure).

### `components/VocabularySentencePracticePanel.tsx` (new)

On mount, loads `getVocabularySentenceHistory(wordId)`. Renders past attempts
oldest-to-newest, each showing the sentence, a verdict indicator (✓ / ✗ or
equivalent), and the feedback text. A text input + submit button calls
`submitVocabularySentenceAttempt(wordId, sentence)`, appending the result to
the list on success.

### Call sites

- `components/VocabularyWordRow.tsx` — renders `<VocabularyAssistant
  wordId={w.id} word={w.word} type={w.type} definition={w.definition} />`
  inside the expanded content, alongside the existing Definition/Context/
  Connections/Morphology/Image sections. Used by both `VocabularyList` (the
  word list page) and `VocabularySearchResults` (the search dropdown) — no
  extra wiring needed there since both already delegate to
  `VocabularyWordRow`.
- `components/VocabularyFlashcards.tsx` — renders the same
  `<VocabularyAssistant .../>` in the card back, alongside the existing
  Definition/Context/Connections/Morphology/Image sections.

## Migration

New file `supabase/migrations/20260706000000_vocabulary_chat_and_practice.sql`
containing both `create table` statements, their indexes, and RLS policies.
Per project convention, this implementation does not run `supabase`
commands — the user applies it manually.

## Error Handling

- `askVocabularyQuestion`/`submitVocabularySentenceAttempt`: auth/ownership
  failures throw before any OpenAI call, same as existing vocabulary actions.
- Chat panel: on a failed `askVocabularyQuestion` call, the typed question is
  restored to the input (not lost) and an inline error shown — matches
  `ResearchChat`'s existing behavior.
- Practice panel: on a failed `submitVocabularySentenceAttempt` call, the
  typed sentence is restored and an inline error shown, same pattern.
- Malformed LLM JSON in `evaluateVocabularySentence` (missing/wrong-typed
  `is_correct`/`feedback`) throws before any DB write, same validation
  pattern as `analyzeVocabulary`.

## Out of Scope (YAGNI)

- Web search for vocabulary chat.
- A shared "attempt/refinement" container table — chat and practice attach
  directly to the word.
- Numeric accuracy scoring for sentence attempts (boolean verdict + prose
  feedback only).
- Editing or deleting individual chat messages / past sentence attempts.
- Any conversational memory between sentence-practice attempts (each is
  evaluated independently, without seeing prior attempts).
- Reusing `ResearchTabs` — vocabulary has no notes/video-research/citations
  concepts, so `VocabularyAssistant` uses two plain independent toggles
  instead of a tabbed panel.
