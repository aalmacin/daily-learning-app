'use client';

import { Fragment, useMemo, useState, useEffect, useRef } from 'react';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    mobileHidden?: boolean;
  }
}
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
import { deleteTerm, updateTermPriority } from '@/actions/terms';
import { addToNotion, syncWithNotion } from '@/actions/notion';
import { updateTermCategories } from '@/actions/categories';
import type { Term, Category, Priority } from '@/lib/db';

const PRIORITIES: Priority[] = ['High', 'Medium', 'Low'];
const PAGE_SIZE_OPTIONS = [10, 25, 50];

const columnHelper = createColumnHelper<Term>();

function CategoryEditor({ term, allCategories, onSaved }: {
  term: Term;
  allCategories: Category[];
  onSaved: (updated: Term) => void;
}) {
  const mutation = useMutation({
    mutationFn: (categories: string[]) => updateTermCategories(term.id, categories),
    onSuccess: onSaved,
  });

  const toggle = (name: string) => {
    const next = term.categories.includes(name)
      ? term.categories.filter((c) => c !== name)
      : [...term.categories, name];
    mutation.mutate(next);
  };

  return (
    <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-700 space-y-3">
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Categories</p>
      <div className="flex flex-wrap gap-2">
        {allCategories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            disabled={mutation.isPending}
            onClick={() => toggle(cat.name)}
            className={`px-2.5 py-1 text-xs rounded-full border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              term.categories.includes(cat.name)
                ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-50 dark:text-zinc-900 dark:border-zinc-50'
                : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>
      {mutation.error && (
        <p className="text-xs text-red-600 dark:text-red-400">
          {mutation.error instanceof Error ? mutation.error.message : 'Failed to save'}
        </p>
      )}
    </div>
  );
}

function PriorityEditor({ term, onSaved }: { term: Term; onSaved: (updated: Term) => void }) {
  const mutation = useMutation({
    mutationFn: (priority: Priority) => updateTermPriority(term.id, priority),
    onSuccess: onSaved,
  });

  return (
    <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-700 space-y-3">
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Priority</p>
      <div className="flex gap-4">
        {PRIORITIES.map((p) => (
          <label key={p} className={`flex items-center gap-1.5 ${mutation.isPending ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
            <input
              type="radio"
              name={`priority-${term.id}`}
              value={p}
              checked={term.priority === p}
              disabled={mutation.isPending}
              onChange={() => mutation.mutate(p)}
              className="accent-zinc-900 dark:accent-zinc-50"
            />
            <span className="text-xs text-zinc-700 dark:text-zinc-300">{p}</span>
          </label>
        ))}
      </div>
      {mutation.error && (
        <p className="text-xs text-red-600 dark:text-red-400">
          {mutation.error instanceof Error ? mutation.error.message : 'Failed to save'}
        </p>
      )}
    </div>
  );
}

function CategoryFilterDropdown({ categories, selected, onChange }: {
  categories: string[];
  selected: string[];
  onChange: (cats: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = categories.filter((c) => c.toLowerCase().includes(search.toLowerCase()));

  const toggle = (cat: string) =>
    onChange(selected.includes(cat) ? selected.filter((c) => c !== cat) : [...selected, cat]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
      >
        {selected.length > 0 ? `${selected.length} categor${selected.length === 1 ? 'y' : 'ies'}` : 'Filter by category'}
        <span className="text-zinc-400">▾</span>
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-56 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg">
          <div className="p-2 border-b border-zinc-100 dark:border-zinc-800">
            <input
              type="text"
              placeholder="Search categories…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-2 py-1.5 text-xs rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600"
              autoFocus
            />
          </div>
          <ul className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-zinc-400">No categories found</li>
            ) : (
              filtered.map((cat) => (
                <li key={cat}>
                  <label className="flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.includes(cat)}
                      onChange={() => toggle(cat)}
                      className="accent-zinc-900 dark:accent-zinc-50"
                    />
                    {cat}
                  </label>
                </li>
              ))
            )}
          </ul>
          {selected.length > 0 && (
            <div className="p-2 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type TermsTableProps = {
  initialTerms: Term[];
  total: number;
  allCategories: Category[];
  currentPage: number;
  pageSize: number;
  currentQ: string;
  currentCategories: string[];
  currentNotion: 'pending' | 'added' | 'all';
  currentPriority: Priority | 'all';
  currentDailyLearning: 'all' | 'done' | 'not-done';
  currentSort: 'created_at' | 'name' | 'priority';
  currentDir: 'asc' | 'desc';
  timezone: string;
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
  currentPriority,
  currentDailyLearning,
  currentSort,
  currentDir,
  timezone,
}: TermsTableProps) {
  const router = useRouter();
  const [terms, setTerms] = useState<Term[]>(initialTerms);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [searchInput, setSearchInput] = useState(currentQ);
  const [notionSuccessId, setNotionSuccessId] = useState<number | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [staleTerms, setStaleTerms] = useState<string[]>([]);
  const [syncDbError, setSyncDbError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTerms(initialTerms);
    setExpanded({});
    setSearchInput(currentQ);
  }, [initialTerms, currentQ]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const pageCount = Math.ceil(total / pageSize);

  function buildUrl(overrides: Partial<{
    q: string;
    categories: string[];
    notion: 'pending' | 'added' | 'all';
    priority: Priority | 'all';
    dailyLearning: 'all' | 'done' | 'not-done';
    sort: 'created_at' | 'name' | 'priority';
    dir: 'asc' | 'desc';
    page: number;
    pageSize: number;
  }>): string {
    const merged = {
      q: searchInput,
      categories: currentCategories,
      notion: currentNotion,
      priority: currentPriority,
      dailyLearning: currentDailyLearning,
      sort: currentSort,
      dir: currentDir,
      page: currentPage,
      pageSize,
      ...overrides,
    };
    const params = new URLSearchParams();
    if (merged.q) params.set('q', merged.q);
    merged.categories.forEach((c) => params.append('category', c));
    if (merged.notion !== 'all') params.set('notion', merged.notion);
    if (merged.priority !== 'all') params.set('priority', merged.priority);
    if (merged.dailyLearning !== 'all') params.set('dailyLearning', merged.dailyLearning);
    if (merged.sort !== 'created_at') params.set('sort', merged.sort);
    if (merged.dir !== 'desc') params.set('dir', merged.dir);
    if (merged.page !== 1) params.set('page', String(merged.page));
    if (merged.pageSize !== 10) params.set('pageSize', String(merged.pageSize));
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

  function handleSort(column: 'created_at' | 'name' | 'priority') {
    const newDir = currentSort === column && currentDir === 'desc' ? 'asc' : 'desc';
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

  const syncMutation = useMutation({
    mutationFn: syncWithNotion,
    onSuccess: ({ synced, imported, pushed, contentSynced, skipped, stale, dbError }) => {
      router.refresh();
      const parts = [`Synced ${synced} term${synced !== 1 ? 's' : ''} with Notion.`];
      if (pushed > 0) parts.push(`Pushed ${pushed} new term${pushed !== 1 ? 's' : ''} to Notion.`);
      if (imported > 0) parts.push(`Imported ${imported} new term${imported !== 1 ? 's' : ''} from Notion.`);
      if (contentSynced > 0) parts.push(`Downloaded ${contentSynced} explained concept${contentSynced !== 1 ? 's' : ''}.`);
      if (skipped > 0) parts.push(`Skipped ${skipped} unchanged.`);
      setSyncMessage(parts.join(' '));
      setStaleTerms(stale);
      setSyncDbError(dbError ?? null);
      setTimeout(() => setSyncMessage(null), 4000);
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
      columnHelper.display({
        id: 'open',
        header: '',
        cell: ({ row }) => (
          <Link
            href={`/terms/${row.original.id}`}
            onClick={(e) => e.stopPropagation()}
            className="px-2 py-1 text-xs rounded bg-zinc-100 text-zinc-700 hover:bg-zinc-200 transition-colors dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 whitespace-nowrap"
          >
            Open
          </Link>
        ),
      }),
      columnHelper.accessor('created_at', {
        meta: { mobileHidden: true },
        header: () => sortableHeader('Created', 'created_at'),
        enableSorting: false,
        cell: (info) =>
          new Date(info.getValue()).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            timeZone: timezone,
          }),
      }),
      columnHelper.accessor('priority', {
        meta: { mobileHidden: true },
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
        meta: { mobileHidden: true },
        cell: (info) => (
          <span className={info.getValue() ? 'text-green-600' : 'text-zinc-400'}>
            {info.getValue() ? '✓' : '—'}
          </span>
        ),
      }),
      columnHelper.accessor('notion_page_id', {
        header: 'Notion',
        enableSorting: false,
        meta: { mobileHidden: true },
        cell: (info) => (
          <span className={info.getValue() ? 'text-green-600' : 'text-zinc-400'}>
            {info.getValue() ? '✓' : '—'}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        meta: { mobileHidden: true },
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
    [deleteMutation, addToNotionMutation, notionSuccessId, confirmingDeleteId, currentSort, currentDir, timezone],
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

  const categoryNames = allCategories.map((c) => c.name);

  return (
    <div className="space-y-4">
      {deleteSuccess && (
        <p className="text-sm text-green-600 dark:text-green-400">Term deleted successfully.</p>
      )}
      {syncMessage && (
        <p className="text-sm text-green-600 dark:text-green-400">{syncMessage}</p>
      )}
      {staleTerms.length > 0 && (
        <div className="text-sm text-yellow-600 dark:text-yellow-400">
          <p className="font-medium">Unlinked {staleTerms.length} stale Notion page{staleTerms.length !== 1 ? 's' : ''}:</p>
          <ul className="list-disc list-inside mt-1">
            {staleTerms.map((name) => <li key={name}>{name}</li>)}
          </ul>
        </div>
      )}
      {syncDbError && (
        <p className="text-sm text-yellow-600 dark:text-yellow-400">Could not query Notion database: {syncDbError}</p>
      )}
      {syncMutation.isError && (
        <p className="text-sm text-red-600 dark:text-red-400">Sync failed. Please try again.</p>
      )}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="text"
            placeholder="Search terms…"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="flex-1 min-w-[200px] px-3 py-2 text-sm border border-zinc-200 rounded-lg bg-white dark:bg-zinc-900 dark:border-zinc-700 text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600"
          />
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="px-3 py-2 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            {syncMutation.isPending ? 'Syncing…' : 'Sync with Notion'}
          </button>
          <div className="flex items-center gap-1 border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
            {(['all', 'pending', 'added'] as const).map((val) => (
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
          <div className="flex items-center gap-1 border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
            {(['all', ...PRIORITIES] as const).map((val) => (
              <button
                key={val}
                onClick={() => navigate({ priority: val, page: 1 })}
                className={`px-3 py-2 text-xs font-medium transition-colors ${
                  currentPriority === val
                    ? 'bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900'
                    : 'bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                }`}
              >
                {val === 'all' ? 'All priorities' : val}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-1 border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
            {(['all', 'done', 'not-done'] as const).map((val) => (
              <button
                key={val}
                onClick={() => navigate({ dailyLearning: val, page: 1 })}
                className={`px-3 py-2 text-xs font-medium transition-colors ${
                  currentDailyLearning === val
                    ? 'bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900'
                    : 'bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                }`}
              >
                {val === 'done' ? 'Learning done' : val === 'not-done' ? 'Learning pending' : 'All learning'}
              </button>
            ))}
          </div>
          {categoryNames.length > 0 && (
            <CategoryFilterDropdown
              categories={categoryNames}
              selected={currentCategories}
              onChange={(cats) => navigate({ categories: cats, page: 1 })}
            />
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={`px-2 py-2 md:px-4 md:py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider${header.column.columnDef.meta?.mobileHidden ? ' hidden md:table-cell' : ''}`}
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
                        className={`px-2 py-2 md:px-4 md:py-3 text-zinc-700 dark:text-zinc-300${cell.column.columnDef.meta?.mobileHidden ? ' hidden md:table-cell' : ''}`}
                        onClick={
                          cell.column.id === 'actions' || cell.column.id === 'open'
                            ? (e) => e.stopPropagation()
                            : undefined
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
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-zinc-500 dark:text-zinc-400">Per page</label>
            <select
              value={pageSize}
              onChange={(e) => navigate({ pageSize: Number(e.target.value), page: 1 })}
              className="text-xs border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 focus:outline-none"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </div>

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
