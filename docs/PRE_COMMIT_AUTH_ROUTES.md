# Pre-commit guardrail: auth routes and Supabase flows

Use this before committing changes that touch **`dashboard/App.tsx`** or **`dashboard/components/auth/*`**.

## 1. Show the diff

```bash
cd /Users/samprimeaux/Downloads/inneranimalmedia
git diff dashboard/App.tsx dashboard/components/auth/
```

Review every change to routes, imports, and redirects.

## 2. Confirm required auth components still exist

After your edits, **`dashboard/App.tsx`** must still:

- Import **`AuthSignInPage`** and **`AuthSignUpPage`** from `./components/auth/...`.
- Render **`AuthSignInPage`** at **`/auth/login`**.
- Render **`AuthSignUpPage`** at **`/auth/signup`**.
- Keep **`CanonicalAuthRedirect`** (or equivalent) so legacy **`/login`** and **`/signup`** resolve to **`/auth/login`** and **`/auth/signup`** with query string preserved.

Quick check:

```bash
rg -n "AuthSignInPage|AuthSignUpPage|/auth/login|/auth/signup" dashboard/App.tsx
```

## 3. Do not conflate Supabase flows

Two separate products — see **`docs/supabase-oauth-split.md`**:

| Flow | Routes | Secrets |
|------|--------|---------|
| IAM login (auth pages) | `/api/auth/supabase/start`, `/api/auth/supabase/callback` | `SUPABASE_OAUTH_*` |
| Dashboard integration | `/api/oauth/supabase/start`, `/api/oauth/supabase/callback` | `SUPABASE_MANAGEMENT_OAUTH_*` |

Do not point the auth-page Supabase button at Management OAuth or vice versa.
