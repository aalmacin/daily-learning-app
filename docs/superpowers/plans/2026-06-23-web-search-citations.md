# Web Search + Citations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `explainTermWithAI` and `chatAboutTerm` OpenAI web search so newer concepts are captured, and surface every source in a new per-term Citations tab.

**Architecture:** Switch the two user-facing OpenAI calls from `chat.completions.create` to the Responses API with the hosted `web_search` tool. URL citations are extracted from response annotations, persisted at the term level (deduped by URL, accumulating forever) in a new `term_citations` table, and shown in a third tab on `ResearchTabs` that refetches each time it is opened.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, `openai@6.33.0` (Responses API), Supabase (service-role client in `lib/db.ts`), Tailwind.

## Global Constraints

- Always use types; never use `any`-suppression or ignore types. (existing code uses `as unknown as never` casts for Supabase writes — match that exact pattern, do not introduce `any`)
- Model stays `gpt-5.4-mini`.
- The assistant does NOT run supabase commands. The migration file is created in this plan; the USER applies it manually before the feature works end-to-end.
- No test runner exists in this repo (scripts are only `lint` and `build`). Verification gates are: `npx tsc --noEmit` (typecheck), `npm run lint`, and where noted `npm run build`. Do NOT add a test framework.
- Never commit secrets; never read `.env`.
- Citations are deduped by URL per term and accumulate (regeneration never removes them).
- Citation record = `{ url, title, snippet }`; snippet is the cited text span from the model's answer.

---

### Task 1: `term_citations` table + DB layer

**Files:**
- Create: `supabase/migrations/20260623000000_term_citations.sql`
- Modify: `lib/db.ts` (add type + two functions near the other citation/chat helpers, after `insertChatMessages` ending at `lib/db.ts:627`)

**Interfaces:**
- Produces:
  - `type TermCitation = { id: number; term_id: number; url: string; title: string; snippet: string; created_at: string }`
  - `getCitationsByTermId(termId: number): Promise<TermCitation[]>`
  - `insertTermCitations(termId: number, citations: Array<{ url: string; title: string; snippet: string }>): Promise<void>`

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260623000000_term_citations.sql` (mirrors the RLS shape of `20260419000001_research_chats.sql`):

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

- [ ] **Step 2: Add the type and read helper to `lib/db.ts`**

Insert after `insertChatMessages` (after `lib/db.ts:627`). The read helper mirrors `getChatsByRefinementId` (`lib/db.ts:592`):

```ts
export type TermCitation = {
  id: number;
  term_id: number;
  url: string;
  title: string;
  snippet: string;
  created_at: string;
};

export async function getCitationsByTermId(termId: number): Promise<TermCitation[]> {
  const { data, error } = await getSupabase()
    .from('term_citations')
    .select('*')
    .eq('term_id', termId)
    .order('id', { ascending: true });
  if (error) throw error;
  return data as TermCitation[];
}
```

- [ ] **Step 3: Add the bulk insert helper to `lib/db.ts`**

Insert directly below `getCitationsByTermId`. Uses `upsert` with `ignoreDuplicates` so the `UNIQUE (term_id, url)` constraint makes re-inserting an existing URL a no-op (accumulation semantics):

```ts
export async function insertTermCitations(
  termId: number,
  citations: Array<{ url: string; title: string; snippet: string }>,
): Promise<void> {
  if (citations.length === 0) return;
  const rows = citations.map((c) => ({
    term_id: termId,
    url: c.url,
    title: c.title,
    snippet: c.snippet,
  }));
  const { error } = await getSupabase()
    .from('term_citations')
    .upsert(rows as unknown as never, { onConflict: 'term_id,url', ignoreDuplicates: true });
  if (error) throw error;
}
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS (no errors). If `tsc` is not a script, this invokes the local TypeScript compiler directly.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260623000000_term_citations.sql lib/db.ts
git commit -m "feat: add term_citations table and db helpers"
```

---

### Task 2: OpenAI web search + citation extraction (`lib/openai.ts`)

**Files:**
- Modify: `lib/openai.ts` (convert `chatAboutTerm` at `lib/openai.ts:132` and `explainTermWithAI` at `lib/openai.ts:152`; update prompts at `lib/openai.ts:11` and `lib/openai.ts:127`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `type Citation = { url: string; title: string; snippet: string }`
  - `chatAboutTerm(...)` return type changes from `Promise<string>` to `Promise<{ answer: string; citations: Citation[] }>`
  - `explainTermWithAI(...)` return type changes from `Promise<TermExplanation>` to `Promise<TermExplanation & { citations: Citation[] }>`

- [ ] **Step 1: Add the `Citation` type and `extractCitations` helper**

Add near the top of `lib/openai.ts`, after the `import OpenAI from 'openai';` line and the `client` definition (`lib/openai.ts:9`):

```ts
export type Citation = { url: string; title: string; snippet: string };

function extractCitations(response: OpenAI.Responses.Response): Citation[] {
  const byUrl = new Map<string, Citation>();
  for (const item of response.output) {
    if (item.type !== 'message') continue;
    for (const part of item.content) {
      if (part.type !== 'output_text') continue;
      for (const ann of part.annotations) {
        if (ann.type !== 'url_citation') continue;
        if (byUrl.has(ann.url)) continue;
        const snippet = part.text.slice(ann.start_index, ann.end_index).trim();
        byUrl.set(ann.url, { url: ann.url, title: ann.title, snippet });
      }
    }
  }
  return [...byUrl.values()];
}
```

- [ ] **Step 2: Add the web-search instruction to both prompts**

In `buildSystemPrompt` (`lib/openai.ts:11`), append this sentence to the returned string, before the final `Respond ONLY with valid JSON...` line:

```
Use web search to verify facts and to capture concepts that may be newer than your training knowledge whenever you are uncertain.
```

In `CHAT_SYSTEM_PROMPT` (`lib/openai.ts:127`), append to the template literal:

```
Use web search to answer accurately when you are uncertain or when the information may be newer than your training knowledge.
```

- [ ] **Step 3: Convert `chatAboutTerm` to the Responses API**

Replace the body of `chatAboutTerm` (`lib/openai.ts:132-150`). Signature gains a new return type:

```ts
export async function chatAboutTerm(
  termName: string,
  termContent: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  question: string,
): Promise<{ answer: string; citations: Citation[] }> {
  const response = await client.responses.create({
    model: 'gpt-5.4-mini',
    tools: [{ type: 'web_search' }],
    input: [
      { role: 'system', content: CHAT_SYSTEM_PROMPT(termName, termContent) },
      ...history,
      { role: 'user', content: question },
    ],
  });

  const answer = response.output_text;
  if (!answer) throw new Error('Empty response from OpenAI');
  return { answer, citations: extractCitations(response) };
}
```

- [ ] **Step 4: Convert `explainTermWithAI` to the Responses API with structured output**

Replace the body of `explainTermWithAI` (`lib/openai.ts:152-185`). Keep the existing category-filtering logic verbatim; only the API call and the return shape change:

```ts
export async function explainTermWithAI(term: string, allowedCategories: string[], context?: string): Promise<TermExplanation & { citations: Citation[] }> {
  const userContent = context ? `Term: ${term}\nContext: ${context}` : term;
  const response = await client.responses.create({
    model: 'gpt-5.4-mini',
    tools: [{ type: 'web_search' }],
    input: [
      { role: 'system', content: buildSystemPrompt(allowedCategories) },
      { role: 'user', content: userContent },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'term_explanation',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            content: { type: 'string' },
            categories: { type: 'array', items: { type: 'string' } },
          },
          required: ['name', 'content', 'categories'],
        },
      },
    },
  });

  const raw = response.output_text;
  if (!raw) throw new Error('Empty response from OpenAI');

  const parsed = JSON.parse(raw) as Partial<TermExplanation>;

  if (
    typeof parsed.name !== 'string' ||
    typeof parsed.content !== 'string' ||
    !Array.isArray(parsed.categories) ||
    !parsed.categories.every((c) => typeof c === 'string')
  ) {
    throw new Error('Invalid response shape from OpenAI');
  }

  const categories = (parsed.categories as string[]).filter((c) => allowedCategories.includes(c));
  const specificCategories = categories.filter((c) => c !== 'Uncategorized');

  return {
    name: parsed.name,
    content: parsed.content,
    categories: specificCategories.length > 0 ? specificCategories : ['Uncategorized'],
    citations: extractCitations(response),
  };
}
```

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: FAIL in `actions/chat.ts` only — `chatAboutTerm` now returns an object, so `const answer = await chatAboutTerm(...)` is a type error there. That call site is fixed in Task 3. `lib/openai.ts` itself must report no errors. If `lib/openai.ts` has errors, fix them before continuing.

- [ ] **Step 6: Commit**

```bash
git add lib/openai.ts
git commit -m "feat: use OpenAI web search and extract citations"
```

---

### Task 3: Persist citations in server actions

**Files:**
- Create: `actions/citations.ts`
- Modify: `actions/chat.ts` (`askQuestion` at `actions/chat.ts:6`)
- Modify: `actions/explain.ts` (`explainTerm` at `actions/explain.ts:21`)
- Modify: `actions/terms.ts` (`regenerateTerm` at `actions/terms.ts:74`)

**Interfaces:**
- Consumes: `insertTermCitations`, `getCitationsByTermId`, `TermCitation` (Task 1); `chatAboutTerm` returning `{ answer, citations }` and `explainTermWithAI` returning `... & { citations }` (Task 2).
- Produces: `getTermCitations(termId: number): Promise<TermCitation[]>` (used by Task 4).

- [ ] **Step 1: Create the read action `actions/citations.ts`**

```ts
'use server';

import { getCitationsByTermId, type TermCitation } from '@/lib/db';

export async function getTermCitations(termId: number): Promise<TermCitation[]> {
  return getCitationsByTermId(termId);
}
```

- [ ] **Step 2: Fix and extend `askQuestion` in `actions/chat.ts`**

Update the import on `actions/chat.ts:3` to add `insertTermCitations`, and the `chatAboutTerm` usage on `actions/chat.ts:18-23`. The full updated `askQuestion` body:

```ts
export async function askQuestion(
  refinementId: number,
  question: string,
): Promise<ChatMessage[]> {
  const refinement = await getRefinementById(refinementId);
  if (!refinement) throw new Error('Refinement not found');

  const term = await getTermById(refinement.term_id);
  if (!term) throw new Error('Term not found');

  const history = await getChatsByRefinementId(refinementId);

  const { answer, citations } = await chatAboutTerm(
    term.name,
    term.content,
    history.map(({ role, content }) => ({ role, content })),
    question,
  );

  await insertChatMessages([
    { refinement_id: refinementId, role: 'user', content: question },
    { refinement_id: refinementId, role: 'assistant', content: answer },
  ]);

  await insertTermCitations(term.id, citations);

  return getChatsByRefinementId(refinementId);
}
```

Update the import line `actions/chat.ts:3` so it reads:

```ts
import { getChatsByRefinementId, getRefinementById, getRefinementsByTermId, getTermById, insertChatMessages, insertTermCitations, type ChatMessage } from '@/lib/db';
```

- [ ] **Step 3: Persist explanation citations in `explainTerm` (`actions/explain.ts`)**

Add `insertTermCitations` to the import from `@/lib/db` on `actions/explain.ts:3`. After the term is successfully inserted (immediately after the `try/catch` block that sets `term`, i.e. after `actions/explain.ts:57`, before the `const settings = ...` line on `actions/explain.ts:58`), add:

```ts
  await insertTermCitations(term.id, explanation.citations);
```

The import line becomes:

```ts
import { getTerm, insertTerm, updateTerm, deleteTerm, getAllCategories, getUserSettings, insertTermCitations } from '@/lib/db';
```

- [ ] **Step 4: Persist regeneration citations in `regenerateTerm` (`actions/terms.ts`)**

Add `insertTermCitations` to the import from `@/lib/db` on `actions/terms.ts:3`. After `if (!updated) throw new Error('Term not found');` (`actions/terms.ts:85`), add:

```ts
  await insertTermCitations(updated.id, explanation.citations);
```

The import line becomes:

```ts
import { deleteTerm as dbDeleteTerm, getAllCategories, getAllTerms, getTermById, getTermsPaginated, getUserSettings, insertTermCitations, updateTerm } from '@/lib/db';
```

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS. The Task 2 error in `actions/chat.ts` is now resolved.

- [ ] **Step 6: Commit**

```bash
git add actions/citations.ts actions/chat.ts actions/explain.ts actions/terms.ts
git commit -m "feat: persist web search citations per term"
```

---

### Task 4: Citations tab UI

**Files:**
- Create: `components/CitationsList.tsx`
- Modify: `components/ResearchTabs.tsx` (add third tab)

**Interfaces:**
- Consumes: `getTermCitations` (Task 3), `TermCitation` (Task 1).
- Produces: a `Citations` tab inside `ResearchTabs`; no new exported interface for later tasks.

- [ ] **Step 1: Create `components/CitationsList.tsx`**

Fetches on mount, so mounting it fresh each time the tab opens (Step 2) gives a refetch. Empty and loading states included:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { getTermCitations } from '@/actions/citations';
import type { TermCitation } from '@/lib/db';

export function CitationsList({ termId }: { termId: number }) {
  const [citations, setCitations] = useState<TermCitation[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTermCitations(termId)
      .then((data) => {
        if (!cancelled) setCitations(data);
      })
      .catch(() => {
        if (!cancelled) setCitations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [termId]);

  if (citations === null) {
    return <p className="px-1 py-2 text-xs text-zinc-400 dark:text-zinc-500">Loading…</p>;
  }

  if (citations.length === 0) {
    return <p className="px-1 py-2 text-xs text-zinc-400 dark:text-zinc-500">No web sources cited yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-2 px-1 py-1 max-h-64 overflow-y-auto">
      {citations.map((c) => (
        <li key={c.id} className="text-xs">
          <a
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-cyan-700 dark:text-cyan-300 hover:underline break-words"
          >
            {c.title || c.url}
          </a>
          {c.snippet && (
            <p className="mt-0.5 text-zinc-500 dark:text-zinc-400 leading-relaxed">{c.snippet}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Add the Citations tab to `components/ResearchTabs.tsx`**

Change the tab state union, add an icon, a tab button, and conditionally render `CitationsList` (conditional render — not `hidden` class — so it remounts and refetches on each open). Full updated file:

```tsx
'use client';

import { useState, type ReactNode } from 'react';
import { NoteEditor } from './NoteEditor';
import { CitationsList } from './CitationsList';

type Accent = 'zinc' | 'cyan';

type Props = {
  termId: number;
  initialMarkdown: string | null;
  chat: ReactNode;
  accent?: Accent;
};

const ICON_ASK = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const ICON_NOTE = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z" />
  </svg>
);

const ICON_CITATION = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

type Tab = 'ask' | 'notes' | 'citations';

export function ResearchTabs({ termId, initialMarkdown, chat, accent = 'zinc' }: Props) {
  const [tab, setTab] = useState<Tab>('ask');

  const activeClass =
    accent === 'cyan'
      ? 'text-cyan-700 dark:text-cyan-300 border-cyan-500 dark:border-cyan-600'
      : 'text-zinc-900 dark:text-zinc-50 border-zinc-900 dark:border-zinc-50';

  const tabClass = (active: boolean) =>
    `flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
      active ? activeClass : 'text-zinc-400 dark:text-zinc-500 border-transparent hover:text-zinc-600 dark:hover:text-zinc-300'
    }`;

  return (
    <div>
      <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-700 px-1">
        <button type="button" className={tabClass(tab === 'ask')} onClick={() => setTab('ask')}>
          {ICON_ASK} Ask AI
        </button>
        <button type="button" className={tabClass(tab === 'notes')} onClick={() => setTab('notes')}>
          {ICON_NOTE} My Notes
        </button>
        <button type="button" className={tabClass(tab === 'citations')} onClick={() => setTab('citations')}>
          {ICON_CITATION} Citations
        </button>
      </div>
      <div className="pt-3">
        <div className={tab === 'ask' ? '' : 'hidden'}>{chat}</div>
        <div className={tab === 'notes' ? '' : 'hidden'}>
          <NoteEditor termId={termId} initialMarkdown={initialMarkdown} />
        </div>
        {tab === 'citations' && <CitationsList termId={termId} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/CitationsList.tsx components/ResearchTabs.tsx
git commit -m "feat: add Citations tab to research panel"
```

---

## Manual verification (after the user applies the migration)

The assistant cannot run supabase commands. After the user runs the migration (`supabase db push` or their normal flow), perform a runtime smoke test with `npm run dev` (port 5023):

1. Explain a brand-new/very recent technical term. Confirm the term saves and that opening its research panel → **Citations** tab lists web sources with clickable titles and snippets.
2. Open the **Ask AI** tab, ask a question whose answer needs current info, then switch to **Citations** — the new sources from that answer appear (tab refetches on open).
3. Regenerate the term and confirm citations accumulate (previous URLs remain, new unique ones added; no duplicates).

## Spec coverage check

- Web search on `explainTermWithAI` + `chatAboutTerm` → Task 2.
- `term_citations` table + RLS + dedup → Task 1.
- Accumulate / dedup-by-URL semantics → Task 1 (UNIQUE + ignoreDuplicates), persistence wired in Task 3.
- Persist from explain, regenerate, chat → Task 3.
- Citations tab UI with url/title/snippet, empty state, refetch on open → Task 4.
- Out of scope (evaluators, citation editing, Notion sync) → untouched.
