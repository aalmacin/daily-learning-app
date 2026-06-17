# Research Notes — Design

## Goal

Let the user write their own notes while researching a term, directly on the site. Today the **Research** step (Step 2) is an AI Q&A chat only. Add a rich-text (RTF/WYSIWYG) notes editor alongside it, surfaced as tabs — **Ask AI** | **My Notes** — in both the term detail page and the expanded search-result card.

## Decisions

- **Scope:** one note per term (term-level), shared across all research attempts and visible everywhere. Not per-attempt.
- **Storage:** markdown in a new `terms.notes TEXT` column. The WYSIWYG editor serializes to/from markdown so existing `react-markdown` rendering stays consistent.
- **Editor:** Tiptap (`@tiptap/react` + `StarterKit` + markdown serialization) for true WYSIWYG matching the approved mockup.
- **Notion:** saved notes are included in the Notion export as a "My Notes" section.

## Data Model

Migration: add `notes TEXT` (nullable) to `terms`.

`lib/db.ts`:
- `Term` and `TermRow` gain `notes: string | null`.
- `updateTerm`: handle `updates.notes !== undefined` → `fields.notes`.
- `getTermById`: add `notes` to the explicit column select.
- `getAllTerms` / search use `select('*')`, so `notes` flows through once the column and type exist; confirm the row spread (`...row`) carries it.

## Components

### `components/NoteEditor.tsx` (new)
Tiptap-based WYSIWYG editor. One clear purpose: edit a term's markdown note.
- Props: `{ termId: number; initialMarkdown: string | null }`.
- Toolbar: bold, italic, underline, heading, quote, bullet list, numbered list, link, code.
- Loads `initialMarkdown` into the editor; on Save, serializes to markdown and calls `saveTermNote`.
- Save button with a "Saved · just now" hint after success. `useTransition` for pending state, inline error on failure (matches existing patterns).
- Depends on: `saveTermNote` action, Tiptap.

### `components/ResearchTabs.tsx` (new)
Wraps the two panes with the tab header. One purpose: switch between Ask AI and My Notes.
- Props: `{ term: Term; accent?: 'zinc' | 'cyan'; chat: ReactNode }` — receives the existing chat UI as a child/slot so chat behavior is untouched, renders `NoteEditor` for the notes tab.
- Local `activeTab` state. Accent prop drives the active-tab color (zinc on term page, cyan on search card).

### `actions/notes.ts` (new)
- `saveTermNote(termId: number, markdown: string): Promise<void>` — auth check (matches existing actions), `updateTerm(termId, { notes: markdown })`, `revalidatePath` for `/terms/[id]` and `/terms`.

## UI Integration

### `components/TermDetailPage.tsx`
Step 2 currently renders the chat directly in two branches (`viewMode.type === 'form'` and `viewMode.type === 'attempt'`). Replace the chat block with `ResearchTabs` (accent `zinc`) in both, passing the existing chat markup as the `chat` slot. The notes tab edits the term-level note in both modes; the AI chat keeps its per-attempt behavior unchanged.

### `components/TermSearchResults.tsx`
- `ResearchChat` content becomes the `chat` slot of `ResearchTabs` (accent `cyan`).
- Footer button renames **Ask → Research**; toggling it opens the tabbed panel (cyan border/accent kept). State `chatOpen` → `researchOpen` for clarity.

## Notion Export

`actions/notion.ts` (`addToNotion`) and the refinement append path (`appendRefinementToNotionPage` in `lib/notion.ts`) include the term's markdown notes as a "My Notes" section alongside the AI Q&A and formatted note. Skip the section when notes are empty.

## Error Handling

- Save failure: inline error under the editor, content preserved (mirrors `ResearchChat`/refinement error handling).
- Empty/whitespace notes: Save disabled, and Notion section omitted.
- Markdown rendering elsewhere: existing `react-markdown` already used; no sanitization regression since input is markdown authored by the term owner.

## Testing

- `saveTermNote` persists markdown to `terms.notes` and revalidates.
- `getTermById` / search return `notes`.
- `NoteEditor` round-trips markdown (load → edit → save → reload shows formatting).
- `ResearchTabs` switches panes without remounting/losing chat state.
- Search card footer "Research" toggles the panel; both tabs render.
- Notion export includes "My Notes" when present, omits when empty.

## Out of Scope (YAGNI)

- Per-attempt notes history.
- Multiple note entries / timeline.
- Image upload, tables, collaborative editing.

## Implementation Notes

- Per `AGENTS.md`, read the relevant `node_modules/next/dist/docs/` guides before writing code — this Next.js has breaking changes.
- Tiptap must run client-side (`'use client'`); guard SSR (`immediatelyRender: false`).
