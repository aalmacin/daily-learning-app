# Force Web Search Toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let the user explicitly force OpenAI web search per request via a "Search the web" control on the explain form, the regenerate action, and the Ask AI chat — instead of relying solely on the model's discretion.

**Architecture:** The `web_search` tool is already always attached to both `explainTermWithAI` and `chatAboutTerm`. This change adds a `forceWeb` flag that only sets `tool_choice`: `'required'` (forces the model to call a tool — and `web_search` is the only one attached, so it must search) when the control is on, `'auto'` (today's behavior) when off. The flag is threaded UI → action → lib. Default off.

**Tech Stack:** Next.js App Router server actions, React 19, `@tanstack/react-form`, `@tanstack/react-query`, `openai@6.33.0` Responses API.

## Global Constraints

- Never use `any` or type suppression.
- Model stays `gpt-5.4-mini`.
- `forceWeb`/`useWeb` params default to `false` so all existing call sites keep working unchanged (backward compatible).
- Off = `tool_choice: 'auto'` (unchanged behavior, tool still attached — the model may still search on its own and still produce citations). On = `tool_choice: 'required'`.
- Default control state in every UI spot is OFF (unchecked).
- NO test runner exists (scripts only `lint`/`build`). Verification gate: `npx tsc --noEmit 2>&1 | grep -v "lib/youtube.ts"` shows no `error TS` lines, `npm run lint` (pre-existing `lib/db.ts:239-240` prefer-const + `lib/youtube.ts` errors excepted), and `npm run build` succeeds. Do NOT add tests.
- `lib/youtube.ts` (tsc) and `lib/db.ts:239-240` (eslint) are PRE-EXISTING unrelated defects — do not touch or attribute.

---

### Task 1: Thread `forceWeb` through the API layer and actions

**Files:**
- Modify: `lib/openai.ts` — `explainTermWithAI` (~`lib/openai.ts:154`), `chatAboutTerm` (~`lib/openai.ts:134`)
- Modify: `actions/explain.ts` — `explainTerm` (`actions/explain.ts:21`)
- Modify: `actions/terms.ts` — `regenerateTerm` (`actions/terms.ts:74`)
- Modify: `actions/chat.ts` — `askQuestion` (`actions/chat.ts:6`)

**Interfaces:**
- Produces (consumed by Task 2):
  - `explainTermWithAI(term: string, allowedCategories: string[], context?: string, forceWeb?: boolean)`
  - `chatAboutTerm(termName: string, termContent: string, history, question: string, forceWeb?: boolean)`
  - `explainTerm(rawName: string, context?: string, useWeb?: boolean): Promise<ExplainResult>`
  - `regenerateTerm(id: number, name: string, context?: string, useWeb?: boolean): Promise<Term>`
  - `askQuestion(refinementId: number, question: string, useWeb?: boolean): Promise<ChatMessage[]>`

- [ ] **Step 1: `chatAboutTerm` — add `forceWeb` param + `tool_choice`**

In `lib/openai.ts`, change the signature and add `tool_choice` to the `responses.create` call:

```ts
export async function chatAboutTerm(
  termName: string,
  termContent: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  question: string,
  forceWeb = false,
): Promise<{ answer: string; citations: Citation[] }> {
  const response = await client.responses.create({
    model: 'gpt-5.4-mini',
    tools: [{ type: 'web_search' }],
    tool_choice: forceWeb ? 'required' : 'auto',
    input: [
      { role: 'system', content: CHAT_SYSTEM_PROMPT(termName, termContent) },
      ...history,
      { role: 'user', content: question },
    ],
  });

  const answer = response.output_text;
  if (!answer) throw new Error('Empty response from OpenAI');
  return { answer, citations: extractCitations(response) };
}
```

- [ ] **Step 2: `explainTermWithAI` — add `forceWeb` param + `tool_choice`**

In `lib/openai.ts`, change the signature and add `tool_choice` alongside the existing `text.format` structured output (leave everything else in the function unchanged):

```ts
export async function explainTermWithAI(term: string, allowedCategories: string[], context?: string, forceWeb = false): Promise<TermExplanation & { citations: Citation[] }> {
  const userContent = context ? `Term: ${term}\nContext: ${context}` : term;
  const response = await client.responses.create({
    model: 'gpt-5.4-mini',
    tools: [{ type: 'web_search' }],
    tool_choice: forceWeb ? 'required' : 'auto',
    input: [
      { role: 'system', content: buildSystemPrompt(allowedCategories) },
      { role: 'user', content: userContent },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'term_explanation',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            content: { type: 'string' },
            categories: { type: 'array', items: { type: 'string' } },
          },
          required: ['name', 'content', 'categories'],
        },
      },
    },
  });
```

(The rest of the function — `raw`/`parsed`/validation/category filtering/return — is unchanged.)

- [ ] **Step 3: Thread `useWeb` through `explainTerm`**

In `actions/explain.ts`, change the signature and pass through to the AI call:

```ts
export async function explainTerm(rawName: string, context?: string, useWeb = false): Promise<ExplainResult> {
```

and update the call (`actions/explain.ts:35`):

```ts
  const explanation = await explainTermWithAI(name, categoryNames, context, useWeb);
```

- [ ] **Step 4: Thread `useWeb` through `regenerateTerm`**

In `actions/terms.ts`, change the signature and pass through:

```ts
export async function regenerateTerm(id: number, name: string, context?: string, useWeb = false): Promise<Term> {
```

and update the call (`actions/terms.ts:79`):

```ts
  const explanation = await explainTermWithAI(name, categoryNames, context, useWeb);
```

- [ ] **Step 5: Thread `useWeb` through `askQuestion`**

In `actions/chat.ts`, change the signature and pass through to `chatAboutTerm`:

```ts
export async function askQuestion(
  refinementId: number,
  question: string,
  useWeb = false,
): Promise<ChatMessage[]> {
```

and update the `chatAboutTerm` call (`actions/chat.ts:18`) to pass `useWeb` as the final argument:

```ts
  const { answer, citations } = await chatAboutTerm(
    term.name,
    term.content,
    history.map(({ role, content }) => ({ role, content })),
    question,
    useWeb,
  );
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit 2>&1 | grep -v "lib/youtube.ts" | grep "error TS"` → no output.
Run: `npx eslint lib/openai.ts actions/explain.ts actions/terms.ts actions/chat.ts` → clean.

- [ ] **Step 7: Commit**

```bash
git add lib/openai.ts actions/explain.ts actions/terms.ts actions/chat.ts
git commit -m "feat: add forceWeb flag to force OpenAI web search"
```

---

### Task 2: Add the "Search the web" controls to the UI

**Files:**
- Modify: `components/TermForm.tsx` (single form ~`:22`, multiple form ~`:40`)
- Modify: `components/TermResult.tsx` (`DoneTermCard`, regenerate mutation ~`:79`, button row ~`:199`)
- Modify: `components/TermDetailPage.tsx` (chat handlers `:208` + `:249`, chat input area)
- Modify: `components/TermSearchResults.tsx` (`ResearchChat` ~`:35`)

**Interfaces:**
- Consumes: the Task 1 signatures (`explainTerm(..., useWeb)`, `regenerateTerm(..., useWeb)`, `askQuestion(..., useWeb)`).

Shared checkbox style (use verbatim for each control so they look consistent):

```tsx
<label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 select-none cursor-pointer">
  <input type="checkbox" checked={USE_WEB} onChange={(e) => SET_USE_WEB(e.target.checked)} className="accent-cyan-600" />
  Search the web
</label>
```

- [ ] **Step 1: `TermForm` — single mode**

Add `useWeb: false` to the single form `defaultValues` (`components/TermForm.tsx:23`):

```ts
    defaultValues: { termName: defaultTerm ?? '', context: '', useWeb: false },
```

Update the `explainTerm` call in the single form `onSubmit` (`:31`):

```ts
        const term = await explainTerm(value.termName, value.context || undefined, value.useWeb)
```

Add the checkbox inside `singleModeForm`, immediately before the `<singleForm.Subscribe ...>` submit block (`:126`):

```tsx
      <singleForm.Field name="useWeb">
        {(field) => (
          <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 select-none cursor-pointer">
            <input
              type="checkbox"
              checked={field.state.value}
              onChange={(e) => field.handleChange(e.target.checked)}
              className="accent-cyan-600"
            />
            Search the web
          </label>
        )}
      </singleForm.Field>
```

- [ ] **Step 2: `TermForm` — multiple mode**

Add `useWeb: false` to the multiple form `defaultValues` (`:41`):

```ts
    defaultValues: { terms: '', context: '', useWeb: false },
```

Update the `explainTerm` call in the multiple form `onSubmit` (`:54`):

```ts
        explainTerm(termName, value.context || undefined, value.useWeb)
```

Add the same `useWeb` checkbox Field inside the multiple `<form>`, immediately before the "Explain All" `<button>` (`:243`), following the pattern in Step 1 but using `multipleForm.Field`.

- [ ] **Step 3: `TermResult` — regenerate toggle**

In `DoneTermCard` (`components/TermResult.tsx:70`), add state at the top of the component:

```ts
  const [regenUseWeb, setRegenUseWeb] = useState(false)
```

Change the regenerate mutation (`:78`) to pass the flag:

```ts
  const regenerateMutation = useMutation({
    mutationFn: () => regenerateTerm(term.id, term.name, undefined, regenUseWeb),
    onSuccess: updateTermInStore,
  })
```

Add the checkbox in the button row, immediately after the Regenerate `<button>` (`:205`):

```tsx
        <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 select-none cursor-pointer">
          <input type="checkbox" checked={regenUseWeb} onChange={(e) => setRegenUseWeb(e.target.checked)} className="accent-cyan-600" />
          Search the web
        </label>
```

- [ ] **Step 4: `TermDetailPage` — chat toggle**

Find the chat input state declaration (near `chatInput`) and add alongside it:

```ts
  const [chatUseWeb, setChatUseWeb] = useState(false);
```

Pass it to BOTH `askQuestion` calls: in `handleAskQuestion` (`components/TermDetailPage.tsx:222`) → `await askQuestion(refinementId, question, chatUseWeb)`, and in `handleStartResearch` (`:249`) → `await askQuestion(newAttempt.id, question, chatUseWeb)`.

Add the checkbox next to the chat input control (in the same row/area where the user types a question and submits). Use the shared checkbox markup with `checked={chatUseWeb}` / `onChange={(e) => setChatUseWeb(e.target.checked)}`.

- [ ] **Step 5: `TermSearchResults` — chat toggle**

In `ResearchChat` (`components/TermSearchResults.tsx:35`), add:

```ts
  const [useWeb, setUseWeb] = useState(false);
```

Pass `useWeb` to both `askQuestion` calls in `handleSubmit` (`:68` and `:71`) as the final argument. Add the shared checkbox markup next to the Ask `<form>` input (before or after the input, within the form area) with `checked={useWeb}` / `onChange={(e) => setUseWeb(e.target.checked)}`.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit 2>&1 | grep -v "lib/youtube.ts" | grep "error TS"` → no output.
Run: `npx eslint components/TermForm.tsx components/TermResult.tsx components/TermDetailPage.tsx components/TermSearchResults.tsx` → clean.
Run: `npm run build` → succeeds.

- [ ] **Step 7: Commit**

```bash
git add components/TermForm.tsx components/TermResult.tsx components/TermDetailPage.tsx components/TermSearchResults.tsx
git commit -m "feat: add Search the web toggle to explain, regenerate, and chat"
```

---

## Spec coverage check

- Force web via `tool_choice: 'required'`, off = `'auto'` → Task 1.
- Threaded through explain, regenerate, chat → Task 1 (actions) + Task 2 (UI).
- Default off everywhere → Task 2.
- Backward compatible (defaults) → Task 1.
