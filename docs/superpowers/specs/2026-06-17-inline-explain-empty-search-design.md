# Inline "Explain a Term" on Empty Search Results

## Overview

When the SearchBar dropdown returns no results, show a compact "Explain a Term" form below the "No terms found" message. The term field is pre-populated with the search query. After the user clicks Explain, a processing indicator appears, and on completion the search re-fetches so the new term appears as a regular search result card.

## Scope

Applies only to the **SearchBar dropdown** (`TermSearchResults` + `SearchBar`). The `/terms` page table "No terms found" state is not in scope.

---

## Components

### `TermForm` — new props

| Prop | Type | Purpose |
|---|---|---|
| `defaultTerm` | `string \| undefined` | Pre-populates the `termName` field via `defaultValues` |
| `compact` | `boolean \| undefined` | Hides the mode tab switcher and outer card wrapper; forces single mode only |
| `onExplainComplete` | `() => void \| undefined` | Called after `explainTerm()` resolves (success); triggers parent re-fetch |

In `singleForm.onSubmit`, after `resolveTermResult(name, term)` is called, invoke `onExplainComplete?.()`.

When `compact` is true:
- No `<div className="bg-white … rounded-xl border … p-6">` wrapper — render the form contents directly
- No mode tab switcher (`single` / `multiple` tabs hidden)
- Single mode form only

The `defaultTerm` prop sets `defaultValues.termName` at form initialization. No dynamic re-seeding needed — the component mounts fresh each time the dropdown opens with no results.

### `TermSearchResults` — new prop + empty-state change

New prop: `onTermExplained?: () => void`

When `terms.length === 0`, render:
1. "No terms found for …" message (unchanged)
2. `<hr>` divider
3. `<TermForm defaultTerm={q} compact onExplainComplete={onTermExplained} />`

### `SearchBar` — refresh on explain complete

Add `refreshSearch`:
```ts
function refreshSearch() {
  const trimmed = query.trim()
  if (!trimmed) return
  startTransition(async () => {
    const terms = await searchTerms(trimmed)
    setResults(terms)
  })
}
```

Pass `onTermExplained={refreshSearch}` to `<TermSearchResults>`.

---

## Data Flow

```
User types → SearchBar debounce → searchTerms() → results = []
  → TermSearchResults renders empty state
  → TermForm (compact, defaultTerm=q) shown

User clicks Explain
  → TermForm: addPendingTerm, disable button, call explainTerm()
  → explainTerm() resolves → resolveTermResult() → onExplainComplete()
  → SearchBar.refreshSearch() → searchTerms() → results = [newTerm]
  → TermSearchResults renders TermCard for new term
```

---

## Error Handling

- If `explainTerm()` rejects: `rejectTermResult()` is called (existing behaviour); `onExplainComplete` is **not** called (no point re-fetching a failed explanation)
- The Explain button is disabled while the form is submitting (TanStack Form's `form.state.isSubmitting`)

---

## Out of Scope

- Multiple mode in compact form
- Auto-closing the dropdown after explain completes
- Showing `TermResult` inline in the dropdown (result appears only as a search card after re-fetch)
