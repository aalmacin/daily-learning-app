# Search Bar & Hamburger Menu Design

## Summary

Add a global search bar to the navbar and replace all nav links with a hamburger menu on every screen size. Search navigates to `/terms?q=query`. Results are shown as a 2-column card grid with inline Research chat.

---

## Navbar

**Layout (all screen sizes):** `Logo | flex-1 spacer | SearchBar | HamburgerButton`

- Logo: left-aligned, unchanged
- SearchBar: right-aligned, `min-w-[120px] max-w-[280px] w-[30%]`; on submit navigates to `/terms?q=<encoded input>`; pre-populates from URL `q` param via `useSearchParams()` when on the terms page
- HamburgerButton: always visible on all screen sizes (current `md:hidden` removed); toggles a floating dropdown anchored to the button, right-aligned, fixed width (~168px), positioned absolute with `box-shadow`

**Hamburger dropdown:** floating (not full-width), right-anchored below the button. Contains the same links as today: Terms, Term List, Flashcards, Categories, Settings, Sign out. Clicking outside dismisses it.

**Components:**
- `SearchBar.tsx` — new client component; owns input state; uses `useRouter` and `useSearchParams`
- `NavMenu.tsx` — simplified: remove desktop `hidden md:flex` inline links, remove `md:hidden` from hamburger, change dropdown from `left-0 right-0` full-width to right-anchored floating
- `layout.tsx` — header updated to `Logo | SearchBar | NavMenu`, both inside `{user && ...}`

---

## Search Results (TermsTable)

When `q` is non-empty, the terms page renders a **card grid** instead of the existing table:

- **Grid:** 2 columns on `md+`, 1 column on mobile
- **Card anatomy (top to bottom):**
  1. Header row: term name (flex-1) · Explained badge (green, only if `explained === true`) · Priority badge
  2. Description: full `content` field, no truncation
  3. *(when Ask is open)* inline Research chat (see below)
  4. Category tags (omitted if empty)
  5. Footer row: Ask button · View button (always visible, full-width split)

- **View button** → `router.push('/terms/${term.id}')`
- **Ask button** → toggles inline Research chat open/closed; highlighted when open; card breaks out of 2-column grid to full width with `px-[30%]` padding on the expanded body

**When no query** (`q` is empty): existing table layout is unchanged.

---

## Inline Research Chat

Appears between the description and categories when Ask is toggled open on a card. Mirrors the Step 2 — Research UI from `TermDetailPage`:

- "Research" label (small caps)
- Chat message history (user right-aligned, AI left-aligned)
- Text input + Ask button
- First message sent → calls `createAttempt(term.id, question)` (same action used in `TermDetailPage`), which creates a new refinement and sends the first message in one step; returns the new refinement with its initial chat message
- Subsequent messages → calls `askQuestion(refinementId, message)`
- Loading/error states mirror `TermDetailPage` (disable input while pending, show error inline)

State is local to the card (`useState` per card). Chat history persists for the session as long as the page is not refreshed.

---

## Data

The existing `getTermsPaginated` already returns `content`, `explained`, `categories`, and `id` — no schema or query changes needed. No new API routes or server actions required; the inline chat reuses `createAttempt` and `askQuestion` from `@/actions/refinements` and `@/actions/chat`.

---

## Non-changes

- Existing table layout when `q` is empty: no changes
- `content` field in expanded rows: already renders without truncation — no change needed
- Dark mode: follow existing zinc palette throughout
