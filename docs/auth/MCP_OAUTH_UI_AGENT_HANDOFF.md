# Handoff: MCP OAuth UI/UX + `inneranimalmedia-mcp-server` agent

**Status (2026-05-24):** **Shipped** on `main` — IAM provider + React consent + MCP client (`mcp-oauth-iam.js`). Use this doc for maintenance and Cursor UX polish only.

**For:** Frontend / MCP-worker agent (not the IAM backend agent)  
**Goal:** End-to-end OAuth login for MCP (`mcp.inneranimalmedia.com`) via IAM provider (`inneranimalmedia.com`)  
**D1 truth doc:** `docs/auth/IAM_OAUTH_PROVIDER_EXECUTION_PLAN.md`  
**External clients (ChatGPT, Claude.ai):** `docs/auth/EXTERNAL_AI_MCP_OAUTH_INSTRUCTIONS.md`  
**Repos:** `SamPrimeaux/inneranimalmedia` @ `6e5f78d+`, `SamPrimeaux/inneranimalmedia-mcp-server` @ `d2aa6ed+`

---

## 1. Two codebases (you own both surfaces)

| Codebase | Path (typical) | Worker name | Deploy |
|----------|----------------|-------------|--------|
| **IAM** (provider + consent UI) | `/Users/samprimeaux/inneranimalmedia` | `inneranimalmedia` | `npm run deploy:full` from repo root |
| **MCP** (OAuth client + callback) | `inneranimalmedia-mcp-server/` (sibling or separate clone) | **`inneranimalmedia-mcp-server`** | `cd inneranimalmedia-mcp-server && npx wrangler deploy -c wrangler.jsonc` |

**Never** deploy MCP from IAM repo root. **Never** create a second MCP worker name.

---

## 2. D1 facts you must align to (no guessing)

| Item | Value |
|------|--------|
| Canonical `client_id` | **`iam_mcp_inneranimalmedia`** |
| Registered redirect URI | **`https://mcp.inneranimalmedia.com/auth/callback`** |
| Allowed scopes (from `oauth_clients`) | `iam:profile`, `iam:workspaces`, `iam:agent`, `mcp:tools`, `mcp:userinfo` |
| PKCE | **Required** (`requires_pkce = 1`) |
| **Do not use** | `agent_sam_mcp`, default `mcp`, `inneranimal_builtin_oauth` |

**Broken today (why you’re here):**

- IAM `/api/oauth/authorize` **skips consent** and redirects to MCP with a code immediately (`oauth_state_nonces` path).
- MCP likely sends wrong `client_id`; D1 shows **zero** `mcp_workspace_tokens` with `token_type='oauth'`.
- Consent UI exists as **unwired mockup**: `dashboard/components/auth/AuthOAuthConsentPage.tsx` (route `/api/auth/oauth/consent` — today used for **Supabase** bridge, not IAM MCP).

---

## 3. Your scope — IAM frontend (inneranimalmedia)

### 3.1 UI/UX to design, build, wire

**Primary screen:** IAM-native MCP consent (reuse styling from `AuthOAuthConsentPage.tsx` / `McpAuthorizationScreen` props).

**Route (coordinate with backend):** Prefer a **new** path to avoid Supabase collision, e.g.:

- `/oauth/mcp/consent?authorization_id=oaa_…`  
  **or** reuse `/api/auth/oauth/consent` only if backend passes `flow=iam_mcp` + `authorization_id` prefix `oaa_`.

**Screen must show (all from API, nothing hardcoded):**

- Client: `display_name`, `logo_url`, `homepage_url` from `oauth_clients`
- Requested scopes (human labels mapped from `allowed_scopes`)
- Workspace picker (user’s workspaces from authenticated session)
- Primary CTA: **Authorize** | Secondary: **Deny**
- States: `idle` → `loading` → `success` | `error` | `declined`
- Footer: privacy/terms links from client row if present

**Post-approve UX:**

- `successMode="cli"`: “Return to Cursor / your MCP client” + copy that connection will resume automatically
- `successMode="dashboard"`: link to `/dashboard/settings/keys` or MCP settings

**Login gate:** If user hits authorize while logged out, IAM already redirects to `/auth/login?next=…` — consent page only renders when session exists.

**Error UX:** `invalid_client`, `expired`, `access_denied`, `invalid_state` — friendly copy + link home.

### 3.2 Files you will touch (IAM)

```
dashboard/components/auth/AuthOAuthConsentPage.tsx   # wire props + API calls
dashboard/App.tsx                                     # route if new path
dashboard/components/auth/                          # split IAM vs Supabase if needed
```

**Import rule (repo law):** `cn` from `../../lib/utils` only — never barrel imports.

### 3.3 API contract (expect from backend — stub until live)

```http
GET  /api/oauth/mcp/consent?authorization_id=oaa_...
     → { client, scopes[], workspaces[], expires_at, status }

POST /api/oauth/mcp/consent
     Body: { authorization_id, workspace_id, action: "approve"|"deny" }
     approve → 302 to client redirect_uri ?code=&state=
     deny    → 302 with error=access_denied
```

If backend uses different paths, **grep `oauth_authorizations`** in `src/api/oauth.js` after their deploy and match exactly.

### 3.4 What you must NOT build

- Do not implement token exchange in the dashboard (MCP worker + `POST /api/oauth/token` only).
- Do not duplicate Supabase OAuth Server consent UI logic.
- Do not hardcode `tenant_*`, `ws_*`, `au_*` in components.

---

## 4. Your scope — MCP worker (`inneranimalmedia-mcp-server`)

### 4.1 OAuth client flow (RFC 6749 + PKCE)

```text
1. User opens MCP “Connect account” (or Cursor triggers OAuth)
2. MCP generates code_verifier + code_challenge (S256)
3. Redirect browser to IAM:
   https://inneranimalmedia.com/api/oauth/authorize
     ?response_type=code
     &client_id=iam_mcp_inneranimalmedia
     &redirect_uri=https://mcp.inneranimalmedia.com/auth/callback
     &scope=iam:profile mcp:tools mcp:userinfo
     &state=<random>
     &code_challenge=<base64url-sha256>
     &code_challenge_method=S256
4. User logs in (if needed) → consent UI → approve
5. Browser lands on:
   https://mcp.inneranimalmedia.com/auth/callback?code=...&state=...
6. MCP server (server-side) POST https://inneranimalmedia.com/api/oauth/token
     grant_type=authorization_code
     code=...
     redirect_uri=... (same as step 3)
     code_verifier=... (from step 2)
     client_id=iam_mcp_inneranimalmedia
     (+ client_secret if confidential — check D1 token_endpoint_auth_method)
7. Store access_token + refresh_token securely (KV / encrypted cookie / D1 via IAM API — not in git)
8. Optional: GET /api/oauth/userinfo with Bearer access_token
```

### 4.2 MCP worker changes checklist

- [ ] **`/auth/callback`** route: validate `state`, exchange code at IAM token endpoint, handle errors.
- [ ] **`/auth/start`** or equivalent: build authorize URL with **exact** query params above.
- [ ] Replace any `client_id` of `mcp`, `agent_sam_mcp`, `inneranimal_builtin_oauth`.
- [ ] PKCE: generate/store `code_verifier` in **httpOnly cookie** or encrypted session until callback (not localStorage if avoidable).
- [ ] Token storage: document where tokens live (Worker secret binding / KV key per user).
- [ ] **`.well-known/oauth-authorization-server`** on MCP host (optional but helps Cursor): point `authorization_endpoint` → IAM, `token_endpoint` → IAM.
- [ ] Health/debug: `GET /auth/status` → `{ connected: boolean, expires_at? }` (no raw tokens in response).
- [ ] Remove or gate legacy paths that wrote `oauth_state_nonces` / assumed instant authorize without consent.

### 4.3 MCP files to grep first

```bash
cd inneranimalmedia-mcp-server
rg -n "client_id|agent_sam_mcp|authorize|auth/callback|oauth|PKCE|code_verifier" src/
rg -n "inneranimalmedia\.com/api/oauth" .
cat wrangler.toml   # routes: mcp.inneranimalmedia.com
```

### 4.4 MCP deploy

```bash
cd inneranimalmedia-mcp-server
npx wrangler deploy -c wrangler.toml
curl -s https://mcp.inneranimalmedia.com/health
```

---

## 5. Preferred delivery workflow (build → mv → grep → E2E)

### 5.1 IAM dashboard component

1. Agent produces files (e.g. `IamMcpOAuthConsent.tsx` + small `useMcpOAuthConsent.ts` hook).
2. You download or copy into repo:

```bash
cd /Users/samprimeaux/inneranimalmedia
# example — adjust paths to what agent delivered
mv ~/Downloads/IamMcpOAuthConsent.tsx dashboard/components/auth/IamMcpOAuthConsent.tsx
```

3. Wire route in `dashboard/App.tsx`.
4. Build + deploy frontend:

```bash
npm run build:analytics   # or project’s dashboard build script
npm run deploy:frontend   # if R2 static assets required
npm run deploy:full       # only after backend agent confirms oauth routes live
```

### 5.2 Validation greps (IAM)

```bash
cd /Users/samprimeaux/inneranimalmedia
rg -n "iam_mcp_inneranimalmedia|oaa_|oauth/mcp/consent|AuthOAuthConsentPage|IamMcpOAuth" dashboard/ src/
rg -n "agent_sam_mcp|client_id.*'mcp'|inneranimalmedia_mcp" src/api/oauth.js
# After backend deploy — consent must NOT skip UI:
rg -n "oauth_state_nonces.*inneranimalmedia_mcp" src/api/oauth.js
```

### 5.3 Validation greps (MCP)

```bash
cd inneranimalmedia-mcp-server
rg -n "iam_mcp_inneranimalmedia|/auth/callback|code_verifier|/api/oauth/token" .
rg -n "agent_sam_mcp|'mcp'" src/   # should be zero or commented legacy
curl -sI "https://mcp.inneranimalmedia.com/auth/callback"
```

### 5.4 E2E proof (both agents)

1. Logged-in IAM user starts MCP connect.
2. Consent screen shows correct client name + scopes.
3. Approve → browser hits `mcp.inneranimalmedia.com/auth/callback?code=…`.
4. MCP shows connected / Cursor can call tools.
5. **D1 proof** (IAM agent or you with wrangler):

```sql
SELECT COUNT(*) FROM mcp_workspace_tokens WHERE token_type='oauth' AND is_active=1;
-- expect >= 1
```

6. Playwright: consent page loads, no `ReferenceError` in console (IAM deploy rules).

---

## 6. Coordination with IAM backend agent

| They do | You do |
|---------|--------|
| Migration `399_oauth_authorizations_*` | Wait for `oauth_authorizations` + consent API routes |
| Wire `oauth_clients` lookup in authorize | Send `client_id=iam_mcp_inneranimalmedia` from MCP |
| Insert `oauth_authorizations` on authorize | Build consent UI against `authorization_id` |
| Issue codes via `oauth_authorization_codes` | Exchange code in MCP `/auth/callback` |
| `mcp_workspace_tokens` `token_type='oauth'` | Store/display connection status in MCP UI |

**Sync point:** Before your `deploy:full`, confirm backend deployed and `GET /api/oauth/mcp/consent?authorization_id=test` returns 404/401 not 500.

---

## 7. UX reference (product tone)

- **Trust-first:** show IAM shield + “Inner Animal Media” as authorization server.
- **Explicit scopes:** bullet list with read/write/guarded tones (already in mockup).
- **Workspace choice required** before Authorize (multi-tenant).
- **Deny** is safe — clear “No access granted” state, no scary errors.
- **Mobile-safe:** consent is a standalone page (not dashboard shell) — full viewport, large tap targets.

---

## 8. Out of scope for you

- D1 migrations, `oauth.js` token logic, `finalizeInboundOAuth` (login IdPs).
- Keys & Secrets dashboard (`/dashboard/settings/keys`) — separate unless adding “Connected MCP” row.
- Supabase OAuth Server consent bridge (`/api/auth/oauth/consent` for Supabase UUIDs).

---

## 9. Done checklist (your agent signs off)

- [ ] Consent UI wired to live API; no hardcoded client/workspace.
- [ ] MCP authorize URL uses `iam_mcp_inneranimalmedia` + PKCE + correct redirect.
- [ ] `/auth/callback` exchanges code; tokens stored securely.
- [ ] Greps clean in **both** repos (section 5).
- [ ] One full manual E2E + screenshot or Playwright proof.
- [ ] No secrets committed; `.env` / Wrangler secrets only.
