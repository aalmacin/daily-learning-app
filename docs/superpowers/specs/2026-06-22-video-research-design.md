# Video Research — Design

**Date:** 2026-06-22

## Overview

Add **Video Research** as a third tab inside the term's Research section, alongside
*Ask AI* and *My Notes* in the existing `ResearchTabs` component. While researching a
term, the user pastes a YouTube URL; the app extracts the video's transcript and uses
OpenAI to generate study material. Each extracted video appears as a collapsed
accordion (heading = editable video title) in a per-term list. Expanding a video embeds
the player and shows five tabs of generated content.

Because `ResearchTabs` is reused, the Video Research tab appears in **both** the term
detail page (`/terms/[id]`, zinc accent) and the search drawer's per-term Research panel
(`TermSearchResults`, cyan accent). Videos are scoped to the term being researched.

This is the YouTube extraction capability from the `ytdlp/concept-miner` skill, ported
to run inside this app with **OpenAI** instead of Claude, and made **serverless-safe**
(no `yt-dlp` binary).

## Decisions (confirmed)

- **Placement:** third tab in `ResearchTabs` ("Video Research"). Videos tied to `term_id`.
- **Transcript source:** pure-JS library (`youtubei.js`) over HTTP — works on Vercel/serverless. No binary.
- **Title source:** YouTube oEmbed endpoint (simple HTTP GET).
- **Runtime target:** deployed (Vercel/serverless). No spawned binaries anywhere.
- **Submit UX:** row appears immediately as `Processing`; AI fills it in via Next.js `after()`. List polls while any row is processing.
- **Key Concepts:** self-contained to the video. No coupling to the Terms database.
- **AI model:** `gpt-5.4-mini` via the existing OpenAI client in `lib/openai.ts`.
- **Implementation style:** subagent-driven (per project CLAUDE.md).

## Architecture

```
components/ResearchTabs.tsx          extend: add "Video Research" tab (3rd)
components/VideoResearchPanel.tsx    NEW: submit form + accordion list (client, React Query)
components/VideoResearchItem.tsx     NEW: one accordion (lazy iframe, title edit, inner tabs)
actions/videoResearch.ts             NEW: submit / list / updateTitle / delete / retry
lib/youtube.ts                       NEW: parseVideoId, fetchVideoTitle (oEmbed), fetchTranscript (youtubei.js)
lib/openai.ts                        extend: summarize / keyTakeaways / keyConcepts / formatTranscript
lib/db.ts                            extend: video_research CRUD + types
supabase/migrations/<ts>_video_research.sql   NEW: table + RLS (user applies — we do not run supabase)
```

`youtubei.js` is added as a dependency. The accent prop already threads through
`ResearchTabs`, so both call sites get the new tab for free.

## Data model — `video_research`

| column           | type        | notes                                            |
|------------------|-------------|--------------------------------------------------|
| id               | bigint pk   |                                                  |
| user_id          | uuid        | RLS scope, matches other tables                  |
| term_id          | bigint fk   | references `terms(id)`, cascade delete           |
| youtube_url      | text        | as submitted                                     |
| video_id         | text        | parsed 11-char id                                |
| title            | text        | from oEmbed; user-editable                       |
| status           | text        | `'processing' \| 'ready' \| 'error'`             |
| error            | text null   | message when status = error                      |
| raw_transcript   | text null   | original captions                                |
| ai_transcript    | text null   | corrected/punctuated                             |
| summary          | text null   | concise TLDR                                     |
| key_takeaways    | jsonb       | `string[]`                                       |
| key_concepts     | jsonb       | `{ concept: string; definition: string }[]`      |
| created_at       | timestamptz | default now()                                    |
| updated_at       | timestamptz |                                                  |

RLS: row owner = `user_id`, mirroring existing tables. Migration SQL is committed; the
user applies it (we never run supabase commands).

## Processing pipeline

`submitVideoResearch(termId, url)`:
1. Parse `video_id` from the URL. Invalid → throw (surfaced inline at the form, no row created).
2. Fetch title via oEmbed (fallback title = the URL if oEmbed fails).
3. Insert row `status='processing'`; return it so the accordion appears immediately.
4. Schedule `processVideoResearch(id)` with Next.js `after()` so it runs past the response.

`processVideoResearch(id)`:
1. Fetch captions via `youtubei.js` → `raw_transcript`. No captions → `status='error'`, error = "No transcript available for this video."
2. Run in parallel: `summary`, `key_takeaways[]`, `key_concepts[]`. Separately: `ai_transcript` (formatted). **Long transcripts are chunked** for the formatting call and concatenated, so we don't exceed the output-token cap.
3. On success → `status='ready'`. Any throw → `status='error'` with the message.

Client list (`VideoResearchPanel`) loads via React Query and **polls (~3s) while any row is
`processing`**, stopping once all rows are `ready`/`error`. An `error` row shows a **Retry**
button that re-runs `processVideoResearch`.

## UI — the accordion (expanded)

- Responsive 16:9 `youtube.com/embed/<video_id>` iframe, **rendered only when expanded**
  (lazy) so a list of videos doesn't load every player at once.
- Inline title edit (pencil) → `updateVideoTitle`.
- Five tabs (styled like the existing inner tabs, accent inherited from `ResearchTabs`):
  1. **Summary** (default) — concise TLDR.
  2. **Study** — composite of Summary + Key Takeaways (list) + Key Concepts (table). Read-only, reuses existing data.
  3. **AI Transcript** — formatted transcript.
  4. **Key Concepts** — concept/definition table.
  5. **Raw Transcript** — original captions, monospace.

## OpenAI functions (in `lib/openai.ts`)

Mirror the existing pattern (`gpt-5.4-mini`, JSON response_format where structured):

- `summarizeVideo(transcript) -> string` — concise TLDR for learning.
- `extractKeyTakeaways(transcript) -> string[]`.
- `extractKeyConcepts(transcript) -> { concept, definition }[]` — ranked by importance (the concept-miner CSV shape).
- `formatTranscript(rawTranscript) -> string` — fix mis-transcriptions, punctuation, paragraphs; **no** summarizing or headings (stays a faithful transcript). Chunked for long input.

All validate response shape and throw on malformed output, consistent with existing functions.

## Error handling

- Invalid/unparseable URL → rejected at submit, inline error, no row.
- No captions → `status='error'` with a clear message + Retry.
- AI/transcript failure → `status='error'` with the thrown message + Retry.
- `after()` exceeding the function lifetime leaves the row `processing`; Retry recovers it.

## Next.js 16 compliance

Per `AGENTS.md`, the implementation plan will **read the bundled guides in
`node_modules/next/dist/docs/` for `after()`, Server Actions, and `revalidate`/cache
behavior before writing code**, and follow any deprecation notices there.

## Testing & verification

The repo has no unit-test runner today. Verification = `tsc` (no type errors — types are
mandatory, never ignored), `eslint`, `next build`, and manual run on `localhost:5023`
against a real YouTube URL. Unit tests are added only for pure helpers (`parseVideoId`,
response parsing) **if** we decide to introduce a runner — otherwise out of scope for v1.

## Out of scope (YAGNI)

- Global video library (videos stay per-term).
- Linking mined concepts into the Terms database.
- Whisper/audio transcription fallback for caption-less videos.
- Editing generated content (summary/concepts/transcript) beyond the title.
