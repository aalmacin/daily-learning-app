# Homepage Category Multi-Select Design

**Date:** 2026-05-20

## Problem

On the search term result (homepage), all available categories are shown as inline toggleable pills. This becomes cluttered when there are many categories and doesn't match the dropdown multi-select pattern used for filtering on the terms page.

## Goal

Replace the inline pill toggles in `DoneTermCard` with:
- Static pills displaying only the selected categories
- A dropdown button that opens a searchable checkbox multi-select for editing

## Design

### Shared Component: `CategoryMultiSelectDropdown`

Extract `CategoryFilterDropdown` from `TermsTable.tsx` into a new file `components/CategoryMultiSelectDropdown.tsx`.

**Props:**
```ts
type CategoryMultiSelectDropdownProps = {
  categories: string[];
  selected: string[];
  onChange: (cats: string[]) => void;
  disabled?: boolean;
};
```

No label or button text changes — existing button label logic (`"X categories"` / `"Categories"`) is preserved as-is.

### `TermsTable.tsx`

Remove the inline `CategoryFilterDropdown` component definition and import from `CategoryMultiSelectDropdown`.

### `DoneTermCard` in `TermResult.tsx`

Replace the current section that maps `allCategories` to toggleable pills with:

1. **Selected categories pills** — read-only display of `term.categories`, rendered as static pills (same visual style as the currently-selected state: dark filled pill).
2. **`CategoryMultiSelectDropdown`** — wired to `categoryMutation`, `disabled` when `categoryMutation.isPending`.

```
[ JavaScript ] [ React ]   [Categories ▾]
```

If no categories are selected, only the dropdown button appears (no pills).

## Files Changed

| File | Change |
|------|--------|
| `components/CategoryMultiSelectDropdown.tsx` | New — extracted from `TermsTable.tsx` |
| `components/TermsTable.tsx` | Import `CategoryMultiSelectDropdown`, remove local definition |
| `components/TermResult.tsx` | Replace inline pill toggles with pills + `CategoryMultiSelectDropdown` |

## Non-Goals

- No change to the terms page category editing (`CategoryEditor` in expanded rows)
- No change to category data fetching or mutation logic
