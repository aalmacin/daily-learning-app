# Vocabulary Flashcard Images — Design

**Date:** 2026-07-02
**Status:** Approved (pending spec review)

## Goal

Let a user generate an AI image for a vocabulary flashcard, based on the word's
`context` sentence, and display it on the back of the card. Generation is
opt-in per card via a button. The user picks which image model to use and can
regenerate.

Example context sentence used as the basis for a prompt:

> We wandered into a quaint little bookstore tucked between two bakeries, with
> creaky wooden floors, hand-painted signs, and a cat sleeping in the sunlit
> window.

## Decisions

- **Trigger:** Manual, opt-in per card. Images are only ever created via the
  button on the flashcard back. The word-add flow (`addVocabularyWord`) is
  untouched.
- **Prompt building:** LLM-enhanced. A quick `gpt-5.4-mini` call expands the
  context sentence into a rich image-generation prompt, then the image model
  renders it.
- **Storage:** Supabase Storage bucket `vocabulary-images` (public read).
  Files keyed by `{user_id}/{word_id}.png`. The row stores the public URL.
- **Model selection:** User picks from `gpt-image-1-mini`, `gpt-image-1.5`,
  `gpt-image-2`. Defined in a single `IMAGE_MODELS` config constant so IDs are
  trivial to correct. Picker lives on the card back.
- **Regenerate:** Existing image shows a "Regenerate" button; regeneration
  overwrites the same storage key so no orphaned files.

> **Open verification:** The exact model IDs (`gpt-image-1-mini`,
> `gpt-image-1.5`, `gpt-image-2`) are newer than current knowledge and must be
> confirmed against the OpenAI account before shipping. They are isolated in
> `IMAGE_MODELS`; a wrong ID is a one-line fix.

## Data Model

Migration adds three nullable columns to `vocabulary_words`:

| Column         | Type | Purpose                                        |
| -------------- | ---- | ---------------------------------------------- |
| `image_url`    | TEXT | Public URL of the generated image (null = none)|
| `image_prompt` | TEXT | The enhanced prompt used (debug / regeneration)|
| `image_model`  | TEXT | Model ID used, so the card can default/attribute|

New Supabase Storage bucket `vocabulary-images`, public read.

> The migration SQL and bucket creation are provided for the user to apply
> manually (Supabase CLI/dashboard). The implementation does not run Supabase
> commands.

`VocabularyWord` type gains:

```ts
image_url: string | null;
image_prompt: string | null;
image_model: string | null;
```

## Components & Interfaces

### `lib/openai.ts`

```ts
export const IMAGE_MODELS: { id: string; label: string }[] = [
  { id: 'gpt-image-1-mini', label: 'GPT Image 1 Mini' },
  { id: 'gpt-image-1.5',    label: 'GPT Image 1.5' },
  { id: 'gpt-image-2',      label: 'GPT Image 2' },
];
export const DEFAULT_IMAGE_MODEL = 'gpt-image-1-mini';

// One gpt-5.4-mini call -> enhanced image prompt (explicitly "no text in image").
export async function buildImagePrompt(
  word: string, context: string, definition: string,
): Promise<string>;

// Calls client.images.generate({ model, size: '1024x1024' }); returns base64 bytes.
export async function generateVocabularyImage(
  prompt: string, model: string,
): Promise<Buffer>;
```

### `lib/db.ts`

```ts
// Uploads PNG to the vocabulary-images bucket at {userId}/{wordId}.png (upsert),
// returns the public URL.
export async function uploadVocabularyImage(
  userId: string, wordId: number, bytes: Buffer,
): Promise<string>;

// Updates image_url / image_prompt / image_model on the row (scoped by user_id).
export async function updateVocabularyImage(
  wordId: number, userId: string,
  imageUrl: string, imagePrompt: string, imageModel: string,
): Promise<void>;
```

### `actions/vocabulary.ts`

```ts
export async function generateWordImage(
  wordId: number, model: string,
): Promise<{ imageUrl: string; imageModel: string }>;
```

Flow: auth → validate `model` against `IMAGE_MODELS` (reject otherwise) → load
word (scoped to user) → `buildImagePrompt` → `generateVocabularyImage` →
`uploadVocabularyImage` → `updateVocabularyImage` →
`revalidatePath('/vocabulary/flashcards')` → return `{ imageUrl, imageModel }`.
Ownership enforced via `user_id` on every query.

### `components/VocabularyFlashcards.tsx`

- Back of card renders a model picker (`IMAGE_MODELS`, defaulting to the card's
  `image_model` or `DEFAULT_IMAGE_MODEL`) plus an action button.
- No `image_url` → button reads **"Generate image"**.
- `image_url` present → show the image; beneath it a **"Regenerate"** button
  and the picker (regenerate with a possibly different model).
- Button calls `generateWordImage(word.id, selectedModel)` with a loading state
  covering both generate and regenerate. On success, update local card state so
  the image (and `image_model`) show immediately.
- On error, show an inline message with retry.

## Data Flow

1. User flips card, clicks **Generate image** (model picker preselected).
2. Server action builds enhanced prompt from `context` + `word` + `definition`.
3. Chosen image model renders a 1024×1024 PNG (base64).
4. PNG uploaded to `vocabulary-images/{user_id}/{word_id}.png` (upsert).
5. Row updated with public URL, prompt, model.
6. Action returns URL; client swaps in the image.
7. Regenerate repeats 2–6, overwriting the same key.

## Error Handling

- Invalid model ID → action throws before any API cost.
- OpenAI prompt/image failure → propagates; client shows inline retry, row
  unchanged.
- Upload failure → propagates; row unchanged (no partial state — DB is only
  updated after a successful upload).
- Regeneration failures leave the previous image intact.

## Out of Scope (YAGNI)

- Eager/automatic generation at word-add time.
- Generation on the term (non-vocabulary) flashcards.
- Image editing, variations, or multiple images per word.
- Signed URLs / private bucket (public read is sufficient for this content).
