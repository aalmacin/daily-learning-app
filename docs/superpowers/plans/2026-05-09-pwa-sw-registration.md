# PWA Service Worker Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `dangerouslySetInnerHTML` service worker registration script in `layout.tsx` with a dedicated client component.

**Architecture:** A single `'use client'` component handles SW registration on mount via `useEffect`. It renders nothing in the UI. The layout imports and renders it alongside `<Providers>`.

**Tech Stack:** Next.js 16 App Router, TypeScript

---

### Task 1: Create ServiceWorkerRegistration component

**Files:**
- Create: `components/ServiceWorkerRegistration.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .catch((err) => console.error('Service worker registration failed:', err));
    }
  }, []);

  return null;
}
```

- [ ] **Step 2: Verify the file exists**

Run: `ls components/ServiceWorkerRegistration.tsx`
Expected: file listed with no error

---

### Task 2: Update layout.tsx to use the component

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Replace the inline script**

In `app/layout.tsx`:

1. Add import after existing imports:
```tsx
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration';
```

2. Replace this block:
```tsx
<script
  dangerouslySetInnerHTML={{
    __html: `if ('serviceWorker' in navigator) { window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js')); }`,
  }}
/>
```

With:
```tsx
<ServiceWorkerRegistration />
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add components/ServiceWorkerRegistration.tsx app/layout.tsx
git commit -m "refactor: move SW registration to client component"
```
