# Vocabulary Flashcard Front-Side Clue — Design

**Date:** 2026-07-16
**Status:** Approved (pending spec review)

## Goal

Today the front of a vocabulary/idiom flashcard shows only the cloze sentence
(the word replaced by a blank). The user has to guess purely from sentence
context. Add a short, italicized clue derived from the entry's existing
`definition`, shown below the sentence, without ever revealing the actual
word/idiom.

## Decisions

- **Clue source:** Reuse the existing `definition` field (already generated
  at creation time). No new AI call, no new stored field, no migration.
- **Clue length:** First sentence of the definition only.
- **Redaction scope:** Redact the literal word/idiom plus common regular
  inflections (e.g. `run` also matches `runs`/`running`). Multi-word idioms
  are redacted as a phrase, with inflection allowed on each content word
  (e.g. `kick the bucket` also matches `kicked the bucket`). Irregular forms
  (`ran`) are not specifically handled — acceptable gap for this scope.
- **Visibility:** Clue is shown at all times the card is on screen (both
  before and after "Show Answer"), directly under the sentence.
- **Scope:** Applies to both `word` and `idiom` types. Does not touch the
  separate term-based `Flashcard` system (`lib/db.ts` `Flashcard` type /
  `FlashcardsReview.tsx`).

## Components & Interfaces

### `lib/vocabulary-clue.ts` (new)

```ts
export function getFlashcardClue(word: string, definition: string): string;
```

Algorithm:
1. Extract the first sentence of `definition`: split on `/(?<=[.!?])\s+/`,
   take the first non-empty segment (fallback: the whole string if no
   terminator is found).
2. Build a redaction regex from `word`:
   - Split `word` on whitespace into tokens.
   - For each token, if it's not a short stopword (`the`, `a`, `an`, `in`,
     `on`, `of`, `to`, `and`, `or`, `but`), strip a trailing `ing`, `ed`,
     `es`, or `s` suffix to get a stem — but only if the resulting stem is
     at least 3 characters (avoids over-matching very short words like
     "as" → "a").
   - For each token, build a sub-pattern: stemmed tokens become
     `\b<escapedStem>\w*\b`; stopword tokens are matched literally
     (`\b<escapedToken>\b`).
   - Join sub-patterns with `\s+`, case-insensitive, global flag.
3. Replace all regex matches in the first sentence with `____`.
4. Return the trimmed result.

Regex-special characters in tokens must be escaped before building the
pattern (words are plain text today, but idioms could theoretically include
punctuation like apostrophes).

### `components/VocabularyFlashcards.tsx`

- Import `getFlashcardClue` from `lib/vocabulary-clue`.
- Compute `const clue = current ? getFlashcardClue(current.word,
  current.definition) : ''`.
- Render it as a new line under the existing sentence `<p>` inside the front
  block (`components/VocabularyFlashcards.tsx:114-122`):
  ```tsx
  <p className="mt-2 text-sm italic text-zinc-400 dark:text-zinc-500 text-center">
    {clue}
  </p>
  ```
- No change to `showBack` gating — the clue renders unconditionally
  alongside the sentence, matching current behavior where the sentence
  itself is always shown (cloze or complete).

## Data Flow

`VocabularyFlashcards` already holds the full `VocabularyWord` (including
`definition`) for the current card in state. `getFlashcardClue` is a pure
function called at render time — no new fetch, no new server action, no
persistence.

## Error Handling

None needed beyond normal JS/TS type safety — `getFlashcardClue` operates on
two always-present strings (`word`, `definition` are non-nullable on
`VocabularyWord`) and has no failure mode; worst case it returns text that
still (harmlessly) contains a fragment of the word if an inflection wasn't
anticipated.

## Testing

Unit tests for `getFlashcardClue` (e.g. `lib/vocabulary-clue.test.ts`):
- Literal word appears in definition → redacted.
- Inflected form (`running` when word is `run`) → redacted.
- Multi-word idiom, literal phrase in definition → fully redacted.
- Multi-word idiom, one word inflected (`kicked the bucket` for `kick the
  bucket`) → fully redacted.
- Word not present in definition → definition's first sentence returned
  unchanged.
- Definition with multiple sentences → only first sentence returned.
- Stopword-only tokens (e.g. idiom fragment `"in the"`) are not
  over-stemmed into false matches.

## Out of Scope (YAGNI)

- Handling irregular inflections (`ran`, `went`, `broke`, etc.).
- A dedicated AI-generated clue field distinct from the definition.
- Per-card clue difficulty levels or progressive hints.
- Applying clues to the term-based `Flashcard` system.
