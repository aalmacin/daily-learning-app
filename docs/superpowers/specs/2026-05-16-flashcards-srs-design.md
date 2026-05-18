# Flashcards with Spaced Repetition System

## Overview

Add flashcard functionality with cloze deletions and SM-2 inspired spaced repetition. Cards are created from formatted notes on the term detail page and reviewed on a dedicated /flashcards page.

## Database Schema

```sql
CREATE TABLE flashcards (
  id SERIAL PRIMARY KEY,
  term_id INTEGER NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  interval_step INTEGER NOT NULL DEFAULT 0,
  next_review TIMESTAMPTZ,
  last_reviewed TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID NOT NULL REFERENCES auth.users(id)
);

CREATE INDEX idx_flashcards_user_next_review ON flashcards(user_id, next_review);
CREATE INDEX idx_flashcards_term_id ON flashcards(term_id);
```

RLS: Users can only access their own cards (`user_id = auth.uid()`).

## Spaced Repetition Logic

- Interval sequence: `[1, 3, 7, 14, 30, 60]` days
- `interval_step` is the index into this array (0-5)
- On **Correct**: advance step (capped at 5), set `next_review = now + interval[new_step]`
- On **Incorrect**: reset `interval_step = 0`, set `next_review = now + 1 day`
- New cards: `next_review = null` (never reviewed)

## Cloze Deletion Format

- Wrap text with `__` to mark cloze: `The __dog__ barks`
- Multiple clozes per card allowed, all revealed simultaneously
- **Front**: replace `__...__` with a blank line (styled underline)
- **Back**: replace `__...__` with the inner text, bold + blue color

## Term Detail Page — Step 4: Flashcards

Appears after Step 3 (Refined Explanation) in the Feynman Method section.

### Create Flashcard Flow

1. "Create Flashcard" button shown when a completed refinement exists
2. Clicking it shows a textarea pre-filled with `refinement_formatted_note`
3. Small helper text above/below the textarea: "Wrap text with __ to create cloze deletions. Example: The __dog__ barks."
4. User adds `__...__` markers around terms to cloze
5. "Save Card" creates one flashcard from current markers
6. User can repeat: click "Create Flashcard" again to make more cards

### Card List

Below creation area, show all flashcards for this term:
- Each card displays its front (blanked) preview
- Card info: interval, next review date, last reviewed date
- "New — not yet reviewed" for cards with null next_review
- Actions: Edit, Reset (reset SRS state), Delete

### Edit

Opens the same textarea with the cloze-marked content for modification.

## Flashcards Review Page (`/flashcards`)

Top-level nav item.

### Layout

- Mobile-first responsive design (optimized for phone, scales up for desktop)
- Multi-select category dropdown filter with selected categories shown as removable tags (inline with dropdown)
- Progress indicator: "Card X of Y" + "N due / M new"

### Card Order

1. Due cards first (`next_review <= now`, ordered by next_review ASC)
2. New cards after (random order)

### Review Flow

1. **Front**: card with blanks, full-width "Show Answer" button
2. **Back**: card with cloze filled (bold blue), "From: [term name]" reference, two buttons:
   - "Incorrect" (red) — resets to step 0, next review in 1 day
   - "Correct" (green) — advances step, next review per interval
3. Below buttons: hint text showing what each button will do ("Incorrect: 1 day", "Correct: 14 days")

### Empty State

Simple "All caught up!" message when no cards are due and no new cards match the filter.

## Technical Approach

- Server actions for CRUD operations and review submissions
- React Query for client-side state management
- Supabase for storage with RLS
- Responsive via Tailwind breakpoints (mobile-first)
