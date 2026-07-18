# Plan: Tabbed Ask AI / Practice a sentence, bigger input

## Context

`components/VocabularyAssistant.tsx` (shown inside an expanded vocabulary
word row, both on `/vocabulary` and on flashcards) currently has two
independent toggle buttons, "Ask AI" and "Practice a sentence" — each opens
its own panel (`VocabularyChatPanel` / `VocabularySentencePracticePanel`)
independently, so both can be open at once, or neither. That's the
"confusing" part the user flagged. Both panels also use a single-line
`<input type="text">` for the user's message/sentence, which is small.

The user wants: (1) real tab behavior — exactly one panel visible at a time,
switching between them, not two independent toggles; (2) the input replaced
with a bigger, multi-line text field.

## Global Constraints

- `VocabularyAssistant` is rendered from `components/VocabularyWordRow.tsx`
  and `components/VocabularyFlashcards.tsx` — no props change needed there,
  this is entirely internal to `VocabularyAssistant` + the two panel
  components.
- Preserve the existing "click the active tab again to collapse both panels"
  affordance (today, clicking an already-open toggle closes it and nothing
  is shown) — keep neither-panel-open as a reachable state, not just
  chat-or-practice-always-visible.
- Both `VocabularyChatPanel.tsx` and `VocabularySentencePracticePanel.tsx`
  have the same input pattern (near-identical `<input type="text">` + submit
  button in a form) — apply the textarea change to both for consistency, not
  just one.
- Submitting must still work naturally: Enter (without Shift) submits, like
  the single-line input did; Shift+Enter inserts a newline. Don't lose the
  existing submit-button/disabled-state/loading behavior.
- Keep the existing `text-xs` sizing convention used inside these compact
  panels — "bigger" means multi-line/taller, not a different type scale.
- Run `npx tsc --noEmit`, `npm run lint`, `npm run build` and compare against
  the current baseline (a pre-existing `lib/db.ts` tsc/build error unrelated
  to these files, and a pre-existing/adjudicated `react-hooks/set-state-in-effect`
  lint finding in `VocabularyList.tsx`) — don't treat either as newly
  introduced unless the diff shows otherwise.

## Task 1: Tabbed Ask AI / Practice a sentence with bigger textareas

**Files:** `components/VocabularyAssistant.tsx`, `components/VocabularyChatPanel.tsx`,
`components/VocabularySentencePracticePanel.tsx`

**Steps:**

1. `components/VocabularyAssistant.tsx`: replace the two independent
   `chatOpen`/`practiceOpen` booleans with one
   `const [activeTab, setActiveTab] = useState<'chat' | 'practice' | null>(null)`.
   Each tab button's `onClick` sets `activeTab` to its own id, or back to
   `null` if it's already the active tab (preserves the collapse-to-neither
   affordance). Update each button's active-state styling condition to
   `activeTab === 'chat'` / `activeTab === 'practice'` instead of the
   removed booleans. Render only the panel matching `activeTab` (not both
   conditionally as today).

2. `components/VocabularyChatPanel.tsx`: replace the `<input type="text">`
   with a `<textarea rows={2} className="... resize-y ...">` (adapt the
   existing input's classes: keep `text-xs`, border, background, focus-ring
   styling, add `resize-y`). Add an `onKeyDown` handler on the textarea: if
   `e.key === 'Enter' && !e.shiftKey`, call `e.preventDefault()` and submit
   the form (e.g. `e.currentTarget.form?.requestSubmit()`); otherwise let the
   default behavior (newline on Shift+Enter, or plain typing) proceed. Adjust
   the form's flex row to `items-end` so the submit button stays aligned to
   the bottom of the textarea as it grows. Keep `disabled`/`isDisabled` logic
   unchanged, just applied to the textarea now.

3. `components/VocabularySentencePracticePanel.tsx`: apply the identical
   textarea + Enter-to-submit + `items-end` change as step 2, adapted to this
   file's existing input (same pattern, different placeholder/aria-label
   text — keep those as they are).

**Verification:** `npx tsc --noEmit`, `npm run lint`, `npm run build` per the
Global Constraints baseline comparison. Manually reason through: opening
"Ask AI" shows only the chat panel; clicking "Practice a sentence" switches
to that panel (chat panel unmounts/hides); clicking the already-active tab
collapses back to neither panel shown; in both panels, Enter submits and
Shift+Enter adds a newline, and the textarea is visibly taller/multi-line
than the previous single-line input.

**Report:** DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED per the
implementer contract.
