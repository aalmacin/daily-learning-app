# getTermById Single-Query Optimization

## Problem

The individual term page (`/terms/[id]`) is slow to load. `getTermById` currently makes 3 sequential DB round-trips:

1. `SELECT * FROM terms WHERE id = $1`
2. `SELECT category_id FROM term_categories WHERE term_id = $1`
3. `SELECT name FROM categories WHERE id IN (...)` ← blocked on result of #2

The third query cannot start until the second completes (waterfall). A hash index on `terms.id` was considered but rejected — the primary key already has a B-tree index, and the bottleneck is the round-trip count, not the lookup algorithm.

## Solution

Rewrite `getTermById` to use a single Supabase query with inline joins, collapsing 3 round-trips into 1. This is the same pattern already used in `getTermsPaginated`.

## Change

**File:** `lib/db.ts` — only `getTermById`.

**Select string:**
```
id, name, content, created_at, updated_at, notion_page_id, notion_last_edited, last_synced_at, priority, daily_learning_done, notion_date, term_categories(categories(name)), concept_refinements!left(id)
```

- All `TermRow` columns are listed explicitly (no `*`)
- `term_categories(categories(name))` — fetches only the category name via the join
- `concept_refinements!left(id)` — selects only `id`; non-empty result means `explained = true`. Avoids pulling large TEXT columns (`pre_refinement`, `refinement`, etc.)

**Additional filter** (required for correct `explained` value):
```
.not('concept_refinements.refinement_formatted_note', 'is', null)
```
Without this, any term with an incomplete refinement record would incorrectly show as explained.

**Shape mapping** (same pattern as `getTermsPaginated`):
- Strip `term_categories` and `concept_refinements` from the row
- `categories` = `term_categories.map(tc => tc.categories?.name).filter(Boolean)`
- `explained` = `concept_refinements.length > 0` (only non-null `refinement_formatted_note` rows are returned due to the filter above)

**Existing indexes that support this join:**
- Primary key B-tree on `terms.id`
- `idx_term_categories_category_id` on `term_categories(category_id)`
- `idx_concept_refinements_explained` partial index on `concept_refinements(term_id) WHERE refinement_formatted_note IS NOT NULL`

No schema changes or new migrations needed.

## Out of Scope

- `getTerm` (lookup by name) and `updateTerm` — they also use `getCategoriesForTerm` / `isTermExplained` but are not on the hot path for the term detail page
- Narrowing the `getTermById` return type — it continues to return `Term | null`
