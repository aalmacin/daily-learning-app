# Public Registration with Admin Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public `/register` page; new accounts are blocked from sign-in until an admin manually confirms them in the Supabase dashboard.

**Architecture:** A `signUp` server action calls `supabase.auth.signUp` (which creates an unconfirmed user). The customized confirmation email already in the repo has no verification link, so users can't self-confirm. `signIn` is updated to surface the "Email not confirmed" error as a friendlier "Account pending admin approval" message.

**Tech Stack:** Next.js 16 App Router, `@supabase/ssr`, server actions, no test framework.

**Spec:** `docs/superpowers/specs/2026-06-02-public-registration-design.md`

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `actions/auth.ts` | Modify | Add `signUp` server action; update `signIn` to map "Email not confirmed" error |
| `app/register/page.tsx` | Create | Public registration form (email + password + confirm); link back to `/login` |
| `app/login/page.tsx` | Modify | Render `info` banner; add link to `/register` |

No new dependencies, no migrations.

---

## Task 1: Add `signUp` action; update `signIn` error mapping

**Files:**
- Modify: `actions/auth.ts`

- [ ] **Step 1: Update the file**

Replace the entire content of `actions/auth.ts` with:

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
    if (error.message.includes('Email not confirmed')) {
      redirect('/login?error=Account+pending+admin+approval.');
    }
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

export async function signUp(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const confirm = formData.get('confirm') as string;

  if (!email) {
    redirect('/register?error=Email+is+required');
  }
  if (!password || password.length < 8) {
    redirect('/register?error=Password+must+be+at+least+8+characters');
  }
  if (password !== confirm) {
    redirect('/register?error=Passwords+do+not+match');
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    redirect('/register?error=' + encodeURIComponent(error.message));
  }

  redirect('/login?info=Account+created.+Pending+admin+approval.');
}
```

Notes:
- `redirect()` throws `NEXT_REDIRECT` so it must remain outside try/catch. The Supabase error check happens via the returned `{ error }`.
- `signIn` now branches on the error message: `"Email not confirmed"` is what `signInWithPassword` returns for unconfirmed accounts; any other error falls through to the generic `Invalid credentials`.
- `signUp` does not auto-sign-in (Supabase blocks that path because the account is unconfirmed); it redirects to `/login` with an info banner.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add actions/auth.ts
git commit -m "feat: add signUp action and pending-approval signIn message"
```

---

## Task 2: Create `/register` page

**Files:**
- Create: `app/register/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
import Link from 'next/link';
import { signUp } from '@/actions/auth';

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-8">
          Create your account
        </h1>
        {error && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        <form action={signUp} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm text-zinc-600 dark:text-zinc-400">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm text-zinc-600 dark:text-zinc-400">
              Password
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
            <label htmlFor="confirm" className="text-sm text-zinc-600 dark:text-zinc-400">
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
            Register
          </button>
        </form>
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400 text-center">
          Already have an account?{' '}
          <Link href="/login" className="text-zinc-900 dark:text-zinc-50 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
```

Notes:
- Styling mirrors `app/login/page.tsx`.
- Includes a link back to `/login` below the form.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add app/register/page.tsx
git commit -m "feat: add public registration page"
```

---

## Task 3: Update `/login` page

**Files:**
- Modify: `app/login/page.tsx`

- [ ] **Step 1: Replace the file**

Replace the entire content of `app/login/page.tsx` with:

```tsx
import Link from 'next/link';
import { signIn } from '@/actions/auth';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; info?: string }>;
}) {
  const { error, info } = await searchParams;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-8">Sign in</h1>
        {info && (
          <p className="mb-4 text-sm text-emerald-700 dark:text-emerald-400">{info}</p>
        )}
        {error && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        <form action={signIn} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm text-zinc-600 dark:text-zinc-400">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm text-zinc-600 dark:text-zinc-400">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500"
            />
          </div>
          <button
            type="submit"
            className="mt-2 rounded-md bg-zinc-900 dark:bg-zinc-50 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
          >
            Sign in
          </button>
        </form>
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400 text-center">
          Need an account?{' '}
          <Link href="/register" className="text-zinc-900 dark:text-zinc-50 hover:underline">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
```

Notes:
- `searchParams` now carries both `error` and `info`.
- `info` renders in emerald (success/info green) above the error banner.
- "Need an account? Register" link added below the form.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add app/login/page.tsx
git commit -m "feat: add register link and info banner to login page"
```

---

## Task 4: Manual verification

Same notes as the invite flow plan — no automated tests in repo.

- [ ] **Step 1: Start dev server**

`npm run dev`

- [ ] **Step 2: Register a new account**

Visit `http://localhost:5023/register`. Fill in a fresh email and an 8+ char password (matching). Submit.

Expected: redirect to `/login?info=Account+created.+Pending+admin+approval.` showing the info banner.

- [ ] **Step 3: Attempt sign-in immediately**

Try to sign in with the new credentials.

Expected: redirect to `/login?error=Account+pending+admin+approval.` showing the red error.

- [ ] **Step 4: Admin confirms in Supabase dashboard**

In Supabase dashboard → **Authentication → Users** → click `...` next to the new user → **Confirm email**.

- [ ] **Step 5: Sign in again**

Expected: redirect to `/` (signed in).

- [ ] **Step 6: Error states**

- Register with the same email again → see Supabase's "already registered" error.
- Mismatched passwords → "Passwords do not match".
- Short password → "Password must be at least 8 characters".

- [ ] **Step 7: Navigation links**

- From `/login`, click "Register" → lands on `/register`.
- From `/register`, click "Sign in" → lands on `/login`.

- [ ] **Step 8: Regression — invite flow still works**

If you have a test invite handy, run through it once to confirm `/set-password` still functions. Skip if invites aren't currently set up on the hosted project.

- [ ] **Step 9: Lint check**

Run: `npm run lint`

Expected: no new lint errors in the changed files.

---

## Out of scope

- Admin approval UI inside the app
- Password reset
- User self-verification
