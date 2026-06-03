# Registration (Invite-Only Password Setup)

## Summary

Add a flow that lets users invited via the Supabase dashboard set their password and activate their account. No public signup form, no in-app admin UI for sending invites — the dashboard handles invites, the app handles only the post-invite password setup.

## Goals

- Users invited from Supabase dashboard can complete account activation in the app.
- The flow follows existing patterns: server actions for mutations, server-rendered pages, same styling as `/login`.
- Invalid or expired invite links fail gracefully with a clear message at `/login`.

## Non-goals

- In-app admin UI to send invites (use Supabase dashboard).
- Public signup or self-service registration.
- Password reset flow (out of scope; may reuse `/set-password` later).
- Profile fields (display name, etc.) at registration time.
- Email verification step beyond Supabase's invite token.

## User Flow

1. Admin invites a user from the Supabase dashboard. Supabase sends an invite email containing a magic link to the configured redirect URL (`/auth/callback`).
2. User clicks the link → lands on `/auth/callback?code=...`.
3. Callback route exchanges the code for a session and redirects to `/set-password`.
4. `/set-password` renders a form with `password` and `confirm` fields.
5. User submits → `setPassword` server action validates, calls `supabase.auth.updateUser({ password })`, and redirects to `/` on success.
6. On any failure (invalid link, mismatched passwords, weak password), the user is redirected to a page with an error query param matching the existing `signIn` error pattern.

## Components

### 1. `app/auth/callback/route.ts` (new)

GET route handler that processes the invite redirect.

- Reads `code` from query string.
- Calls `supabase.auth.exchangeCodeForSession(code)` using the SSR server client.
- On success → `redirect('/set-password')`.
- On failure or missing code → `redirect('/login?error=Invite+link+expired+or+invalid')`.

### 2. `app/set-password/page.tsx` (new)

Server component that renders the password-setup form.

- Calls `getCurrentUser()` from `lib/auth.ts`. If no user, `redirect('/login')`.
- Reads `error` from `searchParams` (same pattern as `app/login/page.tsx`).
- Renders a form with two fields (`password`, `confirm`) that submits to the `setPassword` server action.
- Styling mirrors `/login`: same container, same input/button classes, heading "Set your password".

### 3. `actions/auth.ts` — add `setPassword`

New server action alongside `signIn` / `signOut`.

```ts
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

## Data Flow

```
Supabase Dashboard "Invite user"
        │
        ▼
   user receives email with link to /auth/callback?code=...
        │
        ▼
   GET /auth/callback
        │  exchangeCodeForSession(code)
        ▼
   redirect /set-password
        │  (session cookie now set)
        ▼
   form POST → setPassword server action
        │  validate → updateUser({ password })
        ▼
   redirect /
```

## Error Handling

| Situation | Behavior |
|---|---|
| Missing `code` in callback URL | Redirect to `/login?error=Invite+link+expired+or+invalid` |
| `exchangeCodeForSession` fails | Same as above |
| `/set-password` accessed without session | Redirect to `/login` |
| Password under 8 characters | Redirect to `/set-password?error=Password+must+be+at+least+8+characters` |
| Passwords do not match | Redirect to `/set-password?error=Passwords+do+not+match` |
| `updateUser` returns error | Redirect to `/set-password?error=<encoded Supabase error message>` |
| User re-clicks invite link after activation | Callback still succeeds (already authed); user re-lands on `/set-password` and can update password. Acceptable. |

## Supabase Configuration (manual, not code)

In the Supabase dashboard, **Authentication → URL Configuration → Redirect URLs**, add the callback URL for each environment:

- `http://localhost:5023/auth/callback`
- The production URL's `/auth/callback`

Without this, Supabase rejects the redirect from the invite email.

## Files Touched

- **New:** `app/auth/callback/route.ts`
- **New:** `app/set-password/page.tsx`
- **Edit:** `actions/auth.ts` — append `setPassword` action

## Testing

Manual verification (no automated test framework in repo):

1. Invite a test email from the Supabase dashboard.
2. Click the link in the email → verify landing on `/set-password` with a session.
3. Submit mismatched passwords → verify error shown.
4. Submit a short password → verify error shown.
5. Submit a valid password → verify redirect to `/` and ability to sign in normally afterward.
6. Visit `/set-password` without a session → verify redirect to `/login`.
7. Visit `/auth/callback` without a code → verify redirect to `/login` with error.

## Out of Scope / Future

- Password reset (could reuse `/set-password` plus a "request reset" page).
- In-app admin invite UI calling `auth.admin.inviteUserByEmail` with service-role key.
- Display name / profile capture during activation.
