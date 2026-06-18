# Add Term Button on Non-Exact Search Results

## Summary

When a search returns results but none exactly matches the query, show an "Add" button next to the result count. Clicking it reveals an inline TermForm pre-filled with the query, placed between the header and the results grid — mirroring the empty-state experience.

## Scope

Single file: `components/TermSearchResults.tsx`. No new components, no new props.

## Exact-match check

```ts
const isExactMatch = terms.some(t => t.name.toLowerCase() === q.toLowerCase())
```

Button renders only when `!isExactMatch`.

## State

```ts
const [showAddForm, setShowAddForm] = useState(false)
```

Reset to `false` on `q` change via `useEffect` keyed on `q`.

## Header row

Replace the current `<p>` count tag with:

```tsx
<div className="flex items-center justify-between">
  <p className="text-sm text-zinc-500 dark:text-zinc-400">
    {terms.length} result{terms.length !== 1 ? 's' : ''} for &ldquo;{q}&rdquo;
  </p>
  {!isExactMatch && (
    <button onClick={() => setShowAddForm(true)} ...>
      Add &ldquo;{q}&rdquo;
    </button>
  )}
</div>
```

## Inline form

Rendered between header and results grid when `showAddForm` is true:

```tsx
<TermForm
  defaultTerm={q}
  compact
  onExplainComplete={() => {
    setShowAddForm(false)
    onTermExplained?.()
  }}
/>
```

No cancel button. No separator needed — existing `space-y-3` spacing provides visual separation.

## Behaviour notes

- Button disappears once `showAddForm` is true (no toggle — the form is the affordance).
- `onExplainComplete` closes the form and propagates the `onTermExplained` callback (triggers search refresh in the parent).
- Form resets to hidden whenever the user types a new query (`q` changes).
