# Auth & integrations E2E test plan

## 1. Email/password signup

1. Open `/auth/signup`, create a new user (strong password).
2. Confirm row in D1: `auth_users`, `users`, `workspaces`, `workspace_members`, `user_settings`, `auth_sessions` / `sessions`.
3. `GET /api/auth/me` returns `authenticated: true`, `user`, `workspace`, `workspaces`, `integrations_summary`, `session`.
4. Dashboard loads default workspace (`/dashboard/overview`).

## 2. Email/password login

1. Log out, log in with the same account.
2. Verify new `auth_sessions` row and KV session; `sessions` dual-write if table exists.

## 3. Google login

1. Use “Sign in with Google” from `/auth/login`.
2. Confirm D1 provisioning and session.
3. Confirm **no** `google_drive` token unless the user completed a separate Drive connect flow (integration scopes).

## 4. GitHub login

1. Use “Sign in with GitHub”.
2. Confirm D1 rows and optional `github` row in `user_oauth_tokens` for login/tool scopes.

## 5. Continue with Supabase Auth

1. Use `/api/auth/supabase/start` from the login page.
2. Complete OAuth; ensure callback hits `/api/auth/supabase/callback`.
3. Verify `user_oauth_tokens` with provider `supabase_auth` (encrypted when `VAULT_MASTER_KEY` is set).

## 6. Connect Supabase Management

1. Sign in, open `/dashboard/settings/integrations`.
2. Connect Supabase (OAuth). Callback should land on `/api/auth/supabase/callback` with management KV state.
3. Verify `user_oauth_tokens` provider `supabase_management` and registry `supabase_oauth` status.
4. Redirect returns to `/dashboard/settings/integrations?connected=supabase` (or equivalent query).

## 7. OAuth Server consent (IAM as provider)

1. Start an OAuth request that sends the user to `/api/auth/oauth/consent?authorization_id=...`.
2. Logged-out user → redirect to `/auth/login?next=...` with full return path.
3. Logged-in user → consent UI (also at `/oauth/consent`).
4. Approve → redirect per Supabase; Deny → redirect/error per API.
5. Check `auth_event_log` for `oauth_consent_*` events (after migration 254).

## 8. Auth hooks

1. Trigger signup confirmation / magic link / password reset from Supabase.
2. Confirm Resend delivery (Send Email hook).
3. Decode JWT after login and confirm custom claims from HTTP hook.
4. Attempt disposable-email signup with `AUTH_BLOCK_DISPOSABLE_EMAILS=true` (should fail).

## 9. Regression

- `/auth/callback/supabase` still works.
- No branded 404 on `/api/auth/oauth/consent` or `/oauth/consent` with valid `authorization_id`.
