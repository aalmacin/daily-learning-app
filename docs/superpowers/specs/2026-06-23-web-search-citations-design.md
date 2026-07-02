# Web Search + Citations Design

## Goal

Let the two user-facing OpenAI calls — `explainTermWithAI` and `chatAboutTerm` — use OpenAI's hosted web search so newer concepts (outside the model's training knowledge) are captured. Surface every source found in a new **Citations** tab under a term's research panel.

## Behavior

- The model decides when to search: prompts instruct it to use web search when uncertain or when the concept may be newer than its knowledge. No hard confidence threshold (the API has none).
- Citations live at the **term** level: one flat list per term, aggregated and deduplicated by URL.
- Citations accumulate over the term's life. Every explanation (including regeneration) and every chat answer contributes any new unique URLs. Nothing is ever removed by regeneration.
- Each citation stores: URL, title, snippet (the cited text span).

## Data model & migration

New table `term_citations`:

```sql
CREATE TABLE IF NOT EXISTS term_citations (
  id SERIAL PRIMARY KEY,
  term_id INTEGER NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  snippet TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (term_id, url)
);

ALTER TABLE term_citations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "term_citations_owner" ON term_citations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM terms t
      WHERE t.id = term_citations.term_id
      AND t.user_id = auth.uid()
    )
  );
```

Dedup + accumulation are enforced by `UNIQUE (term_id, url)` together with insert-on-conflict-do-nothing.

**Constraint:** Supabase commands are not run by the assistant. The migration file is written into `supabase/migrations/`, but the user applies it before the feature works end-to-end.

## OpenAI layer (`lib/openai.ts`)

- Switch `chatAboutTerm` and `explainTermWithAI` from `chat.completions.create` to the Responses API with the hosted `web_search` tool.
- Prompts gain a line instructing the model to search the web when uncertain or when the concept may be newer than its knowledge.
- New type: `Citation = { url: string; title: string; snippet: string }`.
- Shared helper `extractCitations(response)`: reads `url_citation` annotations (url + title) and uses the annotated text span as the snippet. Deduplicates by URL within a single response.
- `chatAboutTerm` returns `{ answer: string; citations: Citation[] }` (was `string`).
- `explainTermWithAI` returns `TermExplanation & { citations: Citation[] }`. Structured JSON output is preserved via the Responses API's `json_schema` text format alongside the `web_search` tool.
- Model stays `gpt-5.4-mini`.

## Server actions & persistence

- `lib/db.ts`:
  - `TermCitation = { id; term_id; url; title; snippet; created_at }`.
  - `getCitationsByTermId(termId)` — ordered list for a term.
  - `insertTermCitations(termId, citations[])` — bulk insert with `ON CONFLICT (term_id, url) DO NOTHING`.
- `actions/explain.ts` (`explainTerm`): after the AI call, persist returned citations to the new term.
- `actions/terms.ts` (`regenerateTerm`): after the AI call, persist returned citations to the term (accumulates).
- `actions/chat.ts` (`askQuestion`): resolves `refinement -> term`, persists chat citations to that term. Return value gains the updated citation list so the UI refreshes without an extra round trip.
- New action `getTermCitations(termId)` for the tab's initial load.

## UI — Citations tab

- `ResearchTabs.tsx`: add a third tab ("Ask AI" · "My Notes" · "Citations").
- New `CitationsList` component: each citation renders as a clickable title linking to its URL, with the snippet beneath. Empty state when a term has no citations.
- The Citations tab fetches via `getTermCitations` on first open and refetches after a chat send (asking a question can add new sources).
- Applied in both `TermDetailPage` and `TermSearchResults`, which already consume `ResearchTabs`.

## Out of scope

- Web search for the evaluator calls (`evaluatePreRefinement`, `evaluateRefinement`).
- Citation editing/deletion by the user.
- Surfacing citations in Notion sync.

## Addendum (2026-07-01): force-web toggle

The initial version left search entirely to the model's discretion (`web_search` tool attached, model decides). In practice the model often declined to search even when it should (e.g. "Claude Fable"). Added a user-controlled "Search the web" toggle:

- Mechanism: the toggle sets `tool_choice` on the Responses call — `'required'` (forces the model to call a tool; `web_search` is the only one attached, so it must search) when on, `'auto'` (original behavior) when off.
- Threaded UI → action → lib via a `forceWeb`/`useWeb` flag defaulting to `false` (backward compatible).
- Off keeps `'auto'`: the tool stays attached and the model may still search on its own, so citations can still appear.
- Controls default OFF and appear on the explain form (single + multiple), the regenerate action, and the Ask AI chat (both the detail page and search-result panels).
- Note: `web_search` is not forcible by name via `tool_choice` (only `web_search_preview` is in the SDK enum), so `'required'` is used — valid because `web_search` is the sole attached tool.

See plan: `docs/superpowers/plans/2026-07-01-force-web-search-toggle.md`.
