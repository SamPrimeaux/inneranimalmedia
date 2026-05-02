# OAuth and Agent Page Integration — Applied

**Worker:** inneranimalmedia (Cloudflare)  
**Source modified:** `Library/Mobile Documents/com~apple~CloudDocs/Projects/Cloudflare/inneranimalmedia/src/worker.js`  
**Constraints:** Remote only; no bindings or wrangler.toml changed.

---

## 1. OAuth fix (`/api/oauth/google/start` and `/api/oauth/google/callback`)

- **PUBLIC_API_PATHS** updated to include:
  - `/api/oauth/google/start`
  - `/api/oauth/google/callback`

- **GET `/api/oauth/google/start`**
  - Uses **GOOGLE_CLIENT_ID** and **GOOGLE_OAUTH_CLIENT_SECRET** only.
  - Requires **SESSION_CACHE** for state (returns 503 if missing).
  - Stores state in `SESSION_CACHE` with key `oauth_state_<state>`, TTL 600s.
  - Redirect URI: `https://inneranimalmedia.com/api/oauth/google/callback`.
  - Redirects to Google OAuth consent with `openid email profile`, `access_type=offline`, `prompt=select_account`.

- **GET `/api/oauth/google/callback`**
  - Validates state via **SESSION_CACHE** (deletes after use).
  - Exchanges code with Google using **GOOGLE_CLIENT_ID** and **GOOGLE_OAUTH_CLIENT_SECRET**.
  - Ensures user exists in **auth_users** (inserts with `OAUTH_USER` placeholder if new; schema uses INTEGER id, so no custom id).
  - Inserts a row into **auth_sessions** (id, user_id, expires_at, created_at, ip_address, user_agent).
  - Sets cookie: `session=<sessionId>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`.
  - Redirects to **/dashboard/overview**.

---

## 2. Dashboard routes

- **/dashboard/overview**
  - Added to **ROUTE_MAP** and **CANONICAL_DASHBOARD**.
  - Serves same content as `/dashboard` (dashboard/index.html from ASSETS).

- **/dashboard/agent**
  - Served from **DASHBOARD** R2 bucket: key `static/dashboard/agent.html`.
  - Added to **CANONICAL_DASHBOARD**.
  - Returns 404 if object is missing. Still behind auth guard (must be signed in).

---

## 3. What was not changed

- No bindings or wrangler.toml changes.
- No new env vars; only **GOOGLE_CLIENT_ID**, **GOOGLE_OAUTH_CLIENT_SECRET**, and **SESSION_CACHE** used for the new OAuth flow.
- Existing `/api/auth/google/start` and `/api/auth/google/callback` (and other auth) unchanged.
- /auth/signin page unchanged; ensure the Google button points to `https://inneranimalmedia.com/api/oauth/google/start` for this flow.

---

## 4. Verification checklist

1. **Secrets (Cloudflare Dashboard)**  
   - **GOOGLE_CLIENT_ID** (plaintext)  
   - **GOOGLE_OAUTH_CLIENT_SECRET** (encrypted)  
   - **SESSION_CACHE** binding present (KV production-KV_SESSIONS).

2. **D1**  
   - **auth_users** (id INTEGER, email, name, password_hash, salt, created_at, updated_at).  
   - **auth_sessions** with columns: id, user_id, expires_at, created_at, ip_address, user_agent (create migration if missing).

3. **Flow**
   - Open https://inneranimalmedia.com/auth/signin.
   - Click Google sign-in (link to `/api/oauth/google/start`).
   - Redirect to Google → consent → redirect to `/api/oauth/google/callback`.
   - Callback creates/updates user, creates session, sets `session` cookie, redirects to `/dashboard/overview`.
   - Visit https://inneranimalmedia.com/dashboard/agent while signed in; agent.html from DASHBOARD bucket loads.

4. **Agent page**
   - R2 bucket **agent-sam** (DASHBOARD binding) must contain `static/dashboard/agent.html`.

---

## 5. If sign-in page uses a different URL

If the Google button still points to `/api/auth/google/start` instead of `/api/oauth/google/start`, either:

- Update the sign-in page (e.g. auth-signin.html in R2) so the Google button links to `https://inneranimalmedia.com/api/oauth/google/start`, or  
- Keep using `/api/auth/google/start` and set **GOOGLE_OAUTH_CLIENT_ID** and **GOOGLE_OAUTH_CLIENT_SECRET** in the dashboard (current handler uses those names). The new routes are for the exact paths and env names you specified.

---

## 6. Deploy

From the inneranimalmedia project directory:

```bash
cd "/Users/samprimeaux/Library/Mobile Documents/com~apple~CloudDocs/Projects/Cloudflare/inneranimalmedia"
npx wrangler deploy
```

Then run through the verification steps above.
