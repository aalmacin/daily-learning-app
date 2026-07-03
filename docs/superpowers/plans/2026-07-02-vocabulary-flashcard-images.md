# Vocabulary Flashcard Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in "Generate image" button to the back of vocabulary flashcards that renders an AI image from the word's `context` sentence, with model selection and regenerate.

**Architecture:** A server action takes a word's `context` → an LLM (`gpt-5.4-mini`) expands it into an image prompt → the chosen GPT Image model renders a PNG → the PNG is uploaded to a Supabase Storage bucket (`vocabulary-images`) → the public URL, prompt, and model are saved on the `vocabulary_words` row → the client component displays it. Regeneration overwrites the same storage key.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, Supabase JS (`@supabase/supabase-js`), OpenAI SDK v6 (`client.images.generate`, GPT Image models), Tailwind.

## Global Constraints

- Always use explicit types; never ignore or suppress types (no `any`, no `@ts-ignore`).
- **No test framework exists in this repo** (package.json scripts: `dev`, `build`, `start`, `lint`). Do NOT introduce one. Verification for each task = `npx tsc --noEmit` passes AND `yarn lint` passes. Task 4 adds a manual browser check.
- Do NOT run any Supabase CLI/commands. The migration SQL and bucket creation are handed to the user to apply manually.
- Selectable image models are exactly: `gpt-image-1-mini`, `gpt-image-1.5`, `gpt-image-2`. These IDs are isolated in `lib/imageModels.ts`; confirm them against the OpenAI account before shipping.
- Every DB query is scoped by `user_id`. Ownership is enforced on every read and write.
- Follow existing patterns: server actions in `actions/`, DB access in `lib/db.ts` via `getSupabase()`, OpenAI calls in `lib/openai.ts`.
- Image display uses a plain `<img>` tag (repo uses no `next/image`; avoids `remotePatterns` config).
- Commit after each task with a `feat:`/`chore:` message. Never add a Claude co-author line.

---

### Task 1: Database layer — migration, type, storage helpers

**Files:**
- Create: `supabase/migrations/2026-07-02-vocabulary-image-columns.sql` (user applies manually)
- Modify: `lib/db.ts` — `VocabularyWord` type (`lib/db.ts:1318-1330`); add two helper functions near the other vocabulary functions (after `deleteVocabularyWord`, ~`lib/db.ts:1374`)

**Interfaces:**
- Consumes: existing `getSupabase()` (`lib/db.ts:81`).
- Produces:
  - `VocabularyWord` gains `image_url: string | null; image_prompt: string | null; image_model: string | null;`
  - `uploadVocabularyImage(userId: string, wordId: number, bytes: Buffer): Promise<string>` — returns the clean public URL.
  - `updateVocabularyImage(wordId: number, userId: string, imageUrl: string, imagePrompt: string, imageModel: string): Promise<void>`

- [ ] **Step 1: Write the migration SQL file**

Create `supabase/migrations/2026-07-02-vocabulary-image-columns.sql`:

```sql
-- Adds AI image columns to vocabulary_words.
alter table vocabulary_words
  add column if not exists image_url text,
  add column if not exists image_prompt text,
  add column if not exists image_model text;

-- Public-read storage bucket for generated flashcard images.
insert into storage.buckets (id, name, public)
values ('vocabulary-images', 'vocabulary-images', true)
on conflict (id) do nothing;
```

- [ ] **Step 2: Extend the `VocabularyWord` type**

In `lib/db.ts`, add three fields to the `VocabularyWord` type (before `created_at`):

```ts
export type VocabularyWord = {
  id: number;
  user_id: string;
  word: string;
  type: 'word' | 'idiom';
  definition: string;
  context: string;
  connections: string;
  morphology: string;
  flashcard_sentence: string;
  image_url: string | null;
  image_prompt: string | null;
  image_model: string | null;
  created_at: string;
  updated_at: string;
};
```

(`getVocabularyWords` / `getVocabularyWordById` use `select('*')`, so the new columns are returned automatically.)

- [ ] **Step 3: Add the storage helpers**

In `lib/db.ts`, after `deleteVocabularyWord`, add:

```ts
export async function uploadVocabularyImage(
  userId: string,
  wordId: number,
  bytes: Buffer,
): Promise<string> {
  const path = `${userId}/${wordId}.png`;
  const { error } = await getSupabase()
    .storage.from('vocabulary-images')
    .upload(path, bytes, { contentType: 'image/png', upsert: true });
  if (error) throw error;
  const { data } = getSupabase()
    .storage.from('vocabulary-images')
    .getPublicUrl(path);
  return data.publicUrl;
}

export async function updateVocabularyImage(
  wordId: number,
  userId: string,
  imageUrl: string,
  imagePrompt: string,
  imageModel: string,
): Promise<void> {
  const { error } = await getSupabase()
    .from('vocabulary_words')
    .update({
      image_url: imageUrl,
      image_prompt: imagePrompt,
      image_model: imageModel,
    } as unknown as never)
    .eq('id', wordId)
    .eq('user_id', userId);
  if (error) throw error;
}
```

- [ ] **Step 4: Verify types and lint**

Run: `npx tsc --noEmit && yarn lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026-07-02-vocabulary-image-columns.sql lib/db.ts
git commit -m "feat: add vocabulary image columns and storage helpers"
```

---

### Task 2: Model config + OpenAI image functions

**Files:**
- Create: `lib/imageModels.ts` (client-safe — no `openai` import)
- Modify: `lib/openai.ts` — add two functions after `analyzeVocabulary` (~`lib/openai.ts:327`)

**Interfaces:**
- Consumes: existing `client` (`lib/openai.ts:9`).
- Produces:
  - `IMAGE_MODELS: readonly { id: string; label: string }[]`
  - `DEFAULT_IMAGE_MODEL: string`
  - `isValidImageModel(model: string): boolean`
  - `buildImagePrompt(word: string, context: string, definition: string): Promise<string>`
  - `generateVocabularyImage(prompt: string, model: string): Promise<Buffer>`

- [ ] **Step 1: Create the model config**

Create `lib/imageModels.ts`:

```ts
export const IMAGE_MODELS = [
  { id: 'gpt-image-1-mini', label: 'GPT Image 1 Mini' },
  { id: 'gpt-image-1.5', label: 'GPT Image 1.5' },
  { id: 'gpt-image-2', label: 'GPT Image 2' },
] as const;

export const DEFAULT_IMAGE_MODEL: string = IMAGE_MODELS[0].id;

export function isValidImageModel(model: string): boolean {
  return IMAGE_MODELS.some((m) => m.id === model);
}
```

- [ ] **Step 2: Add `buildImagePrompt`**

In `lib/openai.ts`, after `analyzeVocabulary`, add:

```ts
export async function buildImagePrompt(
  word: string,
  context: string,
  definition: string,
): Promise<string> {
  const response = await client.chat.completions.create({
    model: 'gpt-5.4-mini',
    messages: [
      {
        role: 'system',
        content:
          'You write prompts for an AI image generator. Given a vocabulary word, its definition, and an example sentence, write a single vivid, concrete image-generation prompt that depicts the scene of the example sentence and reinforces the word\'s meaning. Describe subject, composition, setting, mood, and lighting. Do NOT include any text, letters, words, captions, or writing in the image. Respond with the prompt text only — no quotes, no preamble.',
      },
      {
        role: 'user',
        content: `Word: ${word}\nDefinition: ${definition}\nExample sentence: ${context}`,
      },
    ],
  });
  const prompt = response.choices[0]?.message?.content?.trim();
  if (!prompt) throw new Error('Empty image prompt from OpenAI');
  return prompt;
}
```

- [ ] **Step 3: Add `generateVocabularyImage`**

In `lib/openai.ts`, after `buildImagePrompt`, add:

```ts
export async function generateVocabularyImage(
  prompt: string,
  model: string,
): Promise<Buffer> {
  const response = await client.images.generate({
    model,
    prompt,
    size: '1024x1024',
  });
  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error('No image returned from OpenAI');
  return Buffer.from(b64, 'base64');
}
```

- [ ] **Step 4: Verify types and lint**

Run: `npx tsc --noEmit && yarn lint`
Expected: no errors. (If `client.images.generate`'s `model` param is typed as a union that rejects the string, cast the body object `as unknown as never` at the call — but try without a cast first.)

- [ ] **Step 5: Commit**

```bash
git add lib/imageModels.ts lib/openai.ts
git commit -m "feat: add image model config and OpenAI image generation functions"
```

---

### Task 3: Server action `generateWordImage`

**Files:**
- Modify: `actions/vocabulary.ts` — add imports and one action

**Interfaces:**
- Consumes: `getVocabularyWordById`, `uploadVocabularyImage`, `updateVocabularyImage` (`lib/db.ts`); `buildImagePrompt`, `generateVocabularyImage` (`lib/openai.ts`); `isValidImageModel` (`lib/imageModels.ts`); `getCurrentUser` (`lib/auth.ts`); `revalidatePath`.
- Produces: `generateWordImage(wordId: number, model: string): Promise<{ imageUrl: string; imageModel: string }>`

- [ ] **Step 1: Extend imports**

In `actions/vocabulary.ts`, update the `@/lib/db` import to add `getVocabularyWordById`, `uploadVocabularyImage`, `updateVocabularyImage`; update the `@/lib/openai` import to add `buildImagePrompt`, `generateVocabularyImage`; add a new import for `isValidImageModel`:

```ts
import {
  getVocabularyWords,
  getVocabularyWordById,
  insertVocabularyWord,
  deleteVocabularyWord,
  uploadVocabularyImage,
  updateVocabularyImage,
  type VocabularyWord,
} from '@/lib/db';
import {
  analyzeVocabulary,
  buildImagePrompt,
  generateVocabularyImage,
} from '@/lib/openai';
import { isValidImageModel } from '@/lib/imageModels';
```

- [ ] **Step 2: Add the action**

At the end of `actions/vocabulary.ts`, add:

```ts
export async function generateWordImage(
  wordId: number,
  model: string,
): Promise<{ imageUrl: string; imageModel: string }> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  if (!isValidImageModel(model)) throw new Error('Invalid image model');

  const word = await getVocabularyWordById(wordId, user.id);
  if (!word) throw new Error('Word not found');

  const prompt = await buildImagePrompt(word.word, word.context, word.definition);
  const bytes = await generateVocabularyImage(prompt, model);
  const publicUrl = await uploadVocabularyImage(user.id, wordId, bytes);
  // Version the URL so overwritten (regenerated) images bypass browser/CDN cache.
  const imageUrl = `${publicUrl}?v=${Date.now()}`;
  await updateVocabularyImage(wordId, user.id, imageUrl, prompt, model);

  revalidatePath('/vocabulary/flashcards');
  return { imageUrl, imageModel: model };
}
```

- [ ] **Step 3: Verify types and lint**

Run: `npx tsc --noEmit && yarn lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add actions/vocabulary.ts
git commit -m "feat: add generateWordImage server action"
```

---

### Task 4: Flashcard UI — image display, model picker, generate/regenerate

**Files:**
- Modify: `components/VocabularyFlashcards.tsx`

**Interfaces:**
- Consumes: `generateWordImage` (`actions/vocabulary.ts`); `IMAGE_MODELS`, `DEFAULT_IMAGE_MODEL` (`lib/imageModels.ts`); `VocabularyWord` (`lib/db.ts`).
- Produces: UI only.

- [ ] **Step 1: Add imports and local word state**

At the top of `components/VocabularyFlashcards.tsx`, add imports:

```ts
import { generateWordImage } from '@/actions/vocabulary';
import { IMAGE_MODELS, DEFAULT_IMAGE_MODEL } from '@/lib/imageModels';
```

Inside the component, hold an editable copy of the words so a generated image persists while navigating during the session, and add image UI state:

```ts
const [wordState, setWordState] = useState<VocabularyWord[]>(words);
const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_IMAGE_MODEL);
const [generating, setGenerating] = useState(false);
const [imageError, setImageError] = useState<string | null>(null);
```

Change the `filtered` `useMemo` to read from `wordState` instead of `words` (dependency array becomes `[wordState, filter]`):

```ts
const filtered = useMemo(() => {
  const list = filter === 'all' ? wordState : wordState.filter((w) => w.type === filter);
  return [...list].sort(() => Math.random() - 0.5);
}, [wordState, filter]);
```

- [ ] **Step 2: Reset image state when the card changes**

Update `handleNext` to also clear the transient image error and generating flag:

```ts
const handleNext = () => {
  setShowBack(false);
  setImageError(null);
  setGenerating(false);
  if (currentIndex < filtered.length - 1) {
    setCurrentIndex((i) => i + 1);
  } else {
    setCurrentIndex(0);
  }
};
```

- [ ] **Step 3: Add the generate handler**

Inside the component, add:

```ts
const handleGenerate = async () => {
  if (!current || generating) return;
  setGenerating(true);
  setImageError(null);
  try {
    const { imageUrl, imageModel } = await generateWordImage(current.id, selectedModel);
    setWordState((prev) =>
      prev.map((w) =>
        w.id === current.id
          ? { ...w, image_url: imageUrl, image_model: imageModel }
          : w,
      ),
    );
  } catch {
    setImageError('Could not generate image. Try again.');
  } finally {
    setGenerating(false);
  }
};
```

- [ ] **Step 4: Render the image section on the card back**

In the "Back details" block, after the `<DetailSection title="Morphology" ... />` line and before the closing `</div>` of that block, add an image section:

```tsx
<div className="pt-2">
  <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2">
    Image
  </h4>

  {current.image_url && (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={current.image_url}
      alt={`Illustration for ${current.word}`}
      className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 mb-3"
    />
  )}

  <div className="flex items-center gap-2">
    <select
      value={selectedModel}
      onChange={(e) => setSelectedModel(e.target.value)}
      disabled={generating}
      className="text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 px-2 py-1.5"
    >
      {IMAGE_MODELS.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
    </select>
    <button
      onClick={handleGenerate}
      disabled={generating}
      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
    >
      {generating
        ? 'Generating…'
        : current.image_url
          ? 'Regenerate'
          : 'Generate image'}
    </button>
  </div>

  {imageError && (
    <p className="mt-2 text-xs text-red-600 dark:text-red-400">{imageError}</p>
  )}
</div>
```

- [ ] **Step 5: Default the picker to the card's last-used model**

So the picker reflects a card's existing image model when flipping to its back, update `selectedModel` when the card is shown. Add this just after the `handleGenerate` definition:

```ts
const handleShowBack = () => {
  setShowBack(true);
  setImageError(null);
  if (current?.image_model) setSelectedModel(current.image_model);
};
```

Change the "Show Answer" button's `onClick` from `() => setShowBack(true)` to `handleShowBack`.

- [ ] **Step 6: Verify types and lint**

Run: `npx tsc --noEmit && yarn lint`
Expected: no errors.

- [ ] **Step 7: Manual browser verification**

Run: `yarn dev` and open `http://localhost:5023/vocabulary/flashcards`.
Confirm, in order:
1. Flip a card → "Show Answer" → the Image section shows a model dropdown and a "Generate image" button.
2. Click "Generate image" → button shows "Generating…", then an image appears above the controls.
3. Button now reads "Regenerate"; the dropdown lists the three models.
4. Pick a different model, click "Regenerate" → image updates (URL changes via the `?v=` param).
5. Navigate to the next card and back → the generated image persists (from `wordState`).
6. Reload the page → the image still shows (persisted `image_url` from the DB).

(Requires the Task 1 migration + bucket applied in Supabase and valid model IDs.)

- [ ] **Step 8: Commit**

```bash
git add components/VocabularyFlashcards.tsx
git commit -m "feat: show AI image on vocabulary flashcard back with model picker and regenerate"
```

---

## Notes for the implementer

- **Migration is manual.** Task 1's `.sql` file must be applied by the user in Supabase (CLI or dashboard) before Task 4's browser check. Do not run Supabase commands.
- **Model IDs are unverified.** If image generation 400s on an unknown model, the fix is limited to `lib/imageModels.ts`.
- **No partial DB state:** the row is only updated after a successful upload, so a failed generation/upload leaves the previous image (or none) intact.
