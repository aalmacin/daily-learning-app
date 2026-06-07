# Global Search FAB — Design Spec

## Overview

Add a persistent floating action button (FAB) that opens a right slide-in search panel on any page. The panel contains the same `TermForm` + `TermResult` as the homepage. Panel state persists across open/close cycles because the component is never unmounted.

## Scope

- Only shown when a user is logged in (matches existing `NavMenu` behaviour)
- Available on every page via the root layout

## Components

### `store/searchStore.ts`
TanStack store with a single boolean `isOpen`. Exports `openSearch()`, `closeSearch()`, `toggleSearch()`.

### `components/SearchFAB.tsx`
- Fixed position: `bottom-6 right-6`
- 52px circle button
- Renders a search icon when panel is closed; ✕ when open
- Calls `toggleSearch()` on click

### `components/SearchPanel.tsx`
- Always mounted in the DOM (never conditionally rendered)
- Slides in from the right via CSS transition: `translate-x-full` → `translate-x-0`
- Width: `w-full sm:w-[65vw]`, anchored to the right edge
- Inner scrollable body: content constrained to `max-w-2xl mx-auto` (centred with side breathing room)
- Panel header: "Explain a Term" title + ✕ close button
- Body contains `<TermForm />` and `<TermResult />` directly — no changes to either component
- Backdrop: semi-transparent overlay behind the panel; `pointer-events-none` on `sm+` so page remains interactive; full `pointer-events-auto` on mobile, clicking backdrop closes panel
- Escape key closes panel

### `components/GlobalSearch.tsx`
Thin `'use client'` wrapper that renders `<SearchFAB />` and `<SearchPanel />` together. No logic of its own.

## Layout change

`app/layout.tsx` adds `{user && <GlobalSearch />}` after `<Providers>{children}</Providers>`, placing the FAB and panel outside the page content flow but inside `<body>`.

## State persistence

`SearchPanel` is never unmounted. `TermForm`'s local `useState` (mode, field values) and the existing `termStore` results survive toggle cycles with no additional changes.

## Out of scope

- Keyboard shortcut to open (e.g. ⌘K) — can be added later
- Syncing panel open state to URL
