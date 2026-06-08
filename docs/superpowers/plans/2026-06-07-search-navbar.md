# Search Bar & Hamburger Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global search bar to the navbar and replace all nav links with a floating hamburger dropdown; show search results as a 2-column card grid with inline Research chat.

**Architecture:** `SearchBar.tsx` handles input and URL navigation; `NavMenu.tsx` is simplified to hamburger-only with a floating right-anchored dropdown; `TermSearchResults.tsx` renders the card grid when `q` is non-empty; `TermsTable` delegates to `TermSearchResults` when a query is active.

**Tech Stack:** Next.js App Router, React (`useState`, `useTransition`, `useSearchParams`, `useRouter`), Tailwind CSS, existing server actions (`createAttempt`, `askQuestion`)

---

## File Map

| File | Change |
|---|---|
| `components/SearchBar.tsx` | **Create** — search input, navigates to `/terms?q=…`, syncs from URL |
| `components/NavMenu.tsx` | **Modify** — remove desktop links, make hamburger always visible, floating dropdown |
| `app/layout.tsx` | **Modify** — add `SearchBar` between logo and `NavMenu` |
| `components/TermSearchResults.tsx` | **Create** — 2-col card grid with inline Research chat |
| `components/TermsTable.tsx` | **Modify** — render `TermSearchResults` when `currentQ` is non-empty |

---

## Task 1: SearchBar component

**Files:**
- Create: `components/SearchBar.tsx`

- [ ] **Step 1: Create `components/SearchBar.tsx`**

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export function SearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get('q') ?? '');

  useEffect(() => {
    setValue(searchParams.get('q') ?? '');
  }, [searchParams]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) {
      router.push(`/terms?q=${encodeURIComponent(trimmed)}`);
    } else {
      router.push('/terms');
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 min-w-[120px] max-w-[280px] w-[30%]"
    >
      <svg
        className="shrink-0 text-zinc-400 dark:text-zinc-500"
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search terms…"
        className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none min-w-0"
      />
    </form>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/aalmacin/Projects/daily-learning-worktree/move-description-to-research && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors related to `SearchBar.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/SearchBar.tsx
git commit -m "feat: add SearchBar component"
```

---

## Task 2: Update layout to include SearchBar

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Add SearchBar to the header in `app/layout.tsx`**

Replace the header inner div:

```tsx
// Before
<div className="max-w-6xl mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-2">
  <Link href="/" className="text-base md:text-lg font-semibold text-zinc-900 dark:text-zinc-50 hover:opacity-80 transition-opacity shrink-0">
    DailyLearning
  </Link>
  {user && <NavMenu />}
</div>
```

```tsx
// After
import { SearchBar } from "@/components/SearchBar";
import { Suspense } from "react";

// ...

<div className="max-w-6xl mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center gap-3">
  <Link href="/" className="text-base md:text-lg font-semibold text-zinc-900 dark:text-zinc-50 hover:opacity-80 transition-opacity shrink-0">
    DailyLearning
  </Link>
  {user && (
    <>
      <div className="flex-1" />
      <Suspense>
        <SearchBar />
      </Suspense>
      <NavMenu />
    </>
  )}
</div>
```

Note: `SearchBar` uses `useSearchParams()` which requires a `Suspense` boundary in the layout.

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Manual check — start dev server and verify navbar shows search bar**

```bash
npm run dev
```

Open the app. When logged in, the navbar should show: `DailyLearning [spacer] [search input] [hamburger]`. Typing in the search bar and pressing Enter should navigate to `/terms?q=<value>`. The search bar should pre-fill when already on `/terms?q=<value>`.

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: add SearchBar to navbar layout"
```

---

## Task 3: Refactor NavMenu to always-visible hamburger with floating dropdown

**Files:**
- Modify: `components/NavMenu.tsx`

- [ ] **Step 1: Replace `NavMenu.tsx` entirely**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { signOut } from '@/actions/auth';

const NAV_LINKS = [
  { href: '/terms', label: 'Terms' },
  { href: '/term-list', label: 'Term List' },
  { href: '/flashcards', label: 'Flashcards' },
  { href: '/categories', label: 'Categories' },
  { href: '/settings', label: 'Settings' },
] as const;

export default function NavMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="flex flex-col justify-center items-center w-8 h-8 gap-1.5"
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
      >
        <span className={`block w-5 h-0.5 bg-zinc-600 dark:bg-zinc-400 transition-transform duration-200 ${isOpen ? 'translate-y-2 rotate-45' : ''}`} />
        <span className={`block w-5 h-0.5 bg-zinc-600 dark:bg-zinc-400 transition-opacity duration-200 ${isOpen ? 'opacity-0' : ''}`} />
        <span className={`block w-5 h-0.5 bg-zinc-600 dark:bg-zinc-400 transition-transform duration-200 ${isOpen ? '-translate-y-2 -rotate-45' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-44 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg z-50 overflow-hidden">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setIsOpen(false)}
              className="block px-4 py-2.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors border-b border-zinc-100 dark:border-zinc-800 last:border-0"
            >
              {label}
            </Link>
          ))}
          <form action={signOut}>
            <button
              type="submit"
              onClick={() => setIsOpen(false)}
              className="w-full text-left px-4 py-2.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors border-t border-zinc-100 dark:border-zinc-800"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Manual check — hamburger works on all screen sizes**

Resize the browser from mobile to desktop width. The hamburger should be visible at all widths (no inline links on desktop). Clicking it should open a compact floating dropdown anchored to the right. Clicking outside should close it.

- [ ] **Step 4: Commit**

```bash
git add components/NavMenu.tsx
git commit -m "feat: replace desktop nav links with always-visible hamburger dropdown"
```

---

## Task 4: TermSearchResults card grid component

**Files:**
- Create: `components/TermSearchResults.tsx`

- [ ] **Step 1: Create `components/TermSearchResults.tsx` with card grid (no chat yet)**

```tsx
'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import type { Term, ChatMessage, ConceptRefinement } from '@/lib/db';
import { createAttempt } from '@/actions/refinements';
import { askQuestion } from '@/actions/chat';

type Props = {
  terms: Term[];
  q: string;
};

type ChatState = {
  refinementId: number;
  messages: ChatMessage[];
};

function PriorityBadge({ priority }: { priority: Term['priority'] }) {
  const styles: Record<Term['priority'], string> = {
    High: 'text-cyan-700 bg-cyan-50 border-cyan-200 dark:text-cyan-300 dark:bg-cyan-950 dark:border-cyan-800',
    Medium: 'text-yellow-700 bg-yellow-50 border-yellow-200 dark:text-yellow-300 dark:bg-yellow-950 dark:border-yellow-800',
    Low: 'text-zinc-600 bg-zinc-100 border-zinc-200 dark:text-zinc-400 dark:bg-zinc-800 dark:border-zinc-700',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border whitespace-nowrap ${styles[priority]}`}>
      {priority}
    </span>
  );
}

function ResearchChat({ term, onClose }: { term: Term; onClose: () => void }) {
  const [chat, setChat] = useState<ChatState | null>(null);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question) return;
    setInput('');
    setError(null);

    startTransition(async () => {
      try {
        if (!chat) {
          const refinement: ConceptRefinement = await createAttempt(term.id);
          const messages = await askQuestion(refinement.id, question);
          setChat({ refinementId: refinement.id, messages });
        } else {
          const messages = await askQuestion(chat.refinementId, question);
          setChat((prev) => prev ? { ...prev, messages } : prev);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
        setInput(question);
      }
    });
  }

  return (
    <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Research</span>
      </div>
      {chat && chat.messages.length > 0 && (
        <div className="px-3 py-2 flex flex-col gap-2 max-h-64 overflow-y-auto">
          {chat.messages.map((msg) => (
            <div
              key={msg.id}
              className={`text-xs rounded-lg px-3 py-2 max-w-[80%] leading-relaxed ${
                msg.role === 'user'
                  ? 'self-end bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200'
                  : 'self-start bg-cyan-50 dark:bg-cyan-950 text-cyan-900 dark:text-cyan-100'
              }`}
            >
              {msg.content}
            </div>
          ))}
        </div>
      )}
      {error && (
        <p className="px-3 py-1 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      <form onSubmit={handleSubmit} className="px-3 py-2 border-t border-zinc-100 dark:border-zinc-800 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Ask about ${term.name}…`}
          disabled={isPending}
          className="flex-1 px-2.5 py-1.5 text-xs border border-zinc-200 dark:border-zinc-700 rounded-md bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!input.trim() || isPending}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? '…' : 'Ask'}
        </button>
      </form>
    </div>
  );
}

function TermCard({ term }: { term: Term }) {
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <div className={`flex flex-col border rounded-lg overflow-hidden bg-white dark:bg-zinc-900 transition-colors ${
      chatOpen
        ? 'col-span-2 border-cyan-500 dark:border-cyan-600'
        : 'border-zinc-200 dark:border-zinc-800'
    }`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-50 flex-1">{term.name}</span>
        {term.explained && (
          <span className="text-xs text-green-700 bg-green-50 border border-green-200 dark:text-green-300 dark:bg-green-950 dark:border-green-800 px-2 py-0.5 rounded-full whitespace-nowrap">
            ✓ Explained
          </span>
        )}
        <PriorityBadge priority={term.priority} />
      </div>

      {/* Body */}
      <div className={`flex flex-col gap-3 flex-1 ${chatOpen ? 'px-[30%] py-4' : 'px-4 py-3'}`}>
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{term.content}</p>

        {chatOpen && (
          <ResearchChat term={term} onClose={() => setChatOpen(false)} />
        )}

        {term.categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {term.categories.map((cat) => (
              <span
                key={cat}
                className="text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-2 py-0.5 rounded-full"
              >
                {cat}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="px-4 py-2 border-t border-zinc-100 dark:border-zinc-800 flex gap-2">
        <button
          type="button"
          onClick={() => setChatOpen((o) => !o)}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
            chatOpen
              ? 'border-cyan-500 bg-cyan-50 text-cyan-700 dark:border-cyan-600 dark:bg-cyan-950 dark:text-cyan-300'
              : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
          }`}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Ask
        </button>
        <Link
          href={`/terms/${term.id}`}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-medium transition-colors"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
          View
        </Link>
      </div>
    </div>
  );
}

export function TermSearchResults({ terms, q }: Props) {
  if (terms.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        No terms found for &ldquo;{q}&rdquo;.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {terms.length} result{terms.length !== 1 ? 's' : ''} for &ldquo;{q}&rdquo;
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {terms.map((term) => (
          <TermCard key={term.id} term={term} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/TermSearchResults.tsx
git commit -m "feat: add TermSearchResults card grid with inline Research chat"
```

---

## Task 5: Wire TermsTable to show TermSearchResults when q is active

**Files:**
- Modify: `components/TermsTable.tsx`

- [ ] **Step 1: Import `TermSearchResults` at the top of `TermsTable.tsx`**

Add after the existing imports:

```tsx
import { TermSearchResults } from '@/components/TermSearchResults';
```

- [ ] **Step 2: Add early return for search mode inside `TermsTable`**

Find the `return (` at the top of the TermsTable JSX (around line 490 after the `syncDbError` checks). Add an early return for search mode right before the existing `return`:

```tsx
if (currentQ) {
  return (
    <div className="space-y-4">
      <TermSearchResults terms={terms} q={currentQ} />
    </div>
  );
}
```

The full `return` statement after this remains unchanged — it handles the table view when no query is active.

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Manual check — end-to-end flow**

1. Open the app and log in
2. Type a term name into the navbar search bar and press Enter → should navigate to `/terms?q=<value>`
3. Results should appear as a 2-column card grid (1 column on mobile)
4. Each card shows: name, Explained badge (if applicable), priority, full description, categories
5. Click **Ask** → chat box appears inline between description and categories with 30% horizontal padding; card expands to span both columns
6. Type a question and submit → should show AI response below
7. Click **Ask** again → chat collapses
8. Click **View** → navigates to `/terms/<id>`
9. Clear the search (navigate to `/terms`) → existing table layout is shown unchanged
10. Hamburger menu opens a compact floating dropdown on all screen sizes (desktop and mobile)

- [ ] **Step 5: Commit**

```bash
git add components/TermsTable.tsx
git commit -m "feat: show search result cards when query is active"
```

---

## Self-Review

**Spec coverage:**
- ✅ Navbar: `Logo | spacer | SearchBar | NavMenu` — Task 1 + 2
- ✅ SearchBar: proportional width, right-aligned, pre-fills from URL — Task 1
- ✅ Hamburger: always visible, floating right-anchored dropdown, click-outside dismisses — Task 3
- ✅ Card grid: 2 columns md+, 1 column mobile — Task 4
- ✅ Card anatomy: name, Explained badge, priority badge, full description, categories, Ask/View footer — Task 4
- ✅ Ask button: toggles inline Research chat, highlighted when open — Task 4
- ✅ Expanded card: `col-span-2` + `px-[30%]` — Task 4 (`TermCard` applies both when `chatOpen`)
- ✅ Inline Research chat: Research label, message history, input + Ask, calls `createAttempt` then `askQuestion` — Task 4
- ✅ View button: Link to `/terms/${term.id}` — Task 4
- ✅ Table unchanged when `q` is empty — Task 5 (early return only fires when `currentQ` truthy)
- ✅ Dark mode: zinc palette used throughout — Task 3 + 4

**Placeholder scan:** No TBDs or TODOs found.

**Type consistency:**
- `Term`, `ChatMessage`, `ConceptRefinement` all imported from `@/lib/db` — consistent throughout
- `createAttempt(term.id)` matches signature `createAttempt(termId: number): Promise<ConceptRefinement>` ✅
- `askQuestion(refinement.id, question)` matches signature `askQuestion(refinementId: number, question: string): Promise<ChatMessage[]>` ✅
