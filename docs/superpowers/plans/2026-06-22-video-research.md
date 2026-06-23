# Video Research Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Video Research" tab inside the term Research section that extracts a YouTube video's transcript and uses OpenAI to produce study material (summary, key takeaways, key concepts, formatted transcript), shown per-term as editable-title accordions.

**Architecture:** A new `video_research` Supabase table (scoped by `user_id` + `term_id`). A server action fetches title (oEmbed) and inserts a `processing` row immediately, then uses Next.js `after()` to run the transcript fetch (youtubei.js) + OpenAI processing past the response. A client panel (React Query) renders the list and polls while any row is `processing`. The panel is mounted as a third tab in the existing `ResearchTabs`, so it appears on the term detail page and in the search drawer.

**Tech Stack:** Next.js 16 (App Router, Server Actions, `after`), React 19, Supabase (service-role client in `lib/db.ts`), `@tanstack/react-query`, OpenAI (`gpt-5.4-mini`), `youtubei.js` (new dep), Tailwind v4.

## Global Constraints

- TypeScript strict: **always use explicit types; never use `any` or ignore types** (user rule). Mirror the existing `as unknown as never` cast style used in `lib/db.ts` for Supabase insert/update payloads.
- **No test runner exists** in this repo. Each task's verification gate is `npx tsc --noEmit` (zero errors) and `npm run lint` (zero errors), plus manual run where stated. Do not invent a test framework.
- **Do not run any `supabase` CLI commands** (user rule). Commit the migration SQL only; the user applies it.
- **Do not read `.env` files.** Assume `OPENAI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` already exist (used by `lib/openai.ts` / `lib/db.ts`).
- Dev server: `npm run dev` on port 5023.
- OpenAI model string: `gpt-5.4-mini` (match existing calls in `lib/openai.ts`).
- Never add "Co-authored-by Claude" or commit without the user's go-ahead beyond what the execution skill does per-task.
- Per `AGENTS.md`: this is a modified Next.js — `after` is imported from `next/server` (verified in `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`).

---

## Task 1: Database migration + `video_research` types & CRUD

**Files:**
- Create: `supabase/migrations/20260622000000_video_research.sql`
- Modify: `lib/db.ts` (append types + functions at end of file)

**Interfaces:**
- Produces:
  - `type VideoResearchStatus = 'processing' | 'ready' | 'error'`
  - `type VideoKeyConcept = { concept: string; definition: string }`
  - `type VideoResearch = { id: number; user_id: string; term_id: number; youtube_url: string; video_id: string; title: string; status: VideoResearchStatus; error: string | null; raw_transcript: string | null; ai_transcript: string | null; summary: string | null; key_takeaways: string[]; key_concepts: VideoKeyConcept[]; created_at: string; updated_at: string }`
  - `getVideoResearchByTerm(termId: number, userId: string): Promise<VideoResearch[]>`
  - `getVideoResearchById(id: number): Promise<VideoResearch | null>`
  - `insertVideoResearch(input: { termId: number; userId: string; youtubeUrl: string; videoId: string; title: string }): Promise<VideoResearch>`
  - `updateVideoResearch(id: number, updates: Partial<Pick<VideoResearch, 'title' | 'status' | 'error' | 'raw_transcript' | 'ai_transcript' | 'summary' | 'key_takeaways' | 'key_concepts'>>): Promise<VideoResearch>`
  - `deleteVideoResearch(id: number, userId: string): Promise<void>`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/20260622000000_video_research.sql`:

```sql
CREATE TABLE video_research (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  term_id INTEGER NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  youtube_url TEXT NOT NULL,
  video_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'error')),
  error TEXT,
  raw_transcript TEXT,
  ai_transcript TEXT,
  summary TEXT,
  key_takeaways JSONB NOT NULL DEFAULT '[]'::jsonb,
  key_concepts JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_video_research_term_id ON video_research(term_id);
CREATE INDEX idx_video_research_user_id ON video_research(user_id);

ALTER TABLE video_research ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own video research"
  ON video_research
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

- [ ] **Step 2: Append types and CRUD to `lib/db.ts`**

Add at the end of `lib/db.ts`:

```ts
export type VideoResearchStatus = 'processing' | 'ready' | 'error';

export type VideoKeyConcept = { concept: string; definition: string };

export type VideoResearch = {
  id: number;
  user_id: string;
  term_id: number;
  youtube_url: string;
  video_id: string;
  title: string;
  status: VideoResearchStatus;
  error: string | null;
  raw_transcript: string | null;
  ai_transcript: string | null;
  summary: string | null;
  key_takeaways: string[];
  key_concepts: VideoKeyConcept[];
  created_at: string;
  updated_at: string;
};

type VideoResearchRow = Omit<VideoResearch, 'key_takeaways' | 'key_concepts'> & {
  key_takeaways: unknown;
  key_concepts: unknown;
};

function mapVideoResearchRow(row: VideoResearchRow): VideoResearch {
  return {
    ...row,
    key_takeaways: Array.isArray(row.key_takeaways) ? (row.key_takeaways as string[]) : [],
    key_concepts: Array.isArray(row.key_concepts) ? (row.key_concepts as VideoKeyConcept[]) : [],
  };
}

export async function getVideoResearchByTerm(termId: number, userId: string): Promise<VideoResearch[]> {
  const { data, error } = await getSupabase()
    .from('video_research')
    .select('*')
    .eq('term_id', termId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as VideoResearchRow[]).map(mapVideoResearchRow);
}

export async function getVideoResearchById(id: number): Promise<VideoResearch | null> {
  const { data, error } = await getSupabase()
    .from('video_research')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapVideoResearchRow(data as VideoResearchRow) : null;
}

export async function insertVideoResearch(input: {
  termId: number;
  userId: string;
  youtubeUrl: string;
  videoId: string;
  title: string;
}): Promise<VideoResearch> {
  const { data, error } = await getSupabase()
    .from('video_research')
    .insert({
      term_id: input.termId,
      user_id: input.userId,
      youtube_url: input.youtubeUrl,
      video_id: input.videoId,
      title: input.title,
      status: 'processing',
    } as unknown as never)
    .select()
    .single();
  if (error) throw error;
  return mapVideoResearchRow(data as VideoResearchRow);
}

export async function updateVideoResearch(
  id: number,
  updates: Partial<Pick<VideoResearch, 'title' | 'status' | 'error' | 'raw_transcript' | 'ai_transcript' | 'summary' | 'key_takeaways' | 'key_concepts'>>,
): Promise<VideoResearch> {
  const { data, error } = await getSupabase()
    .from('video_research')
    .update({ ...updates, updated_at: new Date().toISOString() } as unknown as never)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return mapVideoResearchRow(data as VideoResearchRow);
}

export async function deleteVideoResearch(id: number, userId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('video_research')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260622000000_video_research.sql lib/db.ts
git commit -m "feat: add video_research table and db helpers"
```

---

## Task 2: `lib/youtube.ts` — video id, title, transcript

**Files:**
- Create: `lib/youtube.ts`
- Modify: `package.json` (add `youtubei.js` dependency)

**Interfaces:**
- Consumes: none.
- Produces:
  - `parseVideoId(url: string): string | null` — extracts the 11-char id from watch / youtu.be / embed / shorts URLs; returns `null` if not parseable.
  - `fetchVideoTitle(url: string): Promise<string>` — via YouTube oEmbed; falls back to the URL string on failure.
  - `fetchTranscript(videoId: string): Promise<string>` — via youtubei.js; throws `Error('No transcript available for this video.')` when captions are absent.

- [ ] **Step 1: Install youtubei.js**

Run: `npm install youtubei.js`
Expected: `package.json` gains `"youtubei.js"` under dependencies; lockfile updates.

- [ ] **Step 2: Implement `lib/youtube.ts`**

Create `lib/youtube.ts`:

```ts
import { Innertube } from 'youtubei.js';

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export function parseVideoId(url: string): string | null {
  const trimmed = url.trim();
  if (VIDEO_ID_RE.test(trimmed)) return trimmed;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^www\./, '');
  if (host === 'youtu.be') {
    const id = parsed.pathname.slice(1);
    return VIDEO_ID_RE.test(id) ? id : null;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    const v = parsed.searchParams.get('v');
    if (v && VIDEO_ID_RE.test(v)) return v;
    const segments = parsed.pathname.split('/').filter(Boolean);
    if ((segments[0] === 'embed' || segments[0] === 'shorts' || segments[0] === 'live') && segments[1]) {
      return VIDEO_ID_RE.test(segments[1]) ? segments[1] : null;
    }
  }
  return null;
}

export async function fetchVideoTitle(url: string): Promise<string> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
    );
    if (!res.ok) return url;
    const data = (await res.json()) as { title?: unknown };
    return typeof data.title === 'string' && data.title.length > 0 ? data.title : url;
  } catch {
    return url;
  }
}

export async function fetchTranscript(videoId: string): Promise<string> {
  const yt = await Innertube.create({ retrieve_player: false });
  const info = await yt.getInfo(videoId);

  let transcript: Awaited<ReturnType<typeof info.getTranscript>>;
  try {
    transcript = await info.getTranscript();
  } catch {
    throw new Error('No transcript available for this video.');
  }

  const segments = transcript?.transcript?.content?.body?.initial_segments;
  if (!segments || segments.length === 0) {
    throw new Error('No transcript available for this video.');
  }

  const text = segments
    .map((s) => (typeof s.snippet?.text === 'string' ? s.snippet.text : ''))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) throw new Error('No transcript available for this video.');
  return text;
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors. If youtubei.js's transcript type path differs, adjust the optional-chained access to match the installed version's types (keep the same null-guards and the same thrown error message), then re-run.

- [ ] **Step 4: Sanity-check `parseVideoId` manually**

Run:
```bash
node --input-type=module -e "import('./lib/youtube.ts').catch(()=>{}); " 2>/dev/null || true
node --input-type=module -e "
const re=/^[a-zA-Z0-9_-]{11}\$/;
const cases=['https://www.youtube.com/watch?v=dQw4w9WgXcQ','https://youtu.be/dQw4w9WgXcQ','https://www.youtube.com/embed/dQw4w9WgXcQ','https://www.youtube.com/shorts/dQw4w9WgXcQ','dQw4w9WgXcQ','https://example.com'];
console.log('manual id-shape check:', cases.map(c=>c.includes('dQw4w9WgXcQ')));
"
```
Expected: prints `[true,true,true,true,true,false]` (a smoke check; the real verification is `tsc` + the manual app run in Task 7).

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/youtube.ts
git commit -m "feat: add youtube transcript/title helpers"
```

---

## Task 3: `lib/openai.ts` — video processing functions

**Files:**
- Modify: `lib/openai.ts` (append at end; reuse the existing `client`)

**Interfaces:**
- Consumes: existing `client` (`new OpenAI(...)`) already defined at top of `lib/openai.ts`.
- Produces:
  - `summarizeVideo(transcript: string): Promise<string>`
  - `extractVideoKeyTakeaways(transcript: string): Promise<string[]>`
  - `extractVideoKeyConcepts(transcript: string): Promise<{ concept: string; definition: string }[]>`
  - `formatVideoTranscript(rawTranscript: string): Promise<string>`

- [ ] **Step 1: Append the four functions to `lib/openai.ts`**

```ts
const VIDEO_MODEL = 'gpt-5.4-mini';

export async function summarizeVideo(transcript: string): Promise<string> {
  const response = await client.chat.completions.create({
    model: VIDEO_MODEL,
    messages: [
      {
        role: 'system',
        content:
          'You summarize technical video transcripts for learning. Write a concise TLDR (2-4 sentences, plain prose, no markdown) capturing the core idea. Respond with the summary text only.',
      },
      { role: 'user', content: transcript },
    ],
  });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('Empty response from OpenAI');
  return content.trim();
}

export async function extractVideoKeyTakeaways(transcript: string): Promise<string[]> {
  const response = await client.chat.completions.create({
    model: VIDEO_MODEL,
    messages: [
      {
        role: 'system',
        content:
          'You extract key takeaways from a technical video transcript. Respond ONLY with a JSON object of the form {"takeaways": string[]}. Each takeaway is one concise sentence. 3-7 items, most important first. No markdown.',
      },
      { role: 'user', content: transcript },
    ],
    response_format: { type: 'json_object' },
  });
  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error('Empty response from OpenAI');
  const parsed = JSON.parse(raw) as { takeaways?: unknown };
  if (!Array.isArray(parsed.takeaways) || !parsed.takeaways.every((t) => typeof t === 'string')) {
    throw new Error('Invalid response shape from OpenAI');
  }
  return parsed.takeaways as string[];
}

export async function extractVideoKeyConcepts(
  transcript: string,
): Promise<{ concept: string; definition: string }[]> {
  const response = await client.chat.completions.create({
    model: VIDEO_MODEL,
    messages: [
      {
        role: 'system',
        content:
          'You mine key concepts from a technical video transcript that are worth researching individually. Respond ONLY with a JSON object of the form {"concepts": {"concept": string, "definition": string}[]}. Definition is concise and from your own knowledge. Sort by importance to the video, most important first. No markdown.',
      },
      { role: 'user', content: transcript },
    ],
    response_format: { type: 'json_object' },
  });
  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error('Empty response from OpenAI');
  const parsed = JSON.parse(raw) as { concepts?: unknown };
  if (
    !Array.isArray(parsed.concepts) ||
    !parsed.concepts.every(
      (c) =>
        c && typeof c === 'object' &&
        typeof (c as Record<string, unknown>).concept === 'string' &&
        typeof (c as Record<string, unknown>).definition === 'string',
    )
  ) {
    throw new Error('Invalid response shape from OpenAI');
  }
  return parsed.concepts as { concept: string; definition: string }[];
}

// Split on whitespace into chunks of ~12k characters at word boundaries so a long
// transcript does not exceed the model's output-token limit when reformatting.
function chunkText(text: string, maxChars = 12000): string[] {
  if (text.length <= maxChars) return [text];
  const words = text.split(' ');
  const chunks: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length + word.length + 1 > maxChars && current.length > 0) {
      chunks.push(current);
      current = '';
    }
    current = current ? `${current} ${word}` : word;
  }
  if (current) chunks.push(current);
  return chunks;
}

export async function formatVideoTranscript(rawTranscript: string): Promise<string> {
  const chunks = chunkText(rawTranscript);
  const formatted: string[] = [];
  for (const chunk of chunks) {
    const response = await client.chat.completions.create({
      model: VIDEO_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You clean up a raw video transcript chunk. Keep the same spoken words in the same order. Fix mis-transcribed technical terms, add proper punctuation and capitalization, and break into natural paragraphs. Do NOT summarize, add headings, or rewrite into an article — it must stay a transcript. Respond with the corrected transcript text only.',
        },
        { role: 'user', content: chunk },
      ],
    });
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response from OpenAI');
    formatted.push(content.trim());
  }
  return formatted.join('\n\n');
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/openai.ts
git commit -m "feat: add OpenAI video processing functions"
```

---

## Task 4: `actions/videoResearch.ts` — server actions + pipeline

**Files:**
- Create: `actions/videoResearch.ts`

**Interfaces:**
- Consumes: `getCurrentUser` (`@/lib/auth`); db helpers from Task 1; youtube helpers from Task 2; openai helpers from Task 3; `after` from `next/server`.
- Produces:
  - `listVideoResearch(termId: number): Promise<VideoResearch[]>`
  - `submitVideoResearch(termId: number, url: string): Promise<VideoResearch>`
  - `updateVideoResearchTitle(id: number, title: string): Promise<VideoResearch>`
  - `removeVideoResearch(id: number): Promise<void>`
  - `retryVideoResearch(id: number): Promise<VideoResearch>`

- [ ] **Step 1: Implement `actions/videoResearch.ts`**

Create `actions/videoResearch.ts`:

```ts
'use server';

import { after } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  getVideoResearchByTerm,
  getVideoResearchById,
  insertVideoResearch,
  updateVideoResearch,
  deleteVideoResearch,
  type VideoResearch,
} from '@/lib/db';
import { parseVideoId, fetchVideoTitle, fetchTranscript } from '@/lib/youtube';
import {
  summarizeVideo,
  extractVideoKeyTakeaways,
  extractVideoKeyConcepts,
  formatVideoTranscript,
} from '@/lib/openai';

export async function listVideoResearch(termId: number): Promise<VideoResearch[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  return getVideoResearchByTerm(termId, user.id);
}

// Runs after the response via after(); fetches transcript and generates study material.
async function processVideoResearch(id: number, videoId: string): Promise<void> {
  try {
    const rawTranscript = await fetchTranscript(videoId);
    const [summary, keyTakeaways, keyConcepts, aiTranscript] = await Promise.all([
      summarizeVideo(rawTranscript),
      extractVideoKeyTakeaways(rawTranscript),
      extractVideoKeyConcepts(rawTranscript),
      formatVideoTranscript(rawTranscript),
    ]);
    await updateVideoResearch(id, {
      status: 'ready',
      error: null,
      raw_transcript: rawTranscript,
      ai_transcript: aiTranscript,
      summary,
      key_takeaways: keyTakeaways,
      key_concepts: keyConcepts,
    });
  } catch (e) {
    await updateVideoResearch(id, {
      status: 'error',
      error: e instanceof Error ? e.message : 'Failed to process video',
    });
  }
}

export async function submitVideoResearch(termId: number, url: string): Promise<VideoResearch> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const videoId = parseVideoId(url);
  if (!videoId) throw new Error('Enter a valid YouTube URL.');

  const title = await fetchVideoTitle(url);
  const row = await insertVideoResearch({
    termId,
    userId: user.id,
    youtubeUrl: url,
    videoId,
    title,
  });

  after(() => processVideoResearch(row.id, videoId));

  return row;
}

export async function updateVideoResearchTitle(id: number, title: string): Promise<VideoResearch> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const existing = await getVideoResearchById(id);
  if (!existing || existing.user_id !== user.id) throw new Error('Not found');
  const trimmed = title.trim();
  if (!trimmed) throw new Error('Title cannot be empty.');
  return updateVideoResearch(id, { title: trimmed });
}

export async function removeVideoResearch(id: number): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  await deleteVideoResearch(id, user.id);
}

export async function retryVideoResearch(id: number): Promise<VideoResearch> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const existing = await getVideoResearchById(id);
  if (!existing || existing.user_id !== user.id) throw new Error('Not found');
  const row = await updateVideoResearch(id, { status: 'processing', error: null });
  after(() => processVideoResearch(row.id, row.video_id));
  return row;
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add actions/videoResearch.ts
git commit -m "feat: add video research server actions and pipeline"
```

---

## Task 5: `components/VideoResearchItem.tsx` — accordion + inner tabs

**Files:**
- Create: `components/VideoResearchItem.tsx`

**Interfaces:**
- Consumes: `VideoResearch` type (`@/lib/db`); `updateVideoResearchTitle`, `removeVideoResearch`, `retryVideoResearch` (`@/actions/videoResearch`); `accent` prop ('zinc' | 'cyan') matching `ResearchTabs`.
- Produces: `VideoResearchItem` component:
  - Props: `{ item: VideoResearch; accent?: 'zinc' | 'cyan'; onChanged: () => void }`
  - `onChanged` is called after title edit / delete / retry so the parent can refetch.

- [ ] **Step 1: Implement `components/VideoResearchItem.tsx`**

Create `components/VideoResearchItem.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import type { VideoResearch } from '@/lib/db';
import { updateVideoResearchTitle, removeVideoResearch, retryVideoResearch } from '@/actions/videoResearch';

type Accent = 'zinc' | 'cyan';
type Tab = 'summary' | 'study' | 'ai' | 'concepts' | 'raw';

type Props = {
  item: VideoResearch;
  accent?: Accent;
  onChanged: () => void;
};

const TABS: { id: Tab; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'study', label: 'Study' },
  { id: 'ai', label: 'AI Transcript' },
  { id: 'concepts', label: 'Key Concepts' },
  { id: 'raw', label: 'Raw Transcript' },
];

function ConceptsTable({ concepts }: { concepts: VideoResearch['key_concepts'] }) {
  if (concepts.length === 0) return <p className="text-xs text-zinc-400 dark:text-zinc-500">No concepts.</p>;
  return (
    <table className="w-full border-collapse text-xs">
      <tbody>
        {concepts.map((c, i) => (
          <tr key={i}>
            <td className="border border-zinc-200 dark:border-zinc-700 px-2.5 py-1.5 font-semibold align-top w-1/3 text-zinc-900 dark:text-zinc-50">{c.concept}</td>
            <td className="border border-zinc-200 dark:border-zinc-700 px-2.5 py-1.5 align-top text-zinc-700 dark:text-zinc-300">{c.definition}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Takeaways({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-xs text-zinc-400 dark:text-zinc-500">No takeaways.</p>;
  return (
    <ul className="list-disc pl-5 text-sm leading-6 text-zinc-700 dark:text-zinc-300 space-y-1">
      {items.map((t, i) => <li key={i}>{t}</li>)}
    </ul>
  );
}

export function VideoResearchItem({ item, accent = 'zinc', onChanged }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<Tab>('summary');
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(item.title);
  const [isPending, startTransition] = useTransition();

  const activeTab =
    accent === 'cyan'
      ? 'text-cyan-700 dark:text-cyan-300 border-cyan-500 dark:border-cyan-600'
      : 'text-zinc-900 dark:text-zinc-50 border-zinc-900 dark:border-zinc-50';
  const openBorder = expanded ? 'border-cyan-500 dark:border-cyan-600' : 'border-zinc-200 dark:border-zinc-800';

  const saveTitle = () => {
    const next = titleDraft.trim();
    if (!next || next === item.title) {
      setEditing(false);
      setTitleDraft(item.title);
      return;
    }
    startTransition(async () => {
      await updateVideoResearchTitle(item.id, next);
      setEditing(false);
      onChanged();
    });
  };

  const handleDelete = () => {
    if (!confirm('Remove this video?')) return;
    startTransition(async () => {
      await removeVideoResearch(item.id);
      onChanged();
    });
  };

  const handleRetry = () => {
    startTransition(async () => {
      await retryVideoResearch(item.id);
      onChanged();
    });
  };

  return (
    <div className={`border rounded-lg overflow-hidden bg-white dark:bg-zinc-900 ${openBorder}`}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setExpanded((o) => !o)}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          className="text-zinc-400 dark:text-zinc-500"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        {editing ? (
          <input
            value={titleDraft}
            autoFocus
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setEditing(false); setTitleDraft(item.title); } }}
            className="flex-1 px-2 py-1 text-sm rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 focus:outline-none"
          />
        ) : (
          <button type="button" onClick={() => setExpanded((o) => !o)} className="flex-1 text-left text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {item.title}
          </button>
        )}

        {item.status === 'processing' && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300 flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full animate-spin" /> Processing
          </span>
        )}
        {item.status === 'ready' && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">Ready</span>
        )}
        {item.status === 'error' && (
          <>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">Error</span>
            <button type="button" onClick={handleRetry} disabled={isPending} className="text-[11px] font-semibold text-red-600 dark:text-red-400 underline disabled:opacity-40">Retry</button>
          </>
        )}

        {!editing && (
          <button type="button" onClick={() => { setEditing(true); setTitleDraft(item.title); }} title="Edit title" className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z" /></svg>
          </button>
        )}
        <button type="button" onClick={handleDelete} disabled={isPending} title="Remove" className="text-zinc-400 hover:text-red-600 disabled:opacity-40">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
        </button>
      </div>

      {expanded && (
        <div className="border-t border-zinc-100 dark:border-zinc-800 p-3">
          {item.status === 'error' && (
            <p className="text-xs text-red-600 dark:text-red-400 mb-3">{item.error ?? 'Processing failed.'}</p>
          )}

          <div className="relative w-full mb-3" style={{ aspectRatio: '16 / 9' }}>
            <iframe
              className="absolute inset-0 w-full h-full rounded-lg border-0"
              src={`https://www.youtube.com/embed/${item.video_id}`}
              title={item.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>

          {item.status === 'processing' ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Generating study material…</p>
          ) : item.status === 'ready' ? (
            <>
              <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-700 px-1 flex-wrap">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                      tab === t.id ? activeTab : 'text-zinc-400 dark:text-zinc-500 border-transparent hover:text-zinc-600 dark:hover:text-zinc-300'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="pt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                {tab === 'summary' && <p>{item.summary}</p>}
                {tab === 'study' && (
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">Summary</p>
                      <p>{item.summary}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">Key Takeaways</p>
                      <Takeaways items={item.key_takeaways} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">Key Concepts</p>
                      <ConceptsTable concepts={item.key_concepts} />
                    </div>
                  </div>
                )}
                {tab === 'ai' && <p className="whitespace-pre-wrap">{item.ai_transcript}</p>}
                {tab === 'concepts' && <ConceptsTable concepts={item.key_concepts} />}
                {tab === 'raw' && <p className="whitespace-pre-wrap font-mono text-xs text-zinc-500 dark:text-zinc-400">{item.raw_transcript}</p>}
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/VideoResearchItem.tsx
git commit -m "feat: add VideoResearchItem accordion component"
```

---

## Task 6: `components/VideoResearchPanel.tsx` — submit + list + polling

**Files:**
- Create: `components/VideoResearchPanel.tsx`
- Modify: `lib/queryKeys.ts` (add `videoResearch` key)

**Interfaces:**
- Consumes: `listVideoResearch`, `submitVideoResearch` (`@/actions/videoResearch`); `VideoResearchItem` (Task 5); `useQuery`, `useQueryClient` from `@tanstack/react-query`; `queryKeys` (`@/lib/queryKeys`).
- Produces: `VideoResearchPanel` component:
  - Props: `{ termId: number; accent?: 'zinc' | 'cyan' }`

- [ ] **Step 1: Add the query key to `lib/queryKeys.ts`**

Modify `lib/queryKeys.ts` — add inside the `queryKeys` object:

```ts
  videoResearch: {
    all: (termId: number) => ['videoResearch', termId] as const,
  },
```

- [ ] **Step 2: Implement `components/VideoResearchPanel.tsx`**

Create `components/VideoResearchPanel.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { listVideoResearch, submitVideoResearch } from '@/actions/videoResearch';
import { VideoResearchItem } from './VideoResearchItem';

type Accent = 'zinc' | 'cyan';

type Props = {
  termId: number;
  accent?: Accent;
};

export function VideoResearchPanel({ termId, accent = 'zinc' }: Props) {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const { data: items = [] } = useQuery({
    queryKey: queryKeys.videoResearch.all(termId),
    queryFn: () => listVideoResearch(termId),
    refetchInterval: (query) =>
      (query.state.data ?? []).some((v) => v.status === 'processing') ? 3000 : false,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.videoResearch.all(termId) });

  const handleSubmit = () => {
    const value = url.trim();
    if (!value) return;
    setError(null);
    startTransition(async () => {
      try {
        await submitVideoResearch(termId, value);
        setUrl('');
        await invalidate();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to submit');
      }
    });
  };

  const submitBtn =
    accent === 'cyan'
      ? 'bg-cyan-600 hover:bg-cyan-500 text-white'
      : 'bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200';

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="Paste a YouTube URL to research…"
          disabled={isPending}
          className="flex-1 px-3 py-2 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!url.trim() || isPending}
          className={`px-4 py-2 text-xs font-medium rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${submitBtn}`}
        >
          {isPending ? 'Adding…' : 'Extract'}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      {items.length === 0 ? (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">No videos yet. Paste a YouTube URL to extract study material.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <VideoResearchItem key={item.id} item={item} accent={accent} onChanged={invalidate} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors. (Note: `refetchInterval` receives the query object; `query.state.data` is typed as `VideoResearch[] | undefined`.)

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/VideoResearchPanel.tsx lib/queryKeys.ts
git commit -m "feat: add VideoResearchPanel with polling"
```

---

## Task 7: Wire "Video Research" tab into `ResearchTabs` + manual verification

**Files:**
- Modify: `components/ResearchTabs.tsx`

**Interfaces:**
- Consumes: `VideoResearchPanel` (Task 6). `ResearchTabs` already receives `termId` and `accent` props (verified in current file).

- [ ] **Step 1: Add the third tab to `components/ResearchTabs.tsx`**

In `components/ResearchTabs.tsx`:

1. Add import near the top (after `import { NoteEditor }`):

```tsx
import { VideoResearchPanel } from './VideoResearchPanel';
```

2. Add a video icon constant next to `ICON_NOTE`:

```tsx
const ICON_VIDEO = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
);
```

3. Change the tab state type and add the button + panel. Replace:

```tsx
  const [tab, setTab] = useState<'ask' | 'notes'>('ask');
```

with:

```tsx
  const [tab, setTab] = useState<'ask' | 'notes' | 'video'>('ask');
```

4. In the tab button row, after the "My Notes" button, add:

```tsx
        <button type="button" className={tabClass(tab === 'video')} onClick={() => setTab('video')}>
          {ICON_VIDEO} Video Research
        </button>
```

5. In the panel area, after the notes `<div>`, add:

```tsx
        <div className={tab === 'video' ? '' : 'hidden'}>
          <VideoResearchPanel termId={termId} accent={accent} />
        </div>
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: build succeeds with no type/lint errors.

- [ ] **Step 5: Manual end-to-end verification**

Prerequisite: the user has applied `supabase/migrations/20260622000000_video_research.sql` to their database. (If the table is missing, list/submit will error — flag this to the user rather than running supabase.)

1. Run `npm run dev`, open the app, sign in.
2. Open a term's detail page (`/terms/[id]`) and scroll to the Research section (Step 2). Confirm a third tab **Video Research** appears alongside Ask AI / My Notes.
3. Paste a real YouTube URL with captions (e.g. a conference talk) and click **Extract**. Confirm a collapsed accordion appears immediately with a **Processing** pill and the fetched title.
4. Wait; confirm the pill flips to **Ready** within the polling window (no manual refresh).
5. Expand it: confirm the embedded player loads, and the five tabs (Summary default, Study, AI Transcript, Key Concepts, Raw Transcript) render the expected content.
6. Edit the title (pencil), confirm it persists after a refresh.
7. Submit an invalid URL; confirm the inline "Enter a valid YouTube URL." error and that no row is created.
8. Optionally submit a captionless video; confirm the row goes to **Error** with a Retry button.
9. Open the search drawer (search FAB), expand a term, click **Research**; confirm the Video Research tab also appears there (cyan accent).

- [ ] **Step 6: Commit**

```bash
git add components/ResearchTabs.tsx
git commit -m "feat: add Video Research tab to ResearchTabs"
```

---

## Self-Review Notes

- **Spec coverage:** placement as 3rd ResearchTabs tab (Task 7); per-term `video_research` table + RLS (Task 1); youtubei.js transcript + oEmbed title, serverless-safe (Task 2); OpenAI summary/takeaways/concepts/formatted-transcript with chunking (Task 3); immediate-insert + `after()` background fill + retry (Task 4); accordion with lazy iframe, editable title, 5 tabs (Task 5); polling list + submit (Task 6). Self-contained concepts — no Terms coupling (confirmed; no such code). Migration committed, not applied (Task 1, Global Constraints).
- **Type consistency:** `VideoResearch`, `VideoKeyConcept` defined in Task 1 and consumed unchanged in Tasks 4–6. Action names (`listVideoResearch`, `submitVideoResearch`, `updateVideoResearchTitle`, `removeVideoResearch`, `retryVideoResearch`) defined in Task 4 and consumed in Tasks 5–6. openai function names defined in Task 3 and consumed in Task 4.
- **No test runner:** TDD steps intentionally replaced by `tsc` + `eslint` + `build` + manual run, per Global Constraints.
- **Risk:** youtubei.js's transcript object path may differ across versions — Task 2 Step 3 instructs adjusting the optional-chained access while preserving guards and the error message.
