# Context Persistence & Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retain the context field value after term submission and show previously submitted contexts as native datalist suggestions.

**Architecture:** A `useRecentContexts` hook encapsulates all localStorage logic. `TermForm` uses the hook to persist the context field and render a shared `<datalist>` for both single and multiple modes. Form reset is replaced with targeted field clears so only the term/terms field is wiped on submit.

**Tech Stack:** React 19, TanStack Form v1, localStorage, native HTML datalist

---

### Task 1: Create `useRecentContexts` hook

**Files:**
- Create: `lib/useRecentContexts.ts`

- [ ] **Step 1: Create the hook file**

```typescript
'use client'

import { useState, useCallback } from 'react'

const STORAGE_KEY = 'recent-contexts'
const MAX_ENTRIES = 10

function readFromStorage(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function writeToStorage(entries: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // localStorage unavailable (e.g. SSR or private mode)
  }
}

export function useRecentContexts() {
  const [recentContexts, setRecentContexts] = useState<string[]>(() => readFromStorage())

  const saveContext = useCallback((context: string) => {
    const trimmed = context.trim()
    if (!trimmed) return
    setRecentContexts((prev) => {
      const filtered = prev.filter((c) => c.toLowerCase() !== trimmed.toLowerCase())
      const updated = [trimmed, ...filtered].slice(0, MAX_ENTRIES)
      writeToStorage(updated)
      return updated
    })
  }, [])

  return { recentContexts, saveContext }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/useRecentContexts.ts
git commit -m "feat: add useRecentContexts hook for localStorage-backed context suggestions"
```

---

### Task 2: Update `TermForm` to persist context and show suggestions

**Files:**
- Modify: `components/TermForm.tsx`

- [ ] **Step 1: Import `useRecentContexts` and call it at the top of the component**

Replace the top of `TermForm`:
```typescript
import { useRecentContexts } from '@/lib/useRecentContexts'

export function TermForm() {
  const [mode, setMode] = useState<Mode>('single')
  const { recentContexts, saveContext } = useRecentContexts()
```

- [ ] **Step 2: Update `singleForm.onSubmit` to preserve context**

Replace the `onSubmit` handler of `singleForm`:
```typescript
onSubmit: async ({ value }) => {
  const name = value.termName.trim().toLowerCase()
  addPendingTerm(name)
  saveContext(value.context)
  singleForm.setFieldValue('termName', '')
  explainTerm(value.termName, value.context || undefined)
    .then((term) => resolveTermResult(name, term))
    .catch((e) => rejectTermResult(name, e instanceof Error ? e.message : 'Something went wrong'))
},
```

- [ ] **Step 3: Update `multipleForm.onSubmit` to preserve context**

Replace the `onSubmit` handler of `multipleForm`:
```typescript
onSubmit: async ({ value }) => {
  const terms = value.terms
    .split('\n')
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
  if (terms.length === 0) return
  const names = terms.map((t) => t.toLowerCase())
  addPendingTerms(names)
  saveContext(value.context)
  multipleForm.setFieldValue('terms', '')
  terms.forEach((termName) => {
    const name = termName.toLowerCase()
    explainTerm(termName, value.context || undefined)
      .then((term) => resolveTermResult(name, term))
      .catch((e) => rejectTermResult(name, e instanceof Error ? e.message : 'Something went wrong'))
  })
},
```

- [ ] **Step 4: Add `list` attribute to both context inputs and render the shared datalist**

In the single mode context `<input>`, add `list="recent-contexts-list"`:
```tsx
<input
  id={field.name}
  name={field.name}
  value={field.state.value}
  onChange={(e) => field.handleChange(e.target.value)}
  onBlur={field.handleBlur}
  placeholder="e.g. Kubernetes, AWS, React"
  list="recent-contexts-list"
  className={inputClass}
/>
```

In the multiple mode context `<input>`, add `list="recent-contexts-list"`:
```tsx
<input
  id={field.name}
  name={field.name}
  value={field.state.value}
  onChange={(e) => field.handleChange(e.target.value)}
  onBlur={field.handleBlur}
  placeholder="e.g. Kubernetes, AWS, React"
  list="recent-contexts-list"
  className={inputClass}
/>
```

Add the shared datalist just before the closing `</div>` of the outer wrapper:
```tsx
      <datalist id="recent-contexts-list">
        {recentContexts.map((ctx) => (
          <option key={ctx} value={ctx} />
        ))}
      </datalist>
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add components/TermForm.tsx
git commit -m "feat: persist context field after submission and show recent context suggestions"
```
