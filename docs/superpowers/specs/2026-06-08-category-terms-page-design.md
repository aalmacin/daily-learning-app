# Category Terms Page — Design Spec

**Date:** 2026-06-08

## Goal

When a user clicks "View Terms" on `/categories`, navigate to a dedicated category page (`/categories/[id]`) that shows all terms belonging to that category, rendered identically to the Term List (expandable rows with inline term detail).

## Changes

### 1. Extract `TermExpandableDetail` (shared component)

Extract the expand/collapse toggle, lazy-load logic, loading/error states, and inline `TermDetailPage` rendering from `TermListRow` in `components/TermList.tsx` into a new shared component `TermExpandableDetail`.

`TermListRow` wraps it unchanged — no visible behavior change to the Term List page.

Props:
- `termId: number` — used to call `getTermDetailForList`
- `children` (row header slot rendered above the expanded detail)

### 2. New `CategoryTermList` component (`components/CategoryTermList.tsx`)

Client component. Renders a styled list of term rows.

Each `CategoryTermRow` displays:
- Expand toggle (calls `TermExpandableDetail`)
- Term name
- Category badges (hidden on small screens, matching Term List behavior)
- "Open" link to `/terms/[id]`

No drag handle, no remove button, no position date.

Empty state: `"No terms in this category."` centered, same text style as Term List.

### 3. DB function — `getTermsByCategory`

Location: `lib/db.ts`

```ts
getTermsByCategory(userId: string, categoryId: number): Promise<{ id: number; name: string; categories: string[] }[]>
```

Queries `term_categories` for the given `categoryId`, joins to `terms` filtered by `user_id`, and resolves category names for each term. Returns terms ordered by name ascending.

### 4. New page — `/categories/[id]/page.tsx`

Server component. Params: `{ id: string }`.

- Authenticates the current user.
- Resolves category by ID (must belong to the user — 404 if not found).
- Fetches terms via `getTermsByCategory`.
- Renders heading with the category name and `CategoryTermList`.

### 5. Update `CategoriesManager` "View Terms" link

Change `href` from:
```
/terms?category=${encodeURIComponent(cat.name)}
```
to:
```
/categories/${cat.id}
```

## Out of scope

- Pagination on the category page (categories are expected to have manageable term counts)
- Sorting/filtering on the category page
- Any changes to the `/terms` page or its existing category filter behavior
