# Add Term Button on Non-Exact Search Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show an "Add [q]" button next to the result count when no exact match exists, opening an inline compact TermForm above the results grid.

**Architecture:** All changes in `components/TermSearchResults.tsx`. Add `showAddForm` state with a `useEffect` reset on query change, an exact-match check to gate the button, and conditional TermForm rendering between the header and the results grid.

**Tech Stack:** React (useState, useEffect), existing TermForm component with `defaultTerm`, `compact`, and `onExplainComplete` props.

---

### Task 1: Add state, effect, and exact-match check to TermSearchResults

**Files:**
- Modify: `components/TermSearchResults.tsx`

- [ ] **Step 1: Add `useEffect` to the existing import**

In `components/TermSearchResults.tsx`, line 3, the current import is:
```tsx
import { useState, useTransition } from 'react';
```
Change it to:
```tsx
import { useState, useEffect, useTransition } from 'react';
```

- [ ] **Step 2: Add state and reset effect inside `TermSearchResults`**

Inside the `TermSearchResults` function body, immediately after the opening brace, add:
```tsx
const [showAddForm, setShowAddForm] = useState(false);

useEffect(() => {
  setShowAddForm(false);
}, [q]);
```

- [ ] **Step 3: Add exact-match check**

Directly after the state/effect block, add:
```tsx
const isExactMatch = terms.some(
  (t) => t.name.toLowerCase() === q.toLowerCase()
);
```

- [ ] **Step 4: Commit**

```bash
git add components/TermSearchResults.tsx
git commit -m "feat: add showAddForm state and exact-match check to TermSearchResults"
```

---

### Task 2: Update header row and add inline TermForm

**Files:**
- Modify: `components/TermSearchResults.tsx`

- [ ] **Step 1: Replace the result count `<p>` with a flex row containing the count and the button**

Locate this block inside the `return` of `TermSearchResults` (currently around line 222–225):
```tsx
<div className="space-y-3">
  <p className="text-sm text-zinc-500 dark:text-zinc-400">
    {terms.length} result{terms.length !== 1 ? 's' : ''} for &ldquo;{q}&rdquo;
  </p>
  <div className="grid grid-cols-1 gap-3">
```

Replace it with:
```tsx
<div className="space-y-3">
  <div className="flex items-center justify-between">
    <p className="text-sm text-zinc-500 dark:text-zinc-400">
      {terms.length} result{terms.length !== 1 ? 's' : ''} for &ldquo;{q}&rdquo;
    </p>
    {!isExactMatch && !showAddForm && (
      <button
        type="button"
        onClick={() => setShowAddForm(true)}
        className="text-xs font-medium px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
      >
        Add &ldquo;{q}&rdquo;
      </button>
    )}
  </div>
  <div className="grid grid-cols-1 gap-3">
```

- [ ] **Step 2: Render inline TermForm between the header and results grid**

Immediately after the closing `</div>` of the header flex row and before `<div className="grid grid-cols-1 gap-3">`, add:
```tsx
  {showAddForm && (
    <TermForm
      defaultTerm={q}
      compact
      onExplainComplete={() => {
        setShowAddForm(false);
        onTermExplained?.();
      }}
    />
  )}
```

The full `return` block should now look like:
```tsx
return (
  <div className="space-y-3">
    <div className="flex items-center justify-between">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {terms.length} result{terms.length !== 1 ? 's' : ''} for &ldquo;{q}&rdquo;
      </p>
      {!isExactMatch && !showAddForm && (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="text-xs font-medium px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
        >
          Add &ldquo;{q}&rdquo;
        </button>
      )}
    </div>
    {showAddForm && (
      <TermForm
        defaultTerm={q}
        compact
        onExplainComplete={() => {
          setShowAddForm(false);
          onTermExplained?.();
        }}
      />
    )}
    <div className="grid grid-cols-1 gap-3">
      {terms.map((term) => (
        <TermCard key={term.id} term={term} />
      ))}
    </div>
  </div>
);
```

- [ ] **Step 3: Verify `TermForm` is already imported**

Confirm line 9 reads:
```tsx
import { TermForm } from '@/components/TermForm';
```
It is already imported — no change needed.

- [ ] **Step 4: Commit**

```bash
git add components/TermSearchResults.tsx
git commit -m "feat: show inline TermForm when Add button clicked on non-exact search results"
```
