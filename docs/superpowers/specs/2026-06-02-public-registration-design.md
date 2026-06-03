# Public Registration with Admin Approval

## Summary

Add a public `/register` page that lets anyone create an account with email + password. New accounts have `email_confirmed_at: null` and cannot sign in until an admin clicks "Confirm email" in the Supabase dashboard. Complements the existing invite flow (both remain available).

## Goals

- Public sign-up form at `/register` (email + password + confirm).
- Server action creates an unconfirmed Supabase user via `signUp`.
- Sign-in is blocked until admin manually confirms the user; we surface that as a clear "pending approval" message rather than the raw "Email not confirmed" error.
- User sees a "pending approval" info message after successful registration.
- `/login` includes a link to `/register`, and `/register` includes a link back to `/login`.

## Non-goals

- Self-service email verification (the new `supabase/templates/confirmation.html` template intentionally has no verification link).
- In-app admin approval UI (use the Supabase dashboard).
- Password reset.
- Profile fields beyond email + password.
- Captcha / rate limiting.

## User Flow

1. User visits `/register`, fills email, password, confirm.
2. Submits → `signUp` server action validates, calls `supabase.auth.signUp({ email, password })`.
3. Supabase creates `auth.users` row with `email_confirmed_at: null`. The customized confirmation email is sent (no clickable link — just informs them their account is pending approval).
4. User is redirected to `/login?info=Account+created.+Pending+admin+approval.` and sees the info banner.
5. Admin opens Supabase dashboard → **Authentication → Users** → finds new user → clicks `...` → **"Confirm email"**.
6. User signs in normally at `/login`.

## Components

### 1. `app/register/page.tsx` (new)

Server component, mirrors `/login` styling.

- Reads `error` from `searchParams` (Next.js 16: `Promise<{ error?: string }>`).
- Renders heading "Create your account".
- Form fields: `email` (type=email, required), `password` (type=password, required, minLength=8, autoComplete=new-password), `confirm` (same).
- Submit button "Register".
- Link below form: "Already have an account? Sign in" → `/login`.
- Form submits to `signUp` server action.

### 2. `actions/auth.ts` — add `signUp`, update `signIn`

**Add `signUp`:**

- Read `email`, `password`, `confirm` from `FormData`.
- Validate:
  - `email` present (non-empty).
  - `password.length >= 8`.
  - `password === confirm`.
- Call `supabase.auth.signUp({ email, password })`.
- On Supabase error → `redirect('/register?error=' + encodeURIComponent(error.message))`.
- On success → `redirect('/login?info=Account+created.+Pending+admin+approval.')`.

**Update `signIn`:**

- Existing behavior maps any error to `/login?error=Invalid+credentials`.
- Change: if the error message contains `"Email not confirmed"`, redirect to `/login?error=Account+pending+admin+approval.` instead.
- Other errors → `/login?error=Invalid+credentials` (unchanged).

### 3. `app/login/page.tsx` — modify

- Update `searchParams` type to `Promise<{ error?: string; info?: string }>`.
- Read both `error` and `info`.
- Render `info` as a green/blue info banner above the form (distinct from the red error banner).
- Add link below the submit button: "Need an account? Register" → `/register`.

## Error Handling

| Situation | Behavior |
|---|---|
| Missing email | `/register?error=Email+is+required` |
| Password under 8 chars | `/register?error=Password+must+be+at+least+8+characters` |
| Passwords don't match | `/register?error=Passwords+do+not+match` |
| Email already registered or other Supabase error | `/register?error=<encoded Supabase error message>` |
| Sign-in attempt before admin approval | `/login?error=Account+pending+admin+approval.` |
| Sign-in with wrong password | `/login?error=Invalid+credentials` (unchanged) |
| Successful registration | `/login?info=Account+created.+Pending+admin+approval.` |

## Supabase configuration (manual, hosted project)

- **Authentication → Settings → "Confirm email"**: ensure enabled (so unconfirmed users are blocked from signing in).
- Push the `supabase/templates/confirmation.html` template (already in repo) and the `supabase/config.toml` entry to production, OR paste the template into **Authentication → Email Templates → Confirm signup** in the dashboard.

## Files Touched

- **New:** `app/register/page.tsx`
- **Modify:** `actions/auth.ts` — add `signUp`, update `signIn`
- **Modify:** `app/login/page.tsx` — info banner, register link

No new dependencies, no migrations.

## Testing (manual)

1. Submit valid registration → user appears in Supabase Users list with `email_confirmed_at: null`. Browser lands at `/login?info=...` with info banner visible.
2. Immediately attempt sign-in with the new credentials → blocked with `Account pending admin approval.` error.
3. In Supabase dashboard, click "Confirm email" for that user → sign-in now succeeds, lands on `/`.
4. Submit registration with an already-registered email → error shown.
5. Submit mismatched passwords → "Passwords do not match" shown.
6. Submit short password → "Password must be at least 8 characters" shown.
7. Visit `/login` → "Need an account? Register" link visible; click → lands on `/register`.
8. Visit `/register` → "Already have an account? Sign in" link visible; click → lands on `/login`.
9. Regression: invite flow (clicking a valid invite link → `/set-password`) still works.

## Out of scope

- Admin approval UI inside the app.
- Password reset / forgot password.
- Email verification by the user themselves (the template deliberately omits the link).
- Rate limiting / captcha.
