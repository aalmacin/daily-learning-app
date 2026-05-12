# Performance Improvements Design

**Date:** 2026-05-10
**Branch:** improve-performance

## Problem

Both the Terms list page and Term detail page load slowly. Root causes:

1. `getClient()` creates a new Supabase client on every DB function call
2. `getAllTerms()` fetches all rows from three tables sequentially — not scalable to thousands of terms
3. No database indexes on commonly filtered/joined columns
4. No request-level deduplication for server component data fetching
5. `TermsTable` uses a no-op `useQuery` (`queryFn: async () => initialData`) that never re-fetches

## Approach

Four targeted fixes covering all root causes. No new external dependencies.

---

## Section 1 — Supabase Client Singleton

Replace the `getClient()` factory in `lib/db.ts` with a module-level singleton.

```ts
const supabase = createClient(url, key);
```

**Why:** This app uses `SUPABASE_SERVICE_ROLE_KEY` — no per-user sessions, no cookies. Supabase's own guidance recommends a singleton for service role usage. Creating a new client per call adds unnecessary construction overhead.

---

## Section 2 — Server-side Pagination with Debounced Search

### Motivation

With thousands of terms, fetching the full table on every page load is the primary bottleneck. Client-side filtering via react-table cannot scale.

### URL as source of truth

The terms list URL carries all filter/sort/page state:

```
/terms?page=1&q=searchterm&category=X&notion=pending&sort=created_at&dir=desc
```

`TermsPage` reads `searchParams` and passes them to `getTermsPaginated()`. Navigation updates the URL; the server re-renders with fresh data.

### New DB function: `getTermsPaginated()`

```ts
type TermsQuery = {
  page: number;
  pageSize: number;
  q?: string;
  categoryNames?: string[];
  notion?: 'pending' | 'added' | 'all';
  sort?: 'created_at' | 'name' | 'priority';
  dir?: 'asc' | 'desc';
};

type TermsPage = {
  terms: Term[];
  total: number;
};
```

Query strategy:
1. If `categoryNames` provided — fetch matching term IDs from `term_categories` (OR logic: term has any selected category), pass to `.in('id', termIds)`
2. Apply ILIKE on `name`, notion filter, sort, and `.range()` with `{ count: 'exact' }` in one terms query
3. Fetch category links and explained status only for the returned page rows via `Promise.all`

### `TermsTable` changes

- Removes `getFilteredRowModel`, `getSortedRowModel`, `getPaginationRowModel` from react-table — DB handles these
- Replaces local filter/sort/pagination state with `router.replace()` calls that update URL params
- Search input debounces 300ms before updating URL
- Replaces no-op `useQuery` + `initialData` pattern with plain `useState(initialData)`
- Keeps `useMutation` for delete, priority update, notion sync — mutations update local state directly after success
- Keeps react-table for column rendering and row expansion only

### Category filter

OR logic: a term matches if it has **any** of the selected categories.

### Term detail page

Already uses `Promise.all` for `getTermById` + `getRefinementsByTermId`. Gains singleton client and `cache()` wrapping. No structural changes.

---

## Section 3 — Database Indexes

New migration enabling `pg_trgm` and adding six indexes:

| Index | Table | Column(s) | Type | Purpose |
|---|---|---|---|---|
| `idx_terms_name_trgm` | `terms` | `name` | GIN (pg_trgm) | ILIKE `%q%` search |
| `idx_terms_created_at` | `terms` | `created_at` | BTREE | Default sort |
| `idx_term_categories_term_id` | `term_categories` | `term_id` | BTREE | Per-page category fetch |
| `idx_term_categories_category_id` | `term_categories` | `category_id` | BTREE | OR category filter lookup |
| `idx_concept_refinements_term_id` | `concept_refinements` | `term_id` | BTREE | Per-page explained check |
| `idx_concept_refinements_formatted_note` | `concept_refinements` | `refinement_formatted_note` | Partial (IS NOT NULL) | Filters completed refinements |

`pg_trgm` is required for efficient wildcard ILIKE. Without it, name search is a full table scan regardless of row count.

---

## Section 4 — React `cache()` Deduplication

Wrap data-fetching functions with React's `cache()`:

```ts
import { cache } from 'react';
export const getAllCategories = cache(async () => { ... });
```

Applies to: `getAllCategories`, `getTermsPaginated`, `getTermById`, `getRefinementsByTermId`.

`cache()` deduplicates calls within a single server render — if two server components call the same function with the same args, Supabase is hit once. Scoped per-request; does not cache across requests.

---

## Files Changed

| File | Change |
|---|---|
| `lib/db.ts` | Singleton client, new `getTermsPaginated()`, `cache()` wrappers |
| `supabase/migrations/<timestamp>_indexes.sql` | pg_trgm + 6 indexes |
| `app/terms/page.tsx` | Read filter/sort/page from `searchParams`, pass to `getTermsPaginated()` |
| `components/TermsTable.tsx` | URL-driven state, debounced search, remove client-side react-table filtering/sorting/pagination |

**Unchanged:** `app/terms/[id]/page.tsx`, `components/TermDetailPage.tsx`, `app/categories/page.tsx`, `components/CategoriesManager.tsx`, all server actions.
