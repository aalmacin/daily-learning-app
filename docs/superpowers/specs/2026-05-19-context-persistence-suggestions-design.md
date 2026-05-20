# Context Persistence & Suggestions in TermForm

## Summary

After a term submission, the context field retains its value so users can submit multiple terms under the same context without retyping. When the context field is focused, recently submitted contexts are suggested via a native `<datalist>`.

## Affected File

`components/TermForm.tsx` only. No store or database changes required.

## Behavior

### Context persistence
- On submit, only the term name field (or terms textarea in multiple mode) is cleared.
- The context field is left untouched, retaining its value for the next submission.

### Recently used contexts
- A `useRecentContexts` hook manages a string array in `localStorage` under the key `recent-contexts`.
- A context value is added to the list **only when the form is submitted** with a non-empty context. Typing without submitting does not add to the list.
- Maximum 10 entries; newest first. Duplicates are de-duped before insertion (trimmed, case-insensitive comparison).
- The context `<input>` in both single and multiple modes is linked to a `<datalist>` via `list="recent-contexts-list"`.
- The datalist renders one `<option>` per stored context. The browser shows all options immediately on focus and filters as the user types.

## Data Flow

```
User submits form
  → context value saved to localStorage (if non-empty, de-duped, max 10)
  → term name / terms textarea cleared
  → context field value preserved
  → datalist updated with new localStorage state
```

## Implementation Constraints

- Use `singleForm.setFieldValue('termName', '')` and `multipleForm.setFieldValue('terms', '')` instead of `form.reset()` to avoid clearing context.
- The datalist element is rendered once outside both form branches and shared between modes.
- The hook reads from localStorage on mount and writes on each submission.
