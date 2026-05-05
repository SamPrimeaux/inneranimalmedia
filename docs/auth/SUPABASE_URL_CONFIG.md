# Supabase Auth URL configuration (InnerAnimalMedia)

## Site URL

Set **exactly** (no trailing slash):

`https://inneranimalmedia.com`

A trailing slash on Site URL can produce double-slash paths when providers concatenate URLs. The Worker also normalizes duplicate slashes in paths, but Supabase should stay clean.

## Redirect URLs (register all)

- `https://inneranimalmedia.com/api/auth/supabase/callback` — **canonical** callback for:
  - **Supabase Auth OAuth login** (project Auth server, `SUPABASE_OAUTH_*`), and
  - **Supabase Management OAuth** (`SUPABASE_MANAGEMENT_OAUTH_*`) after exchanging the code (same path; flows are split by KV state).
- `https://inneranimalmedia.com/auth/callback/supabase` — same handler as the canonical callback (alias).
- `http://localhost:8787/api/auth/supabase/callback`
- `http://127.0.0.1:8787/api/auth/supabase/callback`
- `http://localhost:5173/auth/callback/supabase` — Vite dev; ensure `WORKER_BASE_URL` / dev proxy matches your real callback host.

## Path semantics

| Path | Role |
|------|------|
| `/api/auth/supabase/callback` | OAuth redirect for **login** (Auth server) and **Connect Supabase Management** (api.supabase.com). |
| `/auth/callback/supabase` | Alias of the above. |
| `/dashboard/overview` | **Not** an OAuth callback — post-login destination only. |
| `/api/auth/oauth/consent` | **InnerAnimalMedia as OAuth provider** — Supabase OAuth Server consent UI (not Supabase “connect”). |
| `/oauth/consent` | Same UI as `/api/auth/oauth/consent`. |

## Supabase Management OAuth app

In the Supabase dashboard OAuth app used for Management API, set the redirect URI to the **canonical** HTTPS callback above (and local wrangler URL for dev). Legacy `/api/oauth/supabase/callback` is no longer required once production uses the unified callback.
