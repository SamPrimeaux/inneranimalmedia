# OAuth login callback parity map (`worker.js`)

**Purpose:** Safe port of **login** OAuth callbacks from `worker.js` into modular code (`src/api/` + `src/index.js`).  
**Rule:** Keep **legacy `legacyWorker.fetch` fallback** until staging/prod prove byte-for-byte behavioral parity (or explicitly accepted deltas).

**Verified modular starts (no legacy):**

- `GET /api/oauth/google/start` → 302 `accounts.google.com`
- `GET /api/oauth/github/start` → 302 `github.com/login/oauth/authorize`

Implementation: `src/api/oauth.js` (`loginGoogleOAuthStart`, `loginGitHubOAuthStart`).

---

## 1. Route → handler (`worker.js` dispatch ~3800–3820)

| HTTP route | Legacy handler | Notes |
|------------|----------------|-------|
| `GET /api/oauth/google/callback` | `handleGoogleOAuthCallback` | Same function as `/auth/callback/google`. |
| `GET /auth/callback/google` | `handleGoogleOAuthCallback` | **`redirect_uri` used at token exchange** is stored in KV payload (`redirectUri`). |
| `GET /api/oauth/github/callback` | `handleGitHubOAuthCallback` | **`redirect_uri` at start** is this URL (GitHub app registration). |
| `GET /auth/callback/github` | `handleGitHubOAuthCallback` | **Same implementation** as `/api/oauth/github/callback`; alternate entry only. Start flow still uses `/api/oauth/github/callback` as `redirect_uri`. |

There is **no separate** GitHub callback implementation for `/auth/callback/github` vs `/api/oauth/github/callback`.

---

## 2. State keys & KV payload (must match modular **start**)

### Google (login / connectDrive)

| Field | Value |
|-------|--------|
| KV key | `oauth_state_<state>` (`state` = UUID from provider query) |
| TTL | 600s |
| Payload | JSON string: `{ "redirectUri", "returnTo", "connectDrive" }` |
| `redirectUri` | `{origin}/auth/callback/google` — **must match** token exchange |
| `returnTo` | Safe relative path default `/dashboard/overview` from start (see `handleGoogleOAuthStart`) |
| `connectDrive` | boolean |

**Collision risk:** Modular **integration** OAuth also uses `oauth_state_<uuid>` with a **different** JSON shape (`user_id`, `tenant_id`, …). Login vs integration is distinguished by **who wrote state** (login start vs logged-in integration start). Callback must reject wrong shape or route correctly.

### GitHub (login / connectGitHub)

| Field | Value |
|-------|--------|
| KV key | `oauth_state_github_<state>` |
| TTL | 600s |
| Payload | JSON: `{ "redirectUri", "returnTo", "connectGitHub" }` |
| `redirectUri` | `{origin}/api/oauth/github/callback` — **must match** token exchange |
| `connectGitHub` | true when `safeReturn === '/dashboard/agent'` or `returnTo === '/dashboard/agent'` |

**Collision risk:** Modular integration GitHub uses **`oauth_state_<state>`** only (via `kvPutState`), **not** `oauth_state_github_*`. Login callback reads **`oauth_state_github_*`** — so `/api/oauth/github/callback` currently: integration handler in `oauth.js` looks up `oauth_state_*` → miss → **404** → `legacyWorker` runs login callback. After port, **ordering** in `src/index.js` must avoid integration handler consuming login callbacks.

---

## 3. Google — `handleGoogleOAuthCallback` behavior

### Preconditions

- Query: `state`, `code` required; else **302** → `/auth/login?error=missing`
- `SESSION_CACHE` + `DB` required; else **302** → `...?error=missing`

### KV

- **GET** + **DELETE** `oauth_state_<state>`
- Missing cache → **302** `/auth/login?error=invalid_state`

### Parse payload

- Legacy string vs JSON: if JSON, set `redirectUri`, `returnTo` (if path starts with `/`, becomes `{origin}${path}`), `connectDrive`
- Token endpoint needs **`redirect_uri`** = parsed `redirectUri` (exact string from start)

### Secrets

- `GOOGLE_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` — missing → **302** `/auth/login?error=token_failed&reason=invalid_client&hint=secret_or_id_not_configured`

### Token exchange

- POST `https://oauth2.googleapis.com/token` (form body: code, client_id, client_secret, redirect_uri, grant_type)
- Failure → **302** `/auth/login?error=token_failed&reason=<parsed oauth error or unknown>`

### Userinfo

- GET `https://www.googleapis.com/oauth2/v2/userinfo`
- Failure / no email → **302** `userinfo_failed` / `no_email`

### Branch: `connectDrive === true`

- Requires **existing session** (`getAuthUser`); else **302** `session_required`
- **DB:** `INSERT OR REPLACE INTO user_oauth_tokens` — provider **`google_drive`**, plain columns (legacy shape in worker)
- **Response:** HTML with `postMessage` + `window.close()` (popup), **not** redirect login

### Branch: normal login

- **auth_users:** insert or update name
- **`provisionNewUser(env, { email, name, authUserId })`**
- **auth_sessions:** new row; `resolveTenantAtLogin` → `tenant_id`
- **`writeIamSessionToKv(sessionId, authUserId, tenant_id, expiresAt)`** — required for cookie resolve

### Redirect / cookies (login success)

- **Redirect:** `Location: {origin}{safeDest}` where `safeDest = (returnTo passes relative-path checks) ? returnTo : '/dashboard/overview'`.
- **Important:** After successful JSON parse, `returnTo` is set to a **full URL** (`https://…`). That fails `returnTo.startsWith('/')` and fails `!returnTo.includes(':')`, so **`safeDest` almost always becomes `/dashboard/overview`** — custom `return_to` from start is **not** applied in practice for Google login success (preserve bug-for-bug unless intentionally fixed).
- **Cookies:** host-only `session=<sessionId>`; clear stale `session=` on `.inneranimalmedia.com` and `.sandbox.inneranimalmedia.com`

---

## 4. GitHub — `handleGitHubOAuthCallback` behavior

### Preconditions

- `state`, `code`; `SESSION_CACHE`; `DB` — else **302** `error=missing`

### KV

- **GET** + **DELETE** `oauth_state_github_<state>`
- Missing → **302** `invalid_state`

### Parse payload

- JSON: `redirectUri`, `returnTo` (full URL if path OK), `connectGitHub`

### Token exchange

- POST `https://github.com/login/oauth/access_token` (JSON body)
- Failure / `tokens.error` → **302** `token_failed`

### User / email

- GET `/user`; optional GET `/user/emails` if email missing

### Branch: `connectGitHub === true`

- Session required; else **302** `session_required`
- **user_oauth_tokens** upsert `provider = 'github'`, `account_identifier` = login
- HTML popup `postMessage` + `close`

### Branch: normal login

- **auth_users** + **`provisionNewUser`**
- **auth_sessions** + **`resolveTenantAtLogin`**
- **`autoStartWorkSession(env, userId, tidGh, url.pathname)`** (Google path does **not** call this — **parity detail**)
- **`writeIamSessionToKv`**
- **user_oauth_tokens** upsert for **`github`** (login path also persists token after session — worker lines ~34511–34521)

### Redirect / cookies

- **Redirect:** `oauthPostLoginGlobeRedirectUrl(origin(url), returnTo)` →  
  `{origin}/auth/login?globe_exit=1&next=<encoded path+query from returnTo URL>`  
  (differs from Google’s direct `Location` to final dest.)
- **Cookies:** same pattern as Google (host-only session + domain clears)

---

## 5. Modular conflicts to resolve before cutting legacy

| Area | Issue |
|------|--------|
| `/api/oauth/github/callback` | `handleOAuthApi` (integration) returns 404 when KV miss → legacy runs today. Modular port must **explicitly** dispatch login vs integration (state key and payload shape). |
| `oauth_state_*` key | Shared prefix between **login Google** and **integration** flows — port must disambiguate (namespace key or payload version field). |
| Helper imports | `provisionNewUser`, `writeIamSessionToKv`, `resolveTenantAtLogin`, `getAuthUser`, `oauthPostLoginGlobeRedirectUrl`, `autoStartWorkSession` live in **worker.js** today — extract shared module or duplicate carefully. |

---

## 6. Post-callback legacy footprint

After callbacks are modular and verified:

- Remaining **`legacyWorker`** uses include: generic `/api/*` catch-all (non-404), **`queue()`**, and any stragglers.
- Removing `import legacyWorker from '../worker.js'` shrinks upload size only after **all** fallbacks are gone.

---

## 7. References (source lines, `worker.js`)

- Dispatch: ~3800–3820  
- `oauthPostLoginGlobeRedirectUrl`: ~34124–34132  
- `handleGoogleOAuthStart` / `handleGoogleOAuthCallback`: ~34201–34364  
- `handleGitHubOAuthStart` / `handleGitHubOAuthCallback`: ~34366–34532  

Modular starts: `src/api/oauth.js` (`loginGoogleOAuthStart`, `loginGitHubOAuthStart`).
