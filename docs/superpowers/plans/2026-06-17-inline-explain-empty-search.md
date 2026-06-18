# Inline Explain on Empty Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the SearchBar dropdown finds no results, show a compact pre-filled "Explain a Term" form; after explanation completes, the search re-fetches and the new term appears as a normal result card.

**Architecture:** Three targeted changes — `TermForm` gains optional props for compact/pre-filled mode, `TermSearchResults` renders the form in its empty state, and `SearchBar` passes a `refreshSearch` callback that re-fetches immediately on completion.

**Tech Stack:** Next.js App Router, TanStack Form, TanStack Store, Supabase (via server actions)

---

### Task 1: Add `defaultTerm`, `compact`, and `onExplainComplete` props to `TermForm`

**Files:**
- Modify: `components/TermForm.tsx`

- [ ] **Step 1: Add prop types and update the function signature**

Replace:
```tsx
export function TermForm() {
  const [mode, setMode] = useState<Mode>('single')
```
With:
```tsx
type Props = {
  defaultTerm?: string
  compact?: boolean
  onExplainComplete?: () => void
}

export function TermForm({ defaultTerm, compact, onExplainComplete }: Props = {}) {
  const [mode, setMode] = useState<Mode>('single')
```

- [ ] **Step 2: Wire `defaultTerm` into the single form's `defaultValues`**

Replace:
```tsx
  const singleForm = useForm({
    defaultValues: { termName: '', context: '' },
```
With:
```tsx
  const singleForm = useForm({
    defaultValues: { termName: defaultTerm ?? '', context: '' },
```

- [ ] **Step 3: Call `onExplainComplete` after successful resolution**

Replace:
```tsx
      explainTerm(value.termName, value.context || undefined)
        .then((term) => resolveTermResult(name, term))
        .catch((e) => rejectTermResult(name, e instanceof Error ? e.message : 'Something went wrong'))
```
With:
```tsx
      explainTerm(value.termName, value.context || undefined)
        .then((term) => {
          resolveTermResult(name, term)
          onExplainComplete?.()
        })
        .catch((e) => rejectTermResult(name, e instanceof Error ? e.message : 'Something went wrong'))
```

- [ ] **Step 4: Conditionalize the outer wrapper and title**

Replace:
```tsx
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
      <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-4">Explain a Term</h2>

      <div className="flex gap-1 mb-4 border-b border-zinc-200 dark:border-zinc-800">
        {(['single', 'multiple'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setMode(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              mode === tab
                ? 'border-zinc-900 dark:border-zinc-50 text-zinc-900 dark:text-zinc-50'
                : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {mode === 'single' ? (
```
With:
```tsx
  const content = (
    <>
      {!compact && (
        <div className="flex gap-1 mb-4 border-b border-zinc-200 dark:border-zinc-800">
          {(['single', 'multiple'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setMode(tab)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                mode === tab
                  ? 'border-zinc-900 dark:border-zinc-50 text-zinc-900 dark:text-zinc-50'
                  : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      )}

      {(compact || mode === 'single') ? (
```

- [ ] **Step 5: Close the `content` fragment and return conditionally**

After the closing `</form>` of the multiple form (just before the `<datalist>`), replace:
```tsx
      )}

      <datalist id="recent-contexts-list">
```
With:
```tsx
      )}
    </>
  )

  return compact ? (
    <div className="flex flex-col gap-3">
      {content}
      <datalist id="recent-contexts-list">
        {recentContexts.map((ctx) => (
          <option key={ctx} value={ctx} />
        ))}
      </datalist>
    </div>
  ) : (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
      <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-4">Explain a Term</h2>
      {content}
      <datalist id="recent-contexts-list">
```

And remove the old closing `</div>` at the very end (that closed the card wrapper), replacing the end of the file's return block with:
```tsx
        {recentContexts.map((ctx) => (
          <option key={ctx} value={ctx} />
        ))}
      </datalist>
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add components/TermForm.tsx
git commit -m "feat: add defaultTerm, compact, and onExplainComplete props to TermForm"
```

---

### Task 2: Update `TermSearchResults` to show inline form when empty

**Files:**
- Modify: `components/TermSearchResults.tsx`

- [ ] **Step 1: Import `TermForm`**

Add to imports at the top of `components/TermSearchResults.tsx`:
```tsx
import { TermForm } from '@/components/TermForm'
```

- [ ] **Step 2: Add `onTermExplained` to the Props type**

Replace:
```tsx
type Props = {
  terms: Term[];
  q: string;
};
```
With:
```tsx
type Props = {
  terms: Term[];
  q: string;
  onTermExplained?: () => void;
};
```

- [ ] **Step 3: Update the empty state to render the inline form**

Replace:
```tsx
export function TermSearchResults({ terms, q }: Props) {
  if (terms.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        No terms found for &ldquo;{q}&rdquo;.
      </p>
    );
  }
```
With:
```tsx
export function TermSearchResults({ terms, q, onTermExplained }: Props) {
  if (terms.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No terms found for &ldquo;{q}&rdquo;.
        </p>
        <hr className="border-zinc-200 dark:border-zinc-800" />
        <TermForm defaultTerm={q} compact onExplainComplete={onTermExplained} />
      </div>
    );
  }
```

- [ ] **Step 4: Commit**

```bash
git add components/TermSearchResults.tsx
git commit -m "feat: show inline TermForm in empty search results"
```

---

### Task 3: Wire `refreshSearch` in `SearchBar`

**Files:**
- Modify: `components/SearchBar.tsx`

- [ ] **Step 1: Add the `refreshSearch` function and pass it to `TermSearchResults`**

In `SearchBar`, add `refreshSearch` after the `handleClear` function:

Replace:
```tsx
  function handleClear() {
    setQuery('');
    setResults(null);
  }
```
With:
```tsx
  function handleClear() {
    setQuery('');
    setResults(null);
  }

  function refreshSearch() {
    const trimmed = query.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const terms = await searchTerms(trimmed);
      setResults(terms);
    });
  }
```

- [ ] **Step 2: Pass `onTermExplained` to `TermSearchResults`**

Replace:
```tsx
              <TermSearchResults terms={results!} q={query} />
```
With:
```tsx
              <TermSearchResults terms={results!} q={query} onTermExplained={refreshSearch} />
```

- [ ] **Step 3: Commit**

```bash
git add components/SearchBar.tsx
git commit -m "feat: refresh search after inline term explanation"
```

---

### Task 4: Manual verification

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify empty state shows the form**

Search for a term that doesn't exist (e.g. `zzznonsenseterm`). Confirm:
- "No terms found for 'zzznonsenseterm'." appears
- A divider and compact "Explain a Term" form appears below it
- The Term field is pre-populated with `zzznonsenseterm`
- The Context field is empty

- [ ] **Step 3: Verify explanation and re-fetch**

Click "Explain". Confirm:
- The Explain button disables while processing
- After completion, the search result updates and shows the new term as a `TermCard`
- The term card shows "✓ Explained" badge

- [ ] **Step 4: Verify home page TermForm is unchanged**

Navigate to the home page. Confirm the TermForm still shows the title "Explain a Term", mode tabs, and full card wrapper.
