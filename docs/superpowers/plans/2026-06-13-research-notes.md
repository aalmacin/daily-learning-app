# Research Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a rich-text (WYSIWYG) per-term notes editor to the Research step, presented as tabs (Ask AI | My Notes) on both the term detail page and the expanded search-result card, with notes persisted as markdown and included in Notion export.

**Architecture:** Notes are term-level, stored in a new `terms.notes` markdown column. A Tiptap-based `NoteEditor` serializes to/from markdown. A `ResearchTabs` wrapper renders the existing chat (passed as a slot, untouched) and the editor as two tabs. A `saveTermNote` server action persists via the existing `updateTerm`. The existing Notion append path gains a "My Notes" section.

**Tech Stack:** Next.js (App Router, custom build — read `node_modules/next/dist/docs/` before coding), Supabase, Tiptap (`@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-underline`, `@tiptap/extension-link`, `tiptap-markdown`), `react-markdown`.

**Testing note:** This repo has no test runner. Each task is verified with `npx tsc --noEmit` (types), `npm run lint`, and where relevant `npm run build`, plus a manual browser check at the end. Do NOT add a test framework.

**Commit policy:** The repo owner commits manually. Do NOT run `git commit` in any task. "Verify" steps replace the usual commit step.

---

### Task 1: Add `notes` column to the schema and types

**Files:**
- Create: `supabase/migrations/20260613000000_add_term_notes.sql`
- Modify: `lib/db.ts` (Term type ~line 14-30; `updateTerm` ~line 358-401; `getTermById` select ~line 443-445)

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260613000000_add_term_notes.sql
ALTER TABLE terms ADD COLUMN notes TEXT;
```

Do NOT run any supabase command (repo rule). The owner applies migrations.

- [ ] **Step 2: Add `notes` to the `Term` type**

In `lib/db.ts`, inside `export type Term = { ... }` (after `notion_date: string | null;`), add:

```ts
  notes: string | null;
```

`TermRow` is `Omit<Term, ...>` and does not omit `notes`, so it inherits the field automatically — no change needed there.

- [ ] **Step 3: Handle `notes` in `updateTerm`**

In `lib/db.ts` `updateTerm`, after the `priority` line (`if (updates.priority !== undefined) fields.priority = updates.priority;`), add:

```ts
  if (updates.notes !== undefined) fields.notes = updates.notes;
```

- [ ] **Step 4: Add `notes` to the `getTermById` explicit select**

In `lib/db.ts` `getTermById`, the `.select('id, name, content, ... notion_date, term_categories(...), concept_refinements!left(id)')` string omits `notes`. Add `notes` to the column list, e.g. after `notion_date,`:

```
'id, name, content, created_at, updated_at, notion_page_id, notion_last_edited, last_synced_at, priority, daily_learning_done, notion_date, notes, term_categories(categories(name)), concept_refinements!left(id)'
```

(`getAllTerms` and search use `select('*')`, so they pick up `notes` with no change.)

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors. If `getTermById`'s mapped return object is built field-by-field rather than spreading `...row`, also add `notes: data.notes` there — inspect the return statement after the select to confirm `notes` is carried.

---

### Task 2: Install Tiptap dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install**

Run:
```bash
npm install @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-underline @tiptap/extension-link tiptap-markdown
```

- [ ] **Step 2: Verify install + build still works**

Run: `npx tsc --noEmit && npm run lint`
Expected: passes. Confirm the packages appear in `package.json` dependencies.

---

### Task 3: `saveTermNote` server action

**Files:**
- Create: `actions/notes.ts`

- [ ] **Step 1: Write the action**

```ts
// actions/notes.ts
'use server';

import { revalidatePath } from 'next/cache';
import { updateTerm } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function saveTermNote(termId: number, markdown: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  await updateTerm(termId, { notes: markdown });

  revalidatePath(`/terms/${termId}`);
  revalidatePath('/terms');
}
```

Confirm `getCurrentUser` is exported from `@/lib/auth` (it is used the same way in `actions/notion.ts` and `actions/refinements.ts`). If `updateTerm`'s `updates` type does not yet permit `notes`, Task 1 Step 3 covers it — re-check.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: passes.

---

### Task 4: `NoteEditor` component (Tiptap WYSIWYG ↔ markdown)

**Files:**
- Create: `components/NoteEditor.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/NoteEditor.tsx
'use client';

import { useState, useTransition } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { Markdown } from 'tiptap-markdown';
import { saveTermNote } from '@/actions/notes';

type Props = {
  termId: number;
  initialMarkdown: string | null;
};

function ToolbarButton({
  onClick,
  active,
  label,
  title,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`px-2 h-7 min-w-7 flex items-center justify-center rounded-md text-xs transition-colors ${
        active
          ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50'
          : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
      }`}
    >
      {label}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const setLink = () => {
    const url = window.prompt('Link URL');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 border border-b-0 border-zinc-200 dark:border-zinc-700 rounded-t-lg px-1.5 py-1 bg-zinc-50 dark:bg-zinc-900">
      <ToolbarButton title="Bold" label="B" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
      <ToolbarButton title="Italic" label="I" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
      <ToolbarButton title="Underline" label="U" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} />
      <span className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />
      <ToolbarButton title="Heading" label="H" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
      <ToolbarButton title="Quote" label="❝" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
      <span className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />
      <ToolbarButton title="Bullet list" label="•" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
      <ToolbarButton title="Numbered list" label="1." active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
      <span className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />
      <ToolbarButton title="Link" label="🔗" active={editor.isActive('link')} onClick={setLink} />
      <ToolbarButton title="Inline code" label="⌗" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} />
    </div>
  );
}

export function NoteEditor({ termId, initialMarkdown }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      Markdown,
    ],
    content: initialMarkdown ?? '',
    editorProps: {
      attributes: {
        class:
          'prose prose-sm dark:prose-invert max-w-none min-h-[80px] px-3 py-2 focus:outline-none text-zinc-800 dark:text-zinc-200',
      },
    },
  });

  if (!editor) return null;

  const handleSave = () => {
    setError(null);
    const markdown = editor.storage.markdown.getMarkdown();
    startTransition(async () => {
      try {
        await saveTermNote(termId, markdown);
        setSavedAt('just now');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save note');
      }
    });
  };

  return (
    <div className="space-y-2">
      <div>
        <Toolbar editor={editor} />
        <div className="border border-zinc-200 dark:border-zinc-700 rounded-b-lg bg-white dark:bg-zinc-950">
          <EditorContent editor={editor} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        {error && <p className="text-xs text-red-600 dark:text-red-400 flex-1">{error}</p>}
        {!error && savedAt && (
          <p className="text-xs text-zinc-400 dark:text-zinc-500 flex-1">Saved · {savedAt}</p>
        )}
        {!error && !savedAt && <span className="flex-1" />}
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: passes. If `tiptap-markdown`'s `editor.storage.markdown` is untyped and `tsc` complains, narrow with a local type assertion: `(editor.storage as { markdown: { getMarkdown(): string } }).markdown.getMarkdown()` — do NOT use `any`.

---

### Task 5: `ResearchTabs` wrapper component

**Files:**
- Create: `components/ResearchTabs.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/ResearchTabs.tsx
'use client';

import { useState, type ReactNode } from 'react';
import { NoteEditor } from './NoteEditor';

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

export function ResearchTabs({ termId, initialMarkdown, chat, accent = 'zinc' }: Props) {
  const [tab, setTab] = useState<'ask' | 'notes'>('ask');

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
      </div>
      <div className="pt-3">
        <div className={tab === 'ask' ? '' : 'hidden'}>{chat}</div>
        <div className={tab === 'notes' ? '' : 'hidden'}>
          <NoteEditor termId={termId} initialMarkdown={initialMarkdown} />
        </div>
      </div>
    </div>
  );
}
```

Note: both panes are always mounted (`hidden` toggles visibility) so the AI chat keeps its in-progress state when switching tabs.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: passes.

---

### Task 6: Wire `ResearchTabs` into the search-result card

**Files:**
- Modify: `components/TermSearchResults.tsx` (`ResearchChat` 32-106; `TermCard` 108-196)

- [ ] **Step 1: Make `ResearchChat` render only the chat body (no outer Research chrome)**

The current `ResearchChat` returns a bordered box with a "Research" header. `ResearchTabs` now owns that chrome. Change `ResearchChat`'s returned wrapper to render just the messages + form, without the outer border and the "Research" header `div`. Keep all chat logic (`useState`, `handleSubmit`, transitions) unchanged. The returned JSX becomes:

```tsx
  return (
    <div>
      {chat && chat.messages.length > 0 && (
        <div className="px-1 py-1 flex flex-col gap-2 max-h-64 overflow-y-auto">
          {chat.messages.map((msg) => (
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
          aria-label={`Ask a question about ${term.name}`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Ask about ${term.name}…`}
          disabled={isPending}
          className="flex-1 px-2.5 py-1.5 text-xs border border-zinc-200 dark:border-zinc-700 rounded-md bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!input.trim() || isPending}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? '…' : 'Ask'}
        </button>
      </form>
    </div>
  );
```

- [ ] **Step 2: Import `ResearchTabs` and render the tabbed panel**

At the top of `components/TermSearchResults.tsx`, add:

```tsx
import { ResearchTabs } from './ResearchTabs';
```

In `TermCard`, replace the `{chatOpen && (<ResearchChat term={term} />)}` block (~line 146-148) with a bordered panel that wraps `ResearchTabs`, passing `ResearchChat` as the `chat` slot:

```tsx
            {researchOpen && (
              <div className="border border-cyan-500 dark:border-cyan-600 rounded-lg overflow-hidden">
                <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Research</span>
                </div>
                <div className="px-3 py-2">
                  <ResearchTabs
                    termId={term.id}
                    initialMarkdown={term.notes}
                    accent="cyan"
                    chat={<ResearchChat term={term} />}
                  />
                </div>
              </div>
            )}
```

- [ ] **Step 3: Rename the `chatOpen` state and footer button to "Research"**

In `TermCard`, rename state `chatOpen`/`setChatOpen` → `researchOpen`/`setResearchOpen` (declaration ~line 110, the `border-cyan` conditional ~line 113, the footer button ~line 166-179). Update the footer button label text from `Ask` to `Research` (the text node after the `<svg>` at ~line 178). Keep the icon and styling.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: passes. Confirm no remaining references to `chatOpen`.

---

### Task 7: Wire `ResearchTabs` into the term detail page (Step 2)

**Files:**
- Modify: `components/TermDetailPage.tsx` (form-mode Step 2 ~385-418; attempt-mode Step 2 ~467-562)

- [ ] **Step 1: Import `ResearchTabs`**

At the top of `components/TermDetailPage.tsx`, add:

```tsx
import { ResearchTabs } from './ResearchTabs';
```

- [ ] **Step 2: Wrap form-mode Step 2 chat input in `ResearchTabs`**

In the `viewMode.type === 'form'` Step 2 block (~385-418), keep the `StepLabel`, Definition box, and helper `<p>`. Wrap the existing chat input row (the `<div className="flex gap-2">` containing the input + Ask button, ~399-416) as the `chat` slot:

```tsx
              <ResearchTabs
                termId={term.id}
                initialMarkdown={term.notes}
                accent="zinc"
                chat={
                  <div className="flex gap-2">
                    {/* existing form-mode input + Ask button, unchanged */}
                  </div>
                }
              />
```

Move the existing `{error && ...}` and the input/button markup inside the `chat` prop exactly as they are. The `handleStartResearch` handler and `chatInput` state remain unchanged.

- [ ] **Step 3: Wrap attempt-mode Step 2 chat in `ResearchTabs`**

In the `viewMode.type === 'attempt'` Step 2 block (~467-562), keep `StepLabel`, Definition box, the "Do your research now…" helper, the "Prior Research" reference block, and the chat messages + input. Wrap the **chat messages block and the chat input block** (the messages `{(allChats[viewing.id] ?? []).length > 0 && (...)}` ~516-542 and the input `<div className="flex gap-2">` ~544-561) as the `chat` slot of a single `ResearchTabs`:

```tsx
              <ResearchTabs
                termId={term.id}
                initialMarkdown={term.notes}
                accent="zinc"
                chat={
                  <>
                    {/* existing chat messages block, unchanged */}
                    {/* existing chat input block, unchanged */}
                  </>
                }
              />
```

Leave the "Prior Research" reference block outside/above `ResearchTabs` (it is contextual history, not part of the live Ask pane). The `handleAskQuestion`, `chatInput`, `allChats`, `isPendingChat` references stay unchanged.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: passes. Confirm `term.notes` is available on the `term` prop's type (it is `Term`, updated in Task 1).

---

### Task 8: Include notes in the Notion export

**Files:**
- Modify: `lib/notion.ts` (`appendRefinementToNotionPage` 223-...), `actions/refinements.ts` (`addRefinementToNotion` call ~117-129)

- [ ] **Step 1: Add an optional `notes` parameter to `appendRefinementToNotionPage`**

In `lib/notion.ts`, add a parameter after `date?: string`:

```ts
  date?: string,
  notes?: string | null,
): Promise<void> {
```

- [ ] **Step 2: Append a "My Notes" section when notes are present**

In the `client.blocks.children.append({ block_id: pageId, children: [...] })` array, after the `...parseMarkdownToNotionBlocks(refinement.refinement_additional_note),` entry, add:

```ts
      ...(notes && notes.trim().length > 0
        ? [
            {
              object: 'block',
              type: 'heading_2',
              heading_2: { rich_text: [{ type: 'text', text: { content: 'My Notes' } }] },
            } as BlockObjectRequest,
            ...parseMarkdownToNotionBlocks(notes),
          ]
        : []),
```

- [ ] **Step 3: Pass `term.notes` from the caller**

In `actions/refinements.ts` `addRefinementToNotion`, the `appendRefinementToNotionPage(...)` call (~117-129) already has `term` in scope. Add `term.notes` as the final argument, after `term.notion_date ?? undefined,`:

```ts
    term.notion_date ?? undefined,
    term.notes,
  );
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: passes.

---

### Task 9: Full build + manual verification

**Files:** none (verification only)

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: builds with no type or lint errors.

- [ ] **Step 2: Manual browser check**

Start dev (`npm run dev`, port 5023) and confirm — the owner applies the migration first:
- Term detail page Step 2 shows **Ask AI / My Notes** tabs; Ask AI works as before; My Notes editor formats text (bold/italic/heading/lists/link) and Save shows "Saved · just now".
- Reload the term page → saved notes reappear with formatting intact (markdown round-trip).
- Search results: expanding a card shows a **Research** footer button; opening it shows the tabbed panel with cyan accent; both tabs work.
- "Add to Notion" on a completed attempt produces a "My Notes" section in the Notion page (and omits it when notes are empty).

---

## Self-Review

- **Spec coverage:** `terms.notes` column + types (T1); Tiptap editor (T2,T4); markdown storage via `tiptap-markdown` (T4); `saveTermNote` action (T3); `ResearchTabs` both places (T5,T6,T7); footer rename Ask→Research (T6); Notion "My Notes" section (T8). All spec sections mapped.
- **Out of scope** honored: no per-attempt notes, no timeline, no images/tables.
- **Type consistency:** `NoteEditor` props `{ termId, initialMarkdown }`; `ResearchTabs` props `{ termId, initialMarkdown, chat, accent }`; `saveTermNote(termId, markdown)`; `Term.notes: string | null` — consistent across T1/T3/T4/T5/T6/T7.
- **No commits** per repo rule; verification via tsc/lint/build/manual.
