# Homepage Category Multi-Select Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inline category pill-toggles in the homepage term result card with static selected-category pills plus a searchable checkbox dropdown for editing.

**Architecture:** Extract the existing `CategoryFilterDropdown` from `TermsTable.tsx` into a shared `CategoryMultiSelectDropdown` component with an added `disabled` prop. Wire it into `DoneTermCard` in `TermResult.tsx` alongside a read-only display of the currently selected categories.

**Tech Stack:** React, TypeScript, Tailwind CSS, TanStack Query (`useMutation`)

---

### Task 1: Extract `CategoryMultiSelectDropdown` shared component

**Files:**
- Create: `components/CategoryMultiSelectDropdown.tsx`

- [ ] **Step 1: Create the new file**

`components/CategoryMultiSelectDropdown.tsx`:

```tsx
'use client';

import { useState, useEffect, useRef } from 'react';

type CategoryMultiSelectDropdownProps = {
  categories: string[];
  selected: string[];
  onChange: (cats: string[]) => void;
  disabled?: boolean;
};

export function CategoryMultiSelectDropdown({
  categories,
  selected,
  onChange,
  disabled,
}: CategoryMultiSelectDropdownProps) {
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
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {selected.length > 0 ? `${selected.length} categor${selected.length === 1 ? 'y' : 'ies'}` : 'Categories'}
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/aalmacin/Projects/daily-learning-worktree/fix-account-access && npx tsc --noEmit
```

Expected: no errors related to the new file.

- [ ] **Step 3: Commit**

```bash
git add components/CategoryMultiSelectDropdown.tsx
git commit -m "feat: extract CategoryMultiSelectDropdown shared component"
```

---

### Task 2: Update `TermsTable.tsx` to use the shared component

**Files:**
- Modify: `components/TermsTable.tsx`

- [ ] **Step 1: Remove the local `CategoryFilterDropdown` function**

In `components/TermsTable.tsx`, delete lines 113–191 (the entire `function CategoryFilterDropdown(...) { ... }` block).

- [ ] **Step 2: Add the import**

At the top of `components/TermsTable.tsx`, add:

```tsx
import { CategoryMultiSelectDropdown } from '@/components/CategoryMultiSelectDropdown';
```

- [ ] **Step 3: Replace the usage**

In `TermsTable.tsx`, find the `<CategoryFilterDropdown` usage (inside the filter row, around line 644) and rename it:

```tsx
<CategoryMultiSelectDropdown
  categories={categoryNames}
  selected={currentCategories}
  onChange={(cats) => navigate({ categories: cats, page: 1 })}
/>
```

Note: no `disabled` prop needed here — the terms page dropdown is never in a pending state.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/aalmacin/Projects/daily-learning-worktree/fix-account-access && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Manually verify terms page still works**

Start dev server if not running: `npm run dev`

Navigate to `/terms`. Confirm:
- The category filter dropdown button still appears
- Clicking it opens the searchable checkbox dropdown
- Selecting/deselecting categories updates the URL and filters the table

- [ ] **Step 6: Commit**

```bash
git add components/TermsTable.tsx
git commit -m "refactor: use shared CategoryMultiSelectDropdown in TermsTable"
```

---

### Task 3: Update `DoneTermCard` in `TermResult.tsx`

**Files:**
- Modify: `components/TermResult.tsx`

- [ ] **Step 1: Add the import**

At the top of `components/TermResult.tsx`, add:

```tsx
import { CategoryMultiSelectDropdown } from '@/components/CategoryMultiSelectDropdown';
```

- [ ] **Step 2: Remove the `toggleCategory` function**

Delete this function from `DoneTermCard` (around line 116):

```tsx
function toggleCategory(cat: string) {
  const next = term.categories.includes(cat)
    ? term.categories.filter((c) => c !== cat)
    : [...term.categories, cat]
  categoryMutation.mutate(next)
}
```

- [ ] **Step 3: Replace the category UI section**

Find the existing category block in `DoneTermCard` (around lines 161–182):

```tsx
{allCategories.length > 0 && (
  <div className="flex flex-wrap gap-2 mt-2">
    {allCategories.map((cat) => {
      const selected = term.categories.includes(cat.name)
      return (
        <button
          key={cat.id}
          type="button"
          disabled={categoryMutation.isPending}
          onClick={() => toggleCategory(cat.name)}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
            selected
              ? 'bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-50'
              : 'border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-500'
          }`}
        >
          {cat.name}
        </button>
      )
    })}
  </div>
)}
```

Replace with:

```tsx
{allCategories.length > 0 && (
  <div className="flex flex-wrap items-center gap-2 mt-2">
    {term.categories.map((cat) => (
      <span
        key={cat}
        className="px-3 py-1 rounded-full text-xs font-medium border bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-50"
      >
        {cat}
      </span>
    ))}
    <CategoryMultiSelectDropdown
      categories={allCategories.map((c) => c.name)}
      selected={term.categories}
      onChange={(cats) => categoryMutation.mutate(cats)}
      disabled={categoryMutation.isPending}
    />
  </div>
)}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/aalmacin/Projects/daily-learning-worktree/fix-account-access && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Manually verify the homepage works**

Navigate to `/` (homepage). Search for a term to trigger a result card. Confirm:
- Selected categories appear as filled dark pills
- Unselected categories are not shown inline
- A "Categories" dropdown button appears
- Clicking it opens a searchable checkbox dropdown
- Toggling a category immediately saves (pill updates, dropdown reflects new state)
- While saving, the dropdown button is disabled (`disabled` prop)
- Clearing all categories via "Clear all" works

- [ ] **Step 6: Commit**

```bash
git add components/TermResult.tsx
git commit -m "feat: replace category pill-toggles with pills + multi-select dropdown on homepage"
```
