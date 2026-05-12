# Performance Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix slow page loads on the Terms list and Term detail pages by adding DB indexes, switching to server-side pagination, introducing a Supabase singleton, and adding React `cache()` deduplication.

**Architecture:** All filtering/sorting/pagination moves to Supabase queries driven by URL search params. `TermsTable` becomes a URL-navigation component instead of a client-side filter/sort/paginate component. DB indexes and `pg_trgm` make queries fast at scale.

**Tech Stack:** Next.js 16 App Router, Supabase JS v2, React 19, TanStack React Query v5 (mutations only), TanStack React Table v8

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20260510000001_add_indexes.sql` | Create | pg_trgm extension + 6 indexes |
| `lib/db.ts` | Modify | Singleton client, `getTermsPaginated`, `cache()` wrappers, new exported types |
| `app/terms/page.tsx` | Modify | Parse searchParams, call `getTermsPaginated`, pass new props |
| `components/TermsTable.tsx` | Modify | URL-driven filters/sort/pagination, debounced search, `useState` instead of `useQuery` |

---

## Task 1: DB Migration — pg_trgm + indexes

**Files:**
- Create: `supabase/migrations/20260510000001_add_indexes.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260510000001_add_indexes.sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_terms_name_trgm ON terms USING GIN (name gin_trgm_ops);
CREATE INDEX idx_terms_created_at ON terms (created_at DESC);
CREATE INDEX idx_term_categories_term_id ON term_categories (term_id);
CREATE INDEX idx_term_categories_category_id ON term_categories (category_id);
CREATE INDEX idx_concept_refinements_term_id ON concept_refinements (term_id);
CREATE INDEX idx_concept_refinements_formatted_note ON concept_refinements (refinement_formatted_note)
  WHERE refinement_formatted_note IS NOT NULL;
```

- [ ] **Step 2: Apply the migration**

```bash
npx supabase db push
```

Expected: migration applies without error. If Supabase CLI isn't configured for remote, apply via the Supabase dashboard SQL editor instead.

- [ ] **Step 3: Verify indexes exist**

Run in Supabase SQL editor or `npx supabase db execute`:

```sql
SELECT indexname, tablename FROM pg_indexes
WHERE indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
```

Expected: all 6 indexes appear in results.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260510000001_add_indexes.sql
git commit -m "feat: add pg_trgm extension and performance indexes"
```

---

## Task 2: lib/db.ts — Singleton, getTermsPaginated, cache()

**Files:**
- Modify: `lib/db.ts`

- [ ] **Step 1: Replace `getClient()` with module-level singleton and add new types**

Replace the top of `lib/db.ts` — from the import through the end of `getClient()` — with:

```ts
import { createClient } from '@supabase/supabase-js';
import { cache } from 'react';

export type Priority = 'High' | 'Medium' | 'Low';

export type Term = {
  id: number;
  name: string;
  content: string;
  categories: string[];
  created_at: string;
  notion_page_id: string | null;
  priority: Priority;
  explained: boolean;
};

export type Category = {
  id: number;
  name: string;
};

export type ConceptRefinement = {
  id: number;
  term_id: number;
  pre_refinement: string;
  pre_refinement_accuracy: number | null;
  pre_refinement_review: string | null;
  refinement: string | null;
  refinement_accuracy: number | null;
  refinement_review: string | null;
  refinement_formatted_note: string | null;
  refinement_additional_note: string | null;
  created_at: string;
};

export type TermsQuery = {
  page: number;
  pageSize: number;
  q?: string;
  categoryNames?: string[];
  notion?: 'pending' | 'added' | 'all';
  sort?: 'created_at' | 'name' | 'priority';
  dir?: 'asc' | 'desc';
};

export type TermsPage = {
  terms: Term[];
  total: number;
};

type TermRow = Omit<Term, 'categories' | 'explained'>;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Missing Supabase env vars');
const supabase = createClient(url, key);
```

- [ ] **Step 2: Update private helpers to use the singleton**

`getCategoriesForTerm`, `upsertCategories`, `setTermCategories`, and `isTermExplained` all call `getClient()`. Remove those calls and use `supabase` directly. Example — `getCategoriesForTerm`:

```ts
async function getCategoriesForTerm(termId: number): Promise<string[]> {
  const { data, error } = await supabase
    .from('term_categories')
    .select('categories(name)')
    .eq('term_id', termId)
    .order('categories(name)');
  if (error) throw error;
  return (data as unknown as { categories: { name: string } | null }[])
    .map((r) => r.categories?.name)
    .filter((n): n is string => n != null);
}

async function upsertCategories(names: string[]): Promise<number[]> {
  if (names.length === 0) return [];
  const { error } = await supabase
    .from('categories')
    .upsert(names.map((name) => ({ name })), { onConflict: 'name', ignoreDuplicates: true });
  if (error) throw error;
  const { data, error: selectError } = await supabase
    .from('categories')
    .select('id, name')
    .in('name', names);
  if (selectError) throw selectError;
  return (data as Category[]).map((c) => c.id);
}

async function setTermCategories(termId: number, categoryIds: number[]): Promise<void> {
  const { error: deleteError } = await supabase
    .from('term_categories')
    .delete()
    .eq('term_id', termId);
  if (deleteError) throw deleteError;
  if (categoryIds.length === 0) return;
  const { error } = await supabase
    .from('term_categories')
    .insert(categoryIds.map((category_id) => ({ term_id: termId, category_id })));
  if (error) throw error;
}

async function isTermExplained(termId: number): Promise<boolean> {
  const { data, error } = await supabase
    .from('concept_refinements')
    .select('id')
    .eq('term_id', termId)
    .not('refinement_formatted_note', 'is', null)
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
```

- [ ] **Step 3: Add `getTermsPaginated`**

Add this function after the private helpers and before `getAllCategories`:

```ts
export async function getTermsPaginated({
  page,
  pageSize,
  q,
  categoryNames,
  notion,
  sort = 'created_at',
  dir = 'desc',
}: TermsQuery): Promise<TermsPage> {
  const offset = (page - 1) * pageSize;

  // Resolve category names → term IDs (OR logic)
  let termIdFilter: number[] | null = null;
  if (categoryNames && categoryNames.length > 0) {
    const { data: cats, error: catError } = await supabase
      .from('categories')
      .select('id')
      .in('name', categoryNames);
    if (catError) throw catError;
    const catIds = (cats as { id: number }[]).map((c) => c.id);
    if (catIds.length === 0) return { terms: [], total: 0 };

    const { data: links, error: linkError } = await supabase
      .from('term_categories')
      .select('term_id')
      .in('category_id', catIds);
    if (linkError) throw linkError;
    termIdFilter = [...new Set((links as { term_id: number }[]).map((l) => l.term_id))];
    if (termIdFilter.length === 0) return { terms: [], total: 0 };
  }

  let query = supabase.from('terms').select('*', { count: 'exact' });
  if (q) query = query.ilike('name', `%${q}%`);
  if (notion === 'pending') query = query.is('notion_page_id', null);
  if (notion === 'added') query = query.not('notion_page_id', 'is', null);
  if (termIdFilter !== null) query = query.in('id', termIdFilter);
  query = query.order(sort, { ascending: dir === 'asc' }).range(offset, offset + pageSize - 1);

  const { data: rows, count, error } = await query;
  if (error) throw error;

  const total = count ?? 0;
  if (!rows || rows.length === 0) return { terms: [], total };

  const rowIds = (rows as TermRow[]).map((r) => r.id);

  const [catLinksResult, explainedResult] = await Promise.all([
    supabase
      .from('term_categories')
      .select('term_id, categories(name)')
      .in('term_id', rowIds),
    supabase
      .from('concept_refinements')
      .select('term_id')
      .in('term_id', rowIds)
      .not('refinement_formatted_note', 'is', null),
  ]);
  if (catLinksResult.error) throw catLinksResult.error;
  if (explainedResult.error) throw explainedResult.error;

  const catMap = new Map<number, string[]>();
  for (const link of catLinksResult.data as unknown as { term_id: number; categories: { name: string } | null }[]) {
    if (!link.categories) continue;
    if (!catMap.has(link.term_id)) catMap.set(link.term_id, []);
    catMap.get(link.term_id)!.push(link.categories.name);
  }

  const explainedIds = new Set((explainedResult.data as { term_id: number }[]).map((r) => r.term_id));

  return {
    terms: (rows as TermRow[]).map((row) => ({
      ...row,
      categories: catMap.get(row.id) ?? [],
      explained: explainedIds.has(row.id),
    })),
    total,
  };
}
```

- [ ] **Step 4: Wrap cacheable functions with `cache()`**

Wrap `getAllCategories`, `getTermById`, and `getRefinementsByTermId` with React's `cache()`. These are called with simple primitive arguments and may be called multiple times in the same render.

`getAllCategories`:
```ts
export const getAllCategories = cache(async (): Promise<Category[]> => {
  const { data, error } = await supabase.from('categories').select('*').order('name');
  if (error) throw error;
  return data as Category[];
});
```

`getTermById`:
```ts
export const getTermById = cache(async (id: number): Promise<Term | null> => {
  const { data, error } = await supabase
    .from('terms')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as TermRow;
  const [categories, explained] = await Promise.all([
    getCategoriesForTerm(row.id),
    isTermExplained(row.id),
  ]);
  return { ...row, categories, explained };
});
```

`getRefinementsByTermId`:
```ts
export const getRefinementsByTermId = cache(async (termId: number): Promise<ConceptRefinement[]> => {
  const { data, error } = await supabase
    .from('concept_refinements')
    .select('*')
    .eq('term_id', termId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as ConceptRefinement[];
});
```

Also update `getAllTerms` to use the singleton (remove `getClient()` call there too):
```ts
export async function getAllTerms(): Promise<Term[]> {
  const { data: rows, error } = await supabase
    .from('terms')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const [catLinksResult, explainedResult] = await Promise.all([
    supabase.from('term_categories').select('term_id, categories(name)'),
    supabase
      .from('concept_refinements')
      .select('term_id')
      .not('refinement_formatted_note', 'is', null),
  ]);
  if (catLinksResult.error) throw catLinksResult.error;
  if (explainedResult.error) throw explainedResult.error;

  const catMap = new Map<number, string[]>();
  for (const link of catLinksResult.data as unknown as { term_id: number; categories: { name: string } | null }[]) {
    if (!link.categories) continue;
    if (!catMap.has(link.term_id)) catMap.set(link.term_id, []);
    catMap.get(link.term_id)!.push(link.categories.name);
  }

  const explainedIds = new Set((explainedResult.data as { term_id: number }[]).map((r) => r.term_id));

  return (rows as TermRow[]).map((row) => ({
    ...row,
    categories: catMap.get(row.id) ?? [],
    explained: explainedIds.has(row.id),
  }));
}
```

Also update the remaining public functions (`getTerm`, `insertTerm`, `updateTerm`, `deleteTerm`, `insertCategory`, `deleteCategory`, `updateTermCategories`, `createRefinement`, `updatePreRefinementResult`, `updateRefinementData`, `deleteConceptRefinement`, `getRefinementById`) — remove any `getClient()` calls and use `supabase` directly. The pattern is the same for all: delete `const supabase = getClient();` from each function body.

- [ ] **Step 5: Verify the build compiles**

```bash
npm run build
```

Expected: no TypeScript errors. Fix any type errors before continuing.

- [ ] **Step 6: Commit**

```bash
git add lib/db.ts
git commit -m "feat: supabase singleton, getTermsPaginated, react cache wrappers"
```

---

## Task 3: app/terms/page.tsx — Server-side pagination

**Files:**
- Modify: `app/terms/page.tsx`

- [ ] **Step 1: Replace the page with searchParams-driven implementation**

```tsx
import Link from 'next/link';
import { getTermsPaginated, getAllCategories } from '@/lib/db';
import { TermsTable } from '@/components/TermsTable';
import type { TermsQuery } from '@/lib/db';

const PAGE_SIZE = 25;

export default async function TermsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;

  const page = Math.max(1, Number(params.page) || 1);
  const q = typeof params.q === 'string' ? params.q : '';
  const rawCategory = params.category;
  const categoryNames =
    typeof rawCategory === 'string'
      ? [rawCategory]
      : Array.isArray(rawCategory)
        ? rawCategory
        : [];
  const notion: TermsQuery['notion'] =
    params.notion === 'added' || params.notion === 'all' ? params.notion : 'pending';
  const sort: TermsQuery['sort'] =
    params.sort === 'name' || params.sort === 'priority' ? params.sort : 'created_at';
  const dir: TermsQuery['dir'] = params.dir === 'asc' ? 'asc' : 'desc';

  const [{ terms, total }, categories] = await Promise.all([
    getTermsPaginated({ page, pageSize: PAGE_SIZE, q, categoryNames, notion, sort, dir }),
    getAllCategories(),
  ]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex items-center gap-4">
          <Link
            href="/"
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            ← Home
          </Link>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Terms</h1>
          <Link
            href="/categories"
            className="ml-auto text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            Manage Categories
          </Link>
        </div>
        <TermsTable
          initialTerms={terms}
          total={total}
          allCategories={categories}
          currentPage={page}
          pageSize={PAGE_SIZE}
          currentQ={q}
          currentCategories={categoryNames}
          currentNotion={notion}
          currentSort={sort}
          currentDir={dir}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: TypeScript error on `TermsTable` props because the component hasn't been updated yet. That's fine — continue to Task 4.

- [ ] **Step 3: Commit after Task 4 is done** (combined commit with TermsTable)

---

## Task 4: components/TermsTable.tsx — URL-driven state

**Files:**
- Modify: `components/TermsTable.tsx`

This is a full replacement of the component. The `CategoryEditor` and `PriorityEditor` sub-components are unchanged.

- [ ] **Step 1: Replace the TermsTable component**

Replace everything from `export function TermsTable` to the end of the file with:

```tsx
type TermsTableProps = {
  initialTerms: Term[];
  total: number;
  allCategories: Category[];
  currentPage: number;
  pageSize: number;
  currentQ: string;
  currentCategories: string[];
  currentNotion: 'pending' | 'added' | 'all';
  currentSort: 'created_at' | 'name' | 'priority';
  currentDir: 'asc' | 'desc';
};

export function TermsTable({
  initialTerms,
  total,
  allCategories,
  currentPage,
  pageSize,
  currentQ,
  currentCategories,
  currentNotion,
  currentSort,
  currentDir,
}: TermsTableProps) {
  const router = useRouter();
  const [terms, setTerms] = useState<Term[]>(initialTerms);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [searchInput, setSearchInput] = useState(currentQ);
  const [notionSuccessId, setNotionSuccessId] = useState<number | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync server data when URL-driven props change (Next.js preserves client state across navigations)
  useEffect(() => {
    setTerms(initialTerms);
    setExpanded({});
  }, [initialTerms]);

  const pageCount = Math.ceil(total / pageSize);

  function buildUrl(overrides: Partial<{
    q: string;
    categories: string[];
    notion: 'pending' | 'added' | 'all';
    sort: 'created_at' | 'name' | 'priority';
    dir: 'asc' | 'desc';
    page: number;
  }>): string {
    const merged = {
      q: searchInput,
      categories: currentCategories,
      notion: currentNotion,
      sort: currentSort,
      dir: currentDir,
      page: currentPage,
      ...overrides,
    };
    const params = new URLSearchParams();
    if (merged.q) params.set('q', merged.q);
    merged.categories.forEach((c) => params.append('category', c));
    if (merged.notion !== 'pending') params.set('notion', merged.notion);
    if (merged.sort !== 'created_at') params.set('sort', merged.sort);
    if (merged.dir !== 'desc') params.set('dir', merged.dir);
    if (merged.page !== 1) params.set('page', String(merged.page));
    const qs = params.toString();
    return qs ? `/terms?${qs}` : '/terms';
  }

  function navigate(overrides: Parameters<typeof buildUrl>[0]) {
    router.replace(buildUrl(overrides), { scroll: false });
  }

  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      navigate({ q: value, page: 1 });
    }, 300);
  }

  function toggleCategory(cat: string) {
    const next = currentCategories.includes(cat)
      ? currentCategories.filter((c) => c !== cat)
      : [...currentCategories, cat];
    navigate({ categories: next, page: 1 });
  }

  function handleSort(column: 'created_at' | 'name' | 'priority') {
    const newDir =
      currentSort === column && currentDir === 'desc' ? 'asc' : 'desc';
    navigate({ sort: column, dir: newDir, page: 1 });
  }

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteTerm(id),
    onSuccess: (_, id) => {
      setTerms((prev) => prev.filter((t) => t.id !== id));
      setDeleteSuccess(true);
      setTimeout(() => setDeleteSuccess(false), 3000);
    },
  });

  const addToNotionMutation = useMutation({
    mutationFn: (term: Term) =>
      addToNotion(term.id, {
        name: term.name,
        content: term.content,
        categories: term.categories,
        priority: term.priority,
      }),
    onSuccess: (updatedTerm, term) => {
      setTerms((prev) => prev.map((t) => (t.id === term.id ? updatedTerm : t)));
      setNotionSuccessId(term.id);
      setTimeout(() => setNotionSuccessId(null), 3000);
    },
  });

  const sortableHeader = (
    label: string,
    column: 'created_at' | 'name' | 'priority',
  ) => (
    <button
      onClick={() => handleSort(column)}
      className="flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
    >
      {label}
      <span className="text-zinc-300 dark:text-zinc-600">
        {currentSort === column ? (currentDir === 'asc' ? '↑' : '↓') : '↕'}
      </span>
    </button>
  );

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'expand',
        header: '',
        cell: ({ row }) => (
          <button
            onClick={row.getToggleExpandedHandler()}
            className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors w-5 text-center"
            aria-label={row.getIsExpanded() ? 'Collapse' : 'Expand'}
          >
            {row.getIsExpanded() ? '▾' : '▸'}
          </button>
        ),
      }),
      columnHelper.accessor('name', {
        header: () => sortableHeader('Name', 'name'),
        enableSorting: false,
        cell: (info) => (
          <span className="font-medium text-zinc-900 dark:text-zinc-50">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor('categories', {
        header: 'Categories',
        enableSorting: false,
        cell: (info) => (
          <div className="flex flex-wrap gap-1">
            {info.getValue().map((cat) => (
              <span
                key={cat}
                className="px-2 py-0.5 text-xs rounded-full bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              >
                {cat}
              </span>
            ))}
          </div>
        ),
      }),
      columnHelper.accessor('created_at', {
        header: () => sortableHeader('Created', 'created_at'),
        enableSorting: false,
        cell: (info) =>
          new Date(info.getValue()).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          }),
      }),
      columnHelper.accessor('priority', {
        header: () => sortableHeader('Priority', 'priority'),
        enableSorting: false,
        cell: (info) => {
          const val = info.getValue();
          const color =
            val === 'High'
              ? 'text-red-600 dark:text-red-400'
              : val === 'Low'
                ? 'text-zinc-400 dark:text-zinc-500'
                : 'text-yellow-600 dark:text-yellow-400';
          return <span className={`text-xs font-medium ${color}`}>{val}</span>;
        },
      }),
      columnHelper.accessor('explained', {
        header: 'Explained',
        enableSorting: false,
        cell: (info) => (
          <span className={info.getValue() ? 'text-green-600' : 'text-zinc-400'}>
            {info.getValue() ? '✓' : '—'}
          </span>
        ),
      }),
      columnHelper.accessor('notion_page_id', {
        header: 'Notion',
        enableSorting: false,
        cell: (info) => (
          <span className={info.getValue() ? 'text-green-600' : 'text-zinc-400'}>
            {info.getValue() ? '✓' : '—'}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const term = row.original;
          const isDeleting = deleteMutation.isPending && deleteMutation.variables === term.id;
          const isAddingToNotion =
            addToNotionMutation.isPending && addToNotionMutation.variables?.id === term.id;
          const isNotionSuccess = notionSuccessId === term.id;
          const isConfirmingDelete = confirmingDeleteId === term.id;

          return (
            <div className="flex flex-col gap-1">
              <div className="flex gap-2">
                <Link
                  href={`/terms/${term.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="px-2 py-1 text-xs rounded bg-zinc-100 text-zinc-700 hover:bg-zinc-200 transition-colors dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  Open
                </Link>
                {isConfirmingDelete ? (
                  <>
                    <button
                      onClick={() => { deleteMutation.mutate(term.id); setConfirmingDeleteId(null); }}
                      disabled={isDeleting}
                      className="px-2 py-1 text-xs rounded bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setConfirmingDeleteId(null)}
                      className="px-2 py-1 text-xs rounded bg-zinc-100 text-zinc-700 hover:bg-zinc-200 transition-colors dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmingDeleteId(term.id)}
                    disabled={isDeleting}
                    className="px-2 py-1 text-xs rounded bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40"
                  >
                    Delete
                  </button>
                )}
                <button
                  onClick={() => addToNotionMutation.mutate(term)}
                  disabled={term.notion_page_id !== null || isAddingToNotion}
                  className="px-2 py-1 text-xs rounded bg-zinc-100 text-zinc-700 hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  {isAddingToNotion ? 'Adding…' : 'Add to Notion'}
                </button>
              </div>
              {isNotionSuccess && (
                <p className="text-xs text-green-600 dark:text-green-400">Added to Notion.</p>
              )}
            </div>
          );
        },
      }),
    ],
    [deleteMutation, addToNotionMutation, notionSuccessId, confirmingDeleteId, currentSort, currentDir],
  );

  const table = useReactTable({
    data: terms,
    columns,
    state: { expanded },
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: () => true,
  });

  return (
    <div className="space-y-4">
      {deleteSuccess && (
        <p className="text-sm text-green-600 dark:text-green-400">Term deleted successfully.</p>
      )}
      <div className="flex flex-wrap gap-4 items-start">
        <input
          type="text"
          placeholder="Search terms…"
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-2 text-sm border border-zinc-200 rounded-lg bg-white dark:bg-zinc-900 dark:border-zinc-700 text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600"
        />
        <div className="flex items-center gap-1 border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
          {(['pending', 'all', 'added'] as const).map((val) => (
            <button
              key={val}
              onClick={() => navigate({ notion: val, page: 1 })}
              className={`px-3 py-2 text-xs font-medium transition-colors ${
                currentNotion === val
                  ? 'bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900'
                  : 'bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
              }`}
            >
              {val === 'pending' ? 'Not on Notion' : val === 'added' ? 'On Notion' : 'All'}
            </button>
          ))}
        </div>
        {allCategories.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Filter by category:</span>
            {allCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => toggleCategory(cat.name)}
                className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                  currentCategories.includes(cat.name)
                    ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-50 dark:text-zinc-900 dark:border-zinc-50'
                    : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500'
                }`}
              >
                {cat.name}
              </button>
            ))}
            {currentCategories.length > 0 && (
              <button
                onClick={() => navigate({ categories: [], page: 1 })}
                className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider"
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-black">
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-zinc-400 dark:text-zinc-600"
                >
                  No terms found.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <Fragment key={row.id}>
                  <tr
                    className="hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
                    onClick={row.getToggleExpandedHandler()}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="px-4 py-3 text-zinc-700 dark:text-zinc-300"
                        onClick={
                          cell.column.id === 'actions' ? (e) => e.stopPropagation() : undefined
                        }
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                  {row.getIsExpanded() && (
                    <tr className="bg-zinc-50 dark:bg-zinc-950">
                      <td colSpan={columns.length} className="px-6 py-4">
                        <p className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                          {row.original.content}
                        </p>
                        <CategoryEditor
                          term={row.original}
                          allCategories={allCategories}
                          onSaved={(updated) =>
                            setTerms((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
                          }
                        />
                        <PriorityEditor
                          term={row.original}
                          onSaved={(updated) =>
                            setTerms((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
                          }
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-xs text-zinc-400 dark:text-zinc-600">
          {total} term{total !== 1 ? 's' : ''}
        </p>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate({ page: 1 })}
              disabled={currentPage <= 1}
              className="px-2 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-700 disabled:opacity-40 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              «
            </button>
            <button
              onClick={() => navigate({ page: currentPage - 1 })}
              disabled={currentPage <= 1}
              className="px-2 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-700 disabled:opacity-40 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              ‹
            </button>
            <span className="text-xs text-zinc-500 dark:text-zinc-400 px-2">
              {pageCount === 0 ? '0 / 0' : `${currentPage} / ${pageCount}`}
            </span>
            <button
              onClick={() => navigate({ page: currentPage + 1 })}
              disabled={currentPage >= pageCount}
              className="px-2 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-700 disabled:opacity-40 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              ›
            </button>
            <button
              onClick={() => navigate({ page: pageCount })}
              disabled={currentPage >= pageCount}
              className="px-2 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-700 disabled:opacity-40 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              »
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update imports at the top of TermsTable.tsx**

Replace the existing import block with:

```tsx
'use client';

import { Fragment, useMemo, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useReactTable,
  getCoreRowModel,
  getExpandedRowModel,
  createColumnHelper,
  flexRender,
  type ExpandedState,
} from '@tanstack/react-table';
import { useMutation } from '@tanstack/react-query';
import { deleteTerm } from '@/actions/terms';
import { addToNotion } from '@/actions/notion';
import { updateTermCategories } from '@/actions/categories';
import type { Term, Category, Priority } from '@/lib/db';
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

Expected: clean build with no TypeScript errors. If there are errors, fix them before committing.

- [ ] **Step 4: Manual smoke test**

```bash
npm run dev
```

- Navigate to `/terms` — should load first 25 terms
- Type in search box — after 300ms the URL should update and results change
- Click a category filter — URL updates, results change
- Click a column header (Name, Created, Priority) — URL updates with sort params
- Click pagination next/prev — URL updates, new page loads
- Expand a row — content shows, category/priority editors work
- Delete a term — row disappears from local state immediately
- Add a term to Notion — row updates locally

- [ ] **Step 5: Commit**

```bash
git add app/terms/page.tsx components/TermsTable.tsx
git commit -m "feat: server-side pagination with URL-driven filters and debounced search"
```

---

## Self-Review

**Spec coverage:**
- Section 1 (singleton): covered in Task 2 Step 1 ✓
- Section 2 (server-side pagination, debounced search, URL state, useState, mutations): covered in Tasks 3 + 4 ✓
- Section 2 (category OR logic): covered in Task 2 Step 3 `getTermsPaginated` ✓
- Section 3 (pg_trgm + indexes): covered in Task 1 ✓
- Section 4 (cache() wrappers): covered in Task 2 Step 4 ✓

**Type consistency:**
- `TermsQuery` and `TermsPage` exported from `lib/db.ts` in Task 2, imported in `app/terms/page.tsx` in Task 3 ✓
- `TermsTableProps` uses `currentSort: 'created_at' | 'name' | 'priority'` matching `TermsQuery['sort']` ✓
- `buildUrl` `sort` parameter type matches `TermsQuery['sort']` ✓
- `handleSort` parameter type matches `TermsQuery['sort']` ✓
- `setTerms` used consistently in all mutation `onSuccess` handlers and `CategoryEditor`/`PriorityEditor` `onSaved` callbacks ✓

**Placeholder scan:** No TBDs or incomplete steps found.

**Known limitation:** `priority` sorts alphabetically in DB (High → Low → Medium), same as the previous client-side behavior. Requires a DB enum or CASE expression to fix sort order — out of scope for this plan.
