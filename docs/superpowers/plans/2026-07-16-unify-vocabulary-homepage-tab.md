# Plan: Unify the homepage "Vocabulary" tab with the /vocabulary page

## Context

`app/vocabulary/page.tsx` renders a heading + Flashcards link, `VocabularyForm`,
and `VocabularyList` (fed with server-fetched `initialWords`). The homepage's
`AddPanel.tsx` "Vocabulary" tab currently renders a different, thinner
composition: `VocabularyForm` + the transient `VocabularyResult` card (no
persistent list, no search, no Flashcards link). The user wants these to be
identical — the homepage tab should show exactly what `/vocabulary` shows,
not a separate reduced experience.

## Global Constraints

- Extract the `/vocabulary` page's inner content (heading + Flashcards link +
  `VocabularyForm` + `VocabularyList`) into one shared component so both
  places render literally the same markup/behavior and can't drift apart
  again. Do not duplicate the JSX.
- `app/page.tsx` (homepage) currently has no auth check and renders `AddPanel`
  unconditionally — do not add a `redirect('/login')` there, that would
  change existing behavior for unauthenticated visits to `/`. Fetch vocabulary
  words only when a user is present; pass `[]` otherwise.
- `VocabularyResult.tsx` becomes unused once `AddPanel` no longer renders it
  (grep confirms its only other usages, in `VocabularyForm.tsx`'s
  `resolveVocabResult`/`rejectVocabResult` calls, are in the store, not in
  this component) — delete the file rather than leaving dead code. Confirm
  with a repo-wide grep for `VocabularyResult` before deleting.
- The new shared component takes `initialWords: VocabularyWord[]` as a prop
  (data fetching stays in the Server Component page/layout that renders it,
  matching the existing `/vocabulary` page pattern) — it does not fetch data
  itself.
- Run `npx tsc --noEmit`, `npm run lint`, and `npm run build` (compare
  against the current baseline: one pre-existing unrelated `lib/db.ts:156`
  type error, and one pre-existing unrelated `react-hooks/set-state-in-effect`
  lint finding already adjudicated — do not treat either as newly introduced
  unless the diff shows otherwise).

## Task 1: Extract shared VocabularyPageContent and use it in both places

**Files:** `components/VocabularyPageContent.tsx` (new), `app/vocabulary/page.tsx`,
`app/page.tsx`, `components/AddPanel.tsx`, `components/VocabularyResult.tsx` (delete)

**Steps:**

1. Create `components/VocabularyPageContent.tsx` — a plain (non-`'use client'`)
   component taking `{ initialWords: VocabularyWord[] }`, rendering exactly
   what `app/vocabulary/page.tsx` currently renders inside its
   `max-w-2xl mx-auto flex flex-col gap-8` wrapper: the "Vocabulary" heading +
   "Flashcards" link row, `<VocabularyForm />`, `<VocabularyList initialWords={initialWords} />`.

2. `app/vocabulary/page.tsx`: keep the outer page wrapper (background,
   padding, `min-h-screen`, `max-w-2xl mx-auto`) and the `getCurrentUser`/
   `redirect('/login')`/`getVocabularyWords` fetch as-is; replace the inner
   heading+link+form+list block with `<VocabularyPageContent initialWords={words} />`.

3. `app/page.tsx`: make `Home` an async Server Component. Fetch
   `const user = await getCurrentUser()`, then
   `const words = user ? await getVocabularyWords(user.id) : []`. Pass
   `initialVocabWords={words}` to `<AddPanel />`.

4. `components/AddPanel.tsx`: accept a new prop `initialVocabWords: VocabularyWord[]`.
   Replace the `vocabulary` tab branch (`<VocabularyForm />` + `<VocabularyResult />`)
   with `<VocabularyPageContent initialWords={initialVocabWords} />`. Remove the
   now-unused `VocabularyForm`/`VocabularyResult` imports (VocabularyForm is
   used inside VocabularyPageContent now, not directly in AddPanel).

5. Grep the repo for `VocabularyResult` to confirm no remaining references,
   then delete `components/VocabularyResult.tsx`.

**Verification:** `npx tsc --noEmit`, `npm run lint`, `npm run build` per the
Global Constraints baseline comparison. Manually reason through: visiting `/`
and clicking the Vocabulary tab renders the same heading, Flashcards link,
form, search box, tabs, and word list as visiting `/vocabulary` directly, for
both logged-in (real words) and logged-out (empty list) cases.

**Report:** DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED per the
implementer contract.

## Task 2: Keep the global slide-out "Add" panel lightweight

**Context:** Task 1's implementer found a third `AddPanel` consumer not
scoped in Task 1: `components/SearchPanel.tsx` (a global slide-out "Add"
dialog, opened from anywhere, rendered in `app/layout.tsx` only when a user
is logged in) also renders `<AddPanel />`. Task 1 made `initialVocabWords`
optional (defaulting to `[]`) to avoid a type error there, which means that
slide-out's Vocabulary tab now shows the full heading, Flashcards link, and
persisted list — but the list is always empty since no real data reaches it,
which is misleading for a user who already has words saved. The user decided
(2026-07-16): keep this slide-out lightweight — restore its original
form-only quick-add experience (no full list/search/Flashcards link), while
`/vocabulary` and the homepage tab remain unified per Task 1.

**Files:** `components/AddPanel.tsx`, `components/SearchPanel.tsx`,
`components/VocabularyResult.tsx` (restore — was deleted in Task 1, `git show
34e1fb2^:components/VocabularyResult.tsx` has the original content)

**Steps:**

1. Restore `components/VocabularyResult.tsx` to its pre-Task-1 content (`git
   show 34e1fb2^:components/VocabularyResult.tsx > components/VocabularyResult.tsx`
   or equivalent) — it's needed again for the compact quick-add path.

2. `components/AddPanel.tsx`: add a `compactVocabulary?: boolean` prop
   (default `false`). When the `vocabulary` tab is active: if
   `compactVocabulary` is true, render `<VocabularyForm />` + `<VocabularyResult />`
   (the original thin composition); otherwise (default) render
   `<VocabularyPageContent initialWords={initialVocabWords} />` as Task 1 set
   up. Re-add the `VocabularyForm`/`VocabularyResult` imports needed for the
   compact branch.

3. `components/SearchPanel.tsx`: pass `compactVocabulary` to `<AddPanel />`.

4. `app/page.tsx` (homepage) and its `<AddPanel initialVocabWords={words} />`
   call stay unchanged — homepage keeps the full experience from Task 1.

**Global Constraints (in addition to the ones above):**
- `/vocabulary` and the homepage Vocabulary tab must still render identically
  — do not touch `app/vocabulary/page.tsx`, `app/page.tsx`, or
  `VocabularyPageContent.tsx`'s behavior for those two surfaces.
- Only `SearchPanel`'s usage of `AddPanel` should end up with the compact
  (form + transient result) experience.

**Verification:** `npx tsc --noEmit`, `npm run lint`, `npm run build` against
the same baseline as Task 1. Manually reason through: the global slide-out
("Add" panel, any page, logged in) Vocabulary tab shows the original
form-only quick-add UI again; `/vocabulary` and the homepage tab are
unaffected and still match each other exactly.

**Report:** DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED per the
implementer contract.
