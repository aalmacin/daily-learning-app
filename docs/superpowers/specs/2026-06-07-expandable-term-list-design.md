# Expandable Term List

**Date:** 2026-06-07

## Goal

Replace the "Open" navigation pattern in the term list with inline expandable rows. Each row can be expanded to show the full term detail page content (Feynman steps, flashcards, explanation date) without leaving the list. The "Open" link is kept for users who prefer full-page navigation.

## Data Fetching

A new server action `getTermDetailForList(termId)` fetches all data needed by `TermDetailPage`:
- `refinements` via `getRefinementsByTermId`
- `chats` via `getChatsByRefinementIds`
- `flashcards` via `getFlashcardsByTermId`
- `explainedAt` via `getExplainedAtForTerm`

This action is called client-side only on first expand of a given row. Results are cached in component state so re-collapsing and re-expanding does not re-fetch.

## UI Changes

### `TermListRow`

- A chevron toggle button is added between the date column and the term name.
- Clicking the chevron sets `isExpanded` on the row.
- The chevron rotates 90° when expanded (CSS transition).
- The "Open" link and "Remove" button are unchanged.
- The expanded section renders directly below the row header inside the same sortable item — dnd-kit handles variable-height items without issue.

### Expanded content

- On first expand: a brief inline loading spinner is shown while data fetches.
- On error: a small error message replaces the spinner.
- Once loaded: `TermDetailPage` renders as-is with its own `bg-zinc-50 p-8` outer container and `max-w-3xl mx-auto` inner layout. This creates a clear visual separation from the row header.

### State per row

Each `TermListRow` tracks:
- `isExpanded: boolean`
- `termData: TermDetailData | null` — cached after first fetch
- `isLoading: boolean`
- `fetchError: string | null`

## What Does Not Change

- Drag-to-reorder behavior
- Remove mutation
- Reorder mutation
- `TermDetailPage` component internals — used entirely as-is
- The "Open" link
