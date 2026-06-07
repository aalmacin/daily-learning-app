# Global Search FAB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent FAB (logged-in users only) to every page that opens a right slide-in panel containing TermForm + TermResult.

**Architecture:** A new `searchStore` holds open/close state. `GlobalSearch` (always mounted client component) renders `SearchFAB` + `SearchPanel` and is placed inside `<Providers>` in the root layout so `TermResult`'s React Query calls remain scoped correctly. The panel never unmounts, preserving local form state across toggle cycles.

**Tech Stack:** Next.js App Router, TanStack Store (`@tanstack/store`), TanStack React Query, Tailwind CSS

---

## File Structure

**Create:**
- `store/searchStore.ts` — open/close state + actions
- `components/SearchFAB.tsx` — fixed bottom-right toggle button
- `components/SearchPanel.tsx` — always-mounted slide-in panel with TermForm + TermResult
- `components/GlobalSearch.tsx` — thin wrapper rendered in layout

**Modify:**
- `app/layout.tsx` — add `{user && <GlobalSearch />}` inside `<Providers>`

---

### Task 1: Create searchStore

**Files:**
- Create: `store/searchStore.ts`

- [ ] **Step 1: Create the store**

```ts
import { Store } from '@tanstack/store'

interface SearchState {
  isOpen: boolean
}

export const searchStore = new Store<SearchState>({ isOpen: false })

export function openSearch() {
  searchStore.setState(() => ({ isOpen: true }))
}

export function closeSearch() {
  searchStore.setState(() => ({ isOpen: false }))
}

export function toggleSearch() {
  searchStore.setState((state) => ({ isOpen: !state.isOpen }))
}
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add store/searchStore.ts
git commit -m "feat: add searchStore for global search panel state"
```

---

### Task 2: Create SearchFAB

**Files:**
- Create: `components/SearchFAB.tsx`

- [ ] **Step 1: Create the component**

`z-[60]` keeps the FAB above the panel (`z-50`) so it remains clickable even when the panel is open and covers the same corner.

```tsx
'use client'

import { useStore } from '@tanstack/react-store'
import { searchStore, toggleSearch } from '@/store/searchStore'

export function SearchFAB() {
  const isOpen = useStore(searchStore, (state) => state.isOpen)

  return (
    <button
      type="button"
      onClick={toggleSearch}
      aria-label={isOpen ? 'Close search' : 'Open search'}
      className="fixed bottom-6 right-6 z-[60] flex h-[52px] w-[52px] items-center justify-center rounded-full bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 shadow-lg hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
    >
      {isOpen ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      )}
    </button>
  )
}
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add components/SearchFAB.tsx
git commit -m "feat: add SearchFAB component"
```

---

### Task 3: Create SearchPanel

**Files:**
- Create: `components/SearchPanel.tsx`

- [ ] **Step 1: Create the component**

The backdrop is `pointer-events-none` on `sm+` so the page stays interactive on desktop. On mobile it is clickable and closes the panel. The panel is always in the DOM — `translate-x-full` hides it off-screen without unmounting.

```tsx
'use client'

import { useEffect } from 'react'
import { useStore } from '@tanstack/react-store'
import { searchStore, closeSearch } from '@/store/searchStore'
import { TermForm } from '@/components/TermForm'
import { TermResult } from '@/components/TermResult'

export function SearchPanel() {
  const isOpen = useStore(searchStore, (state) => state.isOpen)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSearch()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <>
      <div
        aria-hidden="true"
        onClick={closeSearch}
        className={`fixed inset-0 z-40 bg-black/20 transition-opacity duration-300 sm:pointer-events-none ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      <div
        role="dialog"
        aria-label="Explain a term"
        aria-modal={isOpen}
        className={`fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[65vw] bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <span className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Explain a Term</span>
          <button
            type="button"
            onClick={closeSearch}
            aria-label="Close search panel"
            className="rounded-lg p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-8 px-6">
          <div className="max-w-2xl mx-auto flex flex-col gap-8">
            <TermForm />
            <TermResult />
          </div>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add components/SearchPanel.tsx
git commit -m "feat: add SearchPanel slide-in component"
```

---

### Task 4: Create GlobalSearch wrapper

**Files:**
- Create: `components/GlobalSearch.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { SearchFAB } from '@/components/SearchFAB'
import { SearchPanel } from '@/components/SearchPanel'

export function GlobalSearch() {
  return (
    <>
      <SearchFAB />
      <SearchPanel />
    </>
  )
}
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add components/GlobalSearch.tsx
git commit -m "feat: add GlobalSearch wrapper component"
```

---

### Task 5: Wire GlobalSearch into layout

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Add import**

Add at the top of `app/layout.tsx` with the other component imports:

```tsx
import { GlobalSearch } from '@/components/GlobalSearch'
```

- [ ] **Step 2: Add GlobalSearch inside Providers**

Change:

```tsx
<Providers>{children}</Providers>
```

To:

```tsx
<Providers>
  {children}
  {user && <GlobalSearch />}
</Providers>
```

- [ ] **Step 3: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Start dev server and verify visually**

Run: `npm run dev`

Check each of these manually:
1. Log in — FAB (search icon) appears fixed at bottom-right on every page
2. Click FAB — panel slides in from right, panel is 65vw wide on desktop, FAB icon becomes ✕
3. Press Escape — panel slides out, FAB returns to search icon
4. Click FAB again — panel reopens with the same form values still in the fields
5. Type something in the Term field, close panel, reopen — text is still there
6. Submit a term in the panel — result appears inside the panel
7. On mobile viewport — panel is full-width; tapping the backdrop (dimmed area left of panel) closes it
8. Log out — FAB is gone

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: wire GlobalSearch into root layout for logged-in users"
```
