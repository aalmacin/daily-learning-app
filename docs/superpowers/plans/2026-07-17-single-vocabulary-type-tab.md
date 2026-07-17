# Plan: One Words/Idioms tab bar instead of two on the vocabulary page

## Context

On `/vocabulary` (and the homepage's unified Vocabulary tab, both rendered via
`VocabularyPageContent`), there are currently two independent tab switchers:
`VocabularyForm` has its own Word/Idiom tabs (controls what type gets
submitted), and `VocabularyList` has its own separate Words/Idioms tabs
further down (controls what's displayed). They're disconnected — switching
one doesn't affect the other, which is confusing. The user wants a single
Words/Idioms tab bar at the very top of the page that drives both: the
form submits using the selected type, and the list is filtered to it.

## Global Constraints

- `VocabularyList` is only ever rendered from `VocabularyPageContent` (verified
  via repo-wide grep) — safe to make its tab state fully parent-controlled
  with no backward-compat/uncontrolled fallback needed.
- `VocabularyForm` has other consumers that must keep their own independent
  type tabs unchanged: `components/VocabularySearchResults.tsx` (compact,
  two call sites) and `components/AddPanel.tsx`'s `compactVocabulary` branch
  (the global slide-out "Add" panel, kept intentionally lightweight in a
  prior task — do not touch that surface's behavior). Give `VocabularyForm`
  an optional controlled `type` prop: when passed, hide its internal tab UI
  and use the prop instead of internal state; when omitted, behave exactly
  as it does today (internal state + visible tabs). Do not change the
  uncontrolled behavior in any way.
- The unified tab bar must keep showing live per-type counts (e.g.
  "Words (12)"), matching what `VocabularyList`'s tabs show today — including
  updating immediately when a word is added or removed, not just on reload.
  `VocabularyList` already owns the authoritative `words` state (including
  the live merge-on-add logic from a prior task) — do not move that state or
  the merge `useEffect` out of `VocabularyList`; instead have it report counts
  up via a callback prop so the parent can render them in the new top-level
  tab bar.
- Do not touch `store/vocabStore.ts`, `actions/vocabulary.ts`, or the
  pending/error row rendering/merge logic in `VocabularyList.tsx` — this task
  is purely about consolidating the two tab UIs into one, not about the
  add/merge pipeline.
- Run `npx tsc --noEmit`, `npm run lint`, `npm run build` and compare against
  the current baseline (one pre-existing `lib/db.ts:156` tsc error, one
  pre-existing/adjudicated `react-hooks/set-state-in-effect` lint error in
  `VocabularyList.tsx`) — don't treat either as newly introduced unless the
  diff shows otherwise.

## Task 1: Lift the type tab to VocabularyPageContent, drive form + list from it

**Files:** `components/VocabularyForm.tsx`, `components/VocabularyList.tsx`,
`components/VocabularyPageContent.tsx`

**Steps:**

1. `components/VocabularyForm.tsx`: add an optional `type?: WordType` prop.
   Inside the component, derive the working type as
   `const type = controlledType ?? internalType` (rename the existing
   `useState<WordType>('word')` to `internalType`/`setInternalType`). When
   `type` prop is provided (controlled), don't render the `typeTabs` JSX
   block (render `null` in its place) — the label above the textarea and the
   placeholder text should still reflect the active `type` as they do today,
   just driven by the (now possibly external) `type` value. When the prop is
   omitted, behavior must be identical to today (internal state, visible
   tabs, uncontrolled).

2. `components/VocabularyList.tsx`: replace the internal
   `const [activeTab, setActiveTab] = useState<'word' | 'idiom'>('word')` and
   its "Tabs" JSX block with a required prop `activeTab: 'word' | 'idiom'`.
   Remove the Tabs markup entirely from this component (it moves to
   `VocabularyPageContent`). Add an optional
   `onCountsChange?: (counts: { word: number; idiom: number }) => void` prop;
   call it (e.g. from a `useEffect` keyed on `words`) whenever the per-type
   counts change, computed the same way the removed tab labels did:
   `words.filter((w) => w.type === 'word').length` / `'idiom'`.

3. `components/VocabularyPageContent.tsx`: add
   `const [activeTab, setActiveTab] = useState<'word' | 'idiom'>('word')` and
   `const [counts, setCounts] = useState({ word: 0, idiom: 0 })`. Render one
   tab bar as the first element in the component (above the existing
   heading + Flashcards-link row), reusing the visual style `VocabularyList`
   used for its tabs (underline-style buttons, "Words (N)" / "Idioms (N)"
   labels using `counts`). Pass `type={activeTab}` to `VocabularyForm` and
   `activeTab={activeTab}` + `onCountsChange={setCounts}` to `VocabularyList`.

**Verification:** `npx tsc --noEmit`, `npm run lint`, `npm run build` per the
Global Constraints baseline comparison. Manually reason through: on
`/vocabulary` and the homepage tab, there is exactly one Words/Idioms tab bar
at the top; clicking "Idioms" makes the form submit idioms (verify by reading
`VocabularyForm`'s submit logic uses `type`) and filters the list to idioms;
adding a word updates the tab bar's count immediately without reload; the
global slide-out "Add" panel (`SearchPanel` → `AddPanel compactVocabulary`)
and `VocabularySearchResults`'s compact add forms still show their own
independent type tabs, unaffected.

**Report:** DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED per the
implementer contract.
