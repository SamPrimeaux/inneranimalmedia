# Supabase Auth Hooks → InnerAnimalMedia Worker

All hooks are **HTTPS** endpoints on the production worker. Secure them with a shared secret.

## Environment variables (Worker secrets)

| Secret | Purpose |
|--------|---------|
| `AUTH_HOOK_SECRET` | Bearer / `X-Auth-Hook-Secret` for Supabase → Worker hook calls. |
| `RESEND_API_KEY` | Send Auth emails via Resend. |
| `RESEND_AUTH_FROM` | Optional. Default: `InnerAnimalMedia <auth@inneranimalmedia.com>`. |
| `SUPABASE_JWT_SECRET` | Required for custom access token claims when resolving IAM rows. |
| `AUTH_SIGNUP_MODE` | `public` (default) or `invite_only`. |
| `AUTH_INVITE_CODE` | Required when `AUTH_SIGNUP_MODE=invite_only`. |
| `AUTH_BLOCK_DISPOSABLE_EMAILS` | `true` / `false` — disposable domains blocked on before-user-created hook. |
| `AUTH_HOOK_ENSURE_APP_USER` | Default `true`. When `false`, the custom access token hook will not call `ensureAppUser` as a backup (lookup-only). |

Optional: `INTERNAL_API_SECRET` also validates hooks (for operator testing with the same Bearer).

## Endpoints

### 1. Send Email Hook → Resend

- **URL:** `POST https://inneranimalmedia.com/api/auth-hooks/send-email`
- **Headers:** `Authorization: Bearer <AUTH_HOOK_SECRET>`
- **Behavior:** Builds HTML around `email_data.confirmation_url` / `magic_link` / `recovery_link` and sends via Resend.

**Supabase Dashboard:** Authentication → Hooks → Send Email → HTTPS → URL above.

### 2. Custom Access Token (HTTP)

- **URL:** `POST https://inneranimalmedia.com/api/auth-hooks/custom-access-token`
- **Headers:** `Authorization: Bearer <AUTH_HOOK_SECRET>`
- **Response:** `{ "claims": { ... } }` merged into JWT. Incoming `payload.claims` is preserved; `app_metadata` is merged (not replaced wholesale for unrelated keys).

When D1 can resolve (or create via `ensureAppUser` backup) an `auth_users` row, `claims.app_metadata` includes:

- `user_id` — canonical D1 / Agent Sam id (`auth_users.id`, generated in the Worker provisioning layer, `usr_…`)
- `supabase_user_id` — Supabase Auth `auth.users.id` (UUID)
- `tenant_id`, `default_workspace_id`, `workspace_role`, `plan`, `is_superadmin`, `auth_source: "supabase"`

If D1 is unavailable or the user cannot be resolved, the hook **fail-open** returns the original `payload.claims` unchanged so login is not blocked.

### 3. Before User Created (HTTP)

- **URL:** `POST https://inneranimalmedia.com/api/auth-hooks/before-user-created`
- **Headers:** `Authorization: Bearer <AUTH_HOOK_SECRET>`
- **Response:** `{ "user_metadata": { ... } }` with defaults:

```json
{
  "onboarding_status": "new",
  "source": "supabase_auth",
  "app": "inneranimalmedia"
}
```

Invite-only and disposable-email rules match `AUTH_*` env vars.

## SQL reference files

See `supabase/auth-hooks/` for commented examples. Supabase Dashboard hooks are configured in the UI; SQL is optional for Postgres-side hooks if you use HTTP instead.

## Local testing

Use `scripts/test-auth-hook-*.mjs` with `AUTH_HOOK_SECRET` and optional `TEST_BASE_URL`.
