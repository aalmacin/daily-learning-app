# Vocabulary Word Finder — Design

**Date:** 2026-07-20
**Status:** Approved (pending spec review)

## Goal

Add a "tip of my tongue" chatbot to the vocabulary page: the learner
describes what they mean in a sentence (e.g. "a word for when you do
something bad but on purpose to look good later"), and the bot replies once
with up to 3 candidate words or idioms, each with one example sentence
showing it in context. The learner can add any candidate straight into
their vocabulary list.

## Decisions

- **Interaction shape:** Single-turn, not a persisted conversation. Each
  submission is an independent lookup — no shared history, no "no,
  something more formal" follow-up threading. If the result isn't right,
  the learner just edits their sentence and resubmits.
- **UI placement:** A third tab, "Find a word", alongside the existing
  Words/Idioms tabs on the vocabulary page (`VocabularyPageContent.tsx`).
  When active, it replaces `VocabularyForm` + `VocabularyList` with the new
  finder UI — it is a distinct mode, not a type filter.
- **Add behavior:** Adding a candidate reuses the exact existing pipeline —
  `addVocabularyWord(word, type)` via `processVocabularyWord` from
  `vocabStore` — so a word added from the finder is indistinguishable from
  one typed into the normal Add Vocabulary form: full definition, context
  sentences, connections, morphology, and existing dedup-by-word-and-type
  all apply unchanged. The result shows up in the same floating
  pending-results panel already used elsewhere in the app.
- **Result shape:** Up to 3 candidates per query, one example sentence
  each — a short, scannable list rather than a single committed guess or a
  long list.
- **Scope (word vs idiom):** Both. The learner is describing a meaning or
  situation, not a grammatical form, so the bot picks whichever fits best
  and each candidate carries its own `type`, used unchanged when adding.
- **Persistence:** None. No new table. The search query and its candidates
  live only in component state and are gone on navigation/refresh; the only
  lasting effect is whichever word(s) the learner chooses to add (via the
  existing vocabulary tables).

## LLM Layer (`lib/openai.ts`)

```ts
export type VocabularyCandidate = {
  word: string;
  type: 'word' | 'idiom';
  example: string;
};

export async function findVocabularyWords(sentence: string): Promise<VocabularyCandidate[]>;
```

One `chat.completions.create` call (model `gpt-5.4-mini`, matching
`evaluateVocabularySentence`), `response_format: { type: 'json_object' }`.
System prompt: given a learner's description of a meaning or situation,
suggest up to 3 English words or idioms that best fit; return JSON
`{ "candidates": [{ "word": string, "type": "word" | "idiom", "example": string }] }`,
where `example` is a natural sentence using the candidate in a context
similar to what the learner described. An empty `candidates` array is a
valid response (nothing recognized).

Validation mirrors `evaluateVocabularySentence`: parse the JSON, check
`candidates` is an array (0-3 items), check each item has a non-empty
`word` string, `type` is exactly `'word'` or `'idiom'`, and a non-empty
`example` string. Throws on any malformed shape, before returning.

## Action Layer (`actions/vocabulary.ts`)

```ts
export async function findVocabularyCandidates(sentence: string): Promise<VocabularyCandidate[]>;
```

Auth-checked the same way as the rest of the file (`getCurrentUser()`,
throws `Not authenticated`). Trims the input and throws if empty. No DB
reads or writes — calls `findVocabularyWords(trimmedSentence)` and returns
its result directly.

## Component (`components/VocabularyWordFinder.tsx`, new)

- A textarea + submit button ("Find") for the description sentence.
- On submit, calls `findVocabularyCandidates(sentence)`; shows a loading
  state; on success, renders candidate cards (word, type badge, example
  sentence, "Add" button); on empty result, shows "No matches — try
  rephrasing."; on error, shows an inline error message and leaves the
  typed sentence in the textarea (not cleared) so the learner can adjust
  and retry.
- The sentence textarea is **not** auto-cleared on successful submit
  (unlike the per-word chat's clear-on-send) — this is a search box, and
  learners often want to tweak the same sentence and resubmit.
- Each candidate's "Add" button calls `addPendingWords([...])` then
  `processVocabularyWord(key, word, type, onAdded)` from `vocabStore`
  (identical to `VocabularyForm`'s submit handler) — reusing all existing
  processing/error/retry UI in the floating pending-results panel. Local
  component state tracks which candidate keys have been clicked, so an
  already-clicked "Add" button flips to a disabled "Added" state.

## Wiring (`components/VocabularyPageContent.tsx`)

- `activeTab` type widens from `'word' | 'idiom'` to `'word' | 'idiom' |
  'find'`.
- A third tab button, "Find a word", added to the existing tab row (no
  count badge — this tab has no persisted collection to count).
- When `activeTab === 'find'`, render `<VocabularyWordFinder />` in place
  of `<VocabularyForm type={activeTab} />` and `<VocabularyList ... />`.

## Error Handling

- `findVocabularyCandidates`: auth failure or empty input throws before
  any OpenAI call.
- Malformed LLM JSON in `findVocabularyWords`: throws before returning,
  same validation pattern as `evaluateVocabularySentence`.
- Component: failed `findVocabularyCandidates` call shows an inline error
  and preserves the typed sentence (not lost).
- Add failures: handled entirely by the existing `vocabStore` error/retry
  UI (`ErrorVocabResult`) — no new error handling needed in
  `VocabularyWordFinder`.

## Out of Scope (YAGNI)

- Persisted search history (no new DB table/migration).
- Multi-turn/conversational refinement within a single search thread.
- Web search (matches the existing vocabulary chat's decision — meaning
  lookups don't need fast-changing facts).
- Any "already in your list" indicator beyond what `addVocabularyWord`'s
  existing dedup-by-word naturally surfaces after clicking Add.
