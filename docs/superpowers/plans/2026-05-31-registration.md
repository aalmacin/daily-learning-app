# Registration (Invite-Only Password Setup) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users invited via the Supabase dashboard activate their account by setting a password.

**Architecture:** A GET route handler at `/auth/callback` exchanges the invite code from Supabase's email link for a session, then redirects to a server-rendered `/set-password` page. A `setPassword` server action validates and calls `supabase.auth.updateUser`.

**Tech Stack:** Next.js 16 (App Router), `@supabase/ssr`, server actions, no test framework in repo (manual verification).

**Spec:** `docs/superpowers/specs/2026-05-31-registration-design.md`

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `app/auth/callback/route.ts` | Create | GET route — exchange invite `code` for session, redirect to `/set-password` |
| `app/set-password/page.tsx` | Create | Server-rendered form; guards on auth; mirrors `/login` styling |
| `actions/auth.ts` | Modify | Add `setPassword` server action |

No code-level changes to navigation, login, or other components. No database migration. No new dependencies.

---

## Task 1: Add `setPassword` server action

**Files:**
- Modify: `actions/auth.ts` — append new exported async function

- [ ] **Step 1: Add the `setPassword` action**

Open `actions/auth.ts`. The file currently exports `signIn` and `signOut`. Append `setPassword` at the bottom. The full final file should read:

```ts
'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export async function signIn(formData: FormData) {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  });

  if (error) {
    redirect('/login?error=Invalid+credentials');
  }

  redirect('/');
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function setPassword(formData: FormData) {
  const password = formData.get('password') as string;
  const confirm = formData.get('confirm') as string;

  if (!password || password.length < 8) {
    redirect('/set-password?error=Password+must+be+at+least+8+characters');
  }
  if (password !== confirm) {
    redirect('/set-password?error=Passwords+do+not+match');
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect('/set-password?error=' + encodeURIComponent(error.message));
  }

  redirect('/');
}
```

Why `redirect` is outside try/catch: in Next.js, `redirect()` throws a `NEXT_REDIRECT` error that the framework catches. Wrapping it in try/catch would swallow that. The `updateUser` call returns `{ error }` rather than throwing, so we check it directly.

- [ ] **Step 2: Verify the file type-checks**

Run: `npx tsc --noEmit`

Expected: no new errors introduced. (Existing baseline errors, if any, are unrelated.)

- [ ] **Step 3: Commit**

```bash
git add actions/auth.ts
git commit -m "feat: add setPassword server action"
```

---

## Task 2: Add `/auth/callback` route handler

**Files:**
- Create: `app/auth/callback/route.ts`

Background: Supabase's invite email links use the PKCE flow (default for `@supabase/ssr`), which appends a `code` query param to the configured redirect URL. The callback handler exchanges that code for a session, which sets the auth cookie via the SSR client.

- [ ] **Step 1: Create the route handler**

Create `app/auth/callback/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const origin = request.nextUrl.origin;

  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=Invite+link+expired+or+invalid`
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=Invite+link+expired+or+invalid`
    );
  }

  return NextResponse.redirect(`${origin}/set-password`);
}
```

Why `NextResponse.redirect` instead of `redirect()` from `next/navigation`: route handlers should return a `Response`. Using `NextResponse.redirect` keeps it idiomatic and uses an absolute URL built from `request.nextUrl.origin`, which is required by `NextResponse.redirect`.

- [ ] **Step 2: Verify type-checks**

Run: `npx tsc --noEmit`

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add app/auth/callback/route.ts
git commit -m "feat: add auth callback route for invite flow"
```

---

## Task 3: Add `/set-password` page

**Files:**
- Create: `app/set-password/page.tsx`

The page mirrors `app/login/page.tsx`: server component, reads `error` from `searchParams`, renders a form that posts to a server action. Adds an auth guard (redirect to `/login` if no session).

- [ ] **Step 1: Create the page**

Create `app/set-password/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { setPassword } from '@/actions/auth';
import { getCurrentUser } from '@/lib/auth';

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const { error } = await searchParams;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-8">
          Set your password
        </h1>
        {error && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        <form action={setPassword} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="password"
              className="text-sm text-zinc-600 dark:text-zinc-400"
            >
              New password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="confirm"
              className="text-sm text-zinc-600 dark:text-zinc-400"
            >
              Confirm password
            </label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500"
            />
          </div>
          <button
            type="submit"
            className="mt-2 rounded-md bg-zinc-900 dark:bg-zinc-50 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
          >
            Set password
          </button>
        </form>
      </div>
    </div>
  );
}
```

Notes:
- `searchParams` is `Promise<{ error?: string }>` because Next.js 16 requires async access to `searchParams` (same shape as the existing `LoginPage`).
- `minLength={8}` provides client-side hint; server action enforces the real check.
- Styling classes are copy-faithful to `app/login/page.tsx` so light/dark themes match.

- [ ] **Step 2: Verify type-checks**

Run: `npx tsc --noEmit`

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add app/set-password/page.tsx
git commit -m "feat: add set-password page for invited users"
```

---

## Task 4: Manual verification

**No automated tests exist in the repo.** Verify the flow end-to-end against a real Supabase project.

- [ ] **Step 1: Configure Supabase redirect URLs**

In the Supabase dashboard for this project: **Authentication → URL Configuration → Redirect URLs**. Add (each on its own line):

- `http://localhost:5023/auth/callback`
- The production URL's `/auth/callback` (if deploying)

Save. Without this, Supabase rejects the redirect from the invite email.

- [ ] **Step 2: Start the dev server**

Run: `npm run dev`

Expected: server running at `http://localhost:5023`.

- [ ] **Step 3: Invite a test user**

In the Supabase dashboard: **Authentication → Users → Invite user**. Enter a test email you can receive mail at. Send.

Expected: an email arrives with a button/link to your app.

- [ ] **Step 4: Click the invite link**

Click the link in the email.

Expected:
1. Browser navigates to `http://localhost:5023/auth/callback?code=...`
2. Route handler exchanges the code, sets a session cookie.
3. Browser redirects to `/set-password`.
4. Page renders with "Set your password" heading and two password inputs.

- [ ] **Step 5: Verify mismatched passwords show an error**

In the form, enter `password1` and `password2`. Submit.

Expected: page reloads at `/set-password?error=Passwords+do+not+match` with the error text visible above the form.

- [ ] **Step 6: Verify short password shows an error**

Enter `short` in both fields. Submit.

Expected: browser-side `minLength={8}` likely blocks submission. To verify the server check, temporarily remove `minLength` in DevTools and resubmit. The page should redirect to `/set-password?error=Password+must+be+at+least+8+characters`.

- [ ] **Step 7: Verify successful password set**

Enter a matching 8+ character password in both fields. Submit.

Expected: redirect to `/` (home page) as an authenticated user.

- [ ] **Step 8: Verify subsequent login works**

Sign out via the nav menu. Go to `/login`. Sign in with the test email and the password just set.

Expected: successful login, redirect to `/`.

- [ ] **Step 9: Verify unauthenticated `/set-password` redirects**

Open a private/incognito window. Visit `http://localhost:5023/set-password` directly.

Expected: redirect to `/login`.

- [ ] **Step 10: Verify callback with no code redirects to login**

Open a private/incognito window. Visit `http://localhost:5023/auth/callback` (no query string).

Expected: redirect to `/login?error=Invite+link+expired+or+invalid`. The login page shows the error.

- [ ] **Step 11: Verify lint passes**

Run: `npm run lint`

Expected: no new lint errors in the three changed/created files.

---

## Out of scope

- Password reset flow.
- In-app admin invite UI.
- Profile fields at registration time.
- Automated tests (no test framework currently in the repo).
