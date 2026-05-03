# Supabase OAuth: two separate flows

Inner Animal Media uses **two independent Supabase OAuth clients**. They must **never** share credentials, redirect URIs, token endpoints, or KV state keys.

## Product summary (two options)

### Supabase option 1 — auth page (IAM login / signup)

| | |
|--|--|
| **Purpose** | User login and signup **to Inner Animal Media** (IAM session). |
| **Visible location** | **`/auth/login`** and **`/auth/signup`** (Worker-served `pages/auth/*.html` and SPA fallbacks; see routing docs). |
| **Button / asset** | Use the **existing verified Supabase brand asset** on those pages only for this flow. |
| **Start route** | `GET /api/auth/supabase/start` |
| **Callback** | `GET /api/auth/supabase/callback` (alias: `GET /auth/callback/supabase`) |
| **Credentials** | **`SUPABASE_OAUTH_CLIENT_ID`**, **`SUPABASE_OAUTH_CLIENT_SECRET`** |
| **Final success** | **`/dashboard/overview`** (unless a safe same-origin `next` is stored). |

### Supabase option 2 — dashboard integration (Management API)

| | |
|--|--|
| **Purpose** | Connect **Supabase org / projects** for Agent Sam: MCP tools, integrations, project and database workflows, logs/schema-oriented features. |
| **Visible location** | Dashboard **Integrations** / **Tools** / **Settings** (connected-state UI). |
| **Button / action** | **Connect Supabase** (integration entry point; not the auth-page brand button). |
| **Start route** | `GET /api/oauth/supabase/start` |
| **Callback** | `GET /api/oauth/supabase/callback` |
| **Credentials** | **`SUPABASE_MANAGEMENT_OAUTH_CLIENT_ID`**, **`SUPABASE_MANAGEMENT_OAUTH_CLIENT_SECRET`** |
| **Final success** | Integration shows **connected**; user remains in dashboard settings/integrations context. |

---

## 1. Project Auth — user login (`SUPABASE_OAUTH_*`)

**Purpose:** Sign up / sign in to InnerAnimalMedia via the Supabase project’s OAuth 2.1 server (PKCE).

| Item | Value |
|------|--------|
| Routes | `GET /api/auth/supabase/start`, `GET /api/auth/supabase/callback` |
| Alias callback | `GET /auth/callback/supabase` → same handler as `/api/auth/supabase/callback` |
| Authorize | `https://<project-ref>.supabase.co/auth/v1/oauth/authorize` (default ref: `dpmuvynqixblxsilnlut`) |
| Token | `https://<project-ref>.supabase.co/auth/v1/oauth/token` |
| Secrets | `SUPABASE_OAUTH_CLIENT_ID`, `SUPABASE_OAUTH_CLIENT_SECRET` |
| `redirect_uri` | `{origin}/api/auth/supabase/callback` (stable apex via `WORKER_BASE_URL` when set) |
| Post-login redirect | `/dashboard/overview` when no `next` / cookie override |

**Implementation:** `src/api/auth.js` (`handleSupabaseOAuthStart`, `handleSupabaseOAuthCallback`).

**KV state key:** `supabase_auth_oauth_state:<state>` (SESSION_CACHE).

This flow is **public** at `/api/auth/supabase/start` (302 to the project host). It does **not** require an IAM session to start.

**SPA:** When the dashboard bundle handles non-`/dashboard` routes, **`AuthSignInPage`** / **`AuthSignUpPage`** are mounted at **`/auth/login`** and **`/auth/signup`** (`dashboard/App.tsx`). Do not remove those routes without updating this doc and `docs/PRE_COMMIT_AUTH_ROUTES.md`.

---

## 2. Supabase Management — integrations (`SUPABASE_MANAGEMENT_OAUTH_*`)

**Purpose:** Authenticated users connect Supabase org/projects for Management API access (integrations UI, project discovery).

| Item | Value |
|------|--------|
| Routes | `GET /api/oauth/supabase/start`, `GET /api/oauth/supabase/callback` |
| Authorize | `https://api.supabase.com/v1/oauth/authorize` |
| Token / refresh | `https://api.supabase.com/v1/oauth/token` |
| Secrets | `SUPABASE_MANAGEMENT_OAUTH_CLIENT_ID`, `SUPABASE_MANAGEMENT_OAUTH_CLIENT_SECRET` |
| `redirect_uri` | `https://inneranimalmedia.com/api/oauth/supabase/callback` |

**Implementation:** `src/api/oauth.js` (`handleOAuthApi` — provider `supabase`), including refresh in `refreshSupabaseAccessToken`.

**KV state key:** `supabase_management_oauth_state:<state>` (SESSION_CACHE).

**Session required:** Anonymous `GET /api/oauth/supabase/start` returns:

`{"error":"Authentication required to connect Supabase Management integration."}`

with HTTP 401.

**Integrations readiness:** `src/api/integrations.js` treats the Supabase (OAuth) registry row as configurable only when **both** `SUPABASE_MANAGEMENT_OAUTH_CLIENT_ID` and `SUPABASE_MANAGEMENT_OAUTH_CLIENT_SECRET` are set — not `SUPABASE_OAUTH_*`.

---

## Must not swap

- Do not use `SUPABASE_OAUTH_*` with `api.supabase.com` or `/api/oauth/supabase/callback`.
- Do not use `SUPABASE_MANAGEMENT_OAUTH_*` with `{project}.supabase.co/auth/v1/oauth` or `/api/auth/supabase/callback`.

---

## `/dashboard/overview` is not an OAuth redirect URI

Overview is an **application route** after login, not a registered OAuth `redirect_uri`. OAuth apps must register only the HTTPS callback paths listed above.

---

## `/api/auth/oauth/consent`

This route serves the **IAM OAuth Server consent UI** (InnerAnimalMedia acting as an OAuth provider for clients configured in Supabase). It is **not** part of Supabase project login or Supabase Management integration.
