# IAM OAuth Provider + MCP — Execution Plan (D1-verified)

**Database:** `inneranimalmedia-business` (remote, queried 2026-05-24)  
**Source of truth:** Remote D1 only — not repo assumptions.

---

## 1. D1 forensic summary (facts)

### 1.1 Tables that exist

| Table | Rows | Role in prod data |
|-------|------|-------------------|
| `oauth_clients` | **1** | Relying-party registry — **never used** (`total_authorizations=0`, `last_used_at=NULL`) |
| `oauth_authorization_codes` | **5** | One-time codes — **orphan client**, all expired, never used |
| `oauth_refresh_tokens` | **0** | Refresh store — empty |
| `oauth_state_nonces` | **9** | Ad-hoc authorize buffer — **0 consumed**, all expired |
| `oauth_states` | **14** | Inbound IdP OAuth state (Google/GitHub) — **separate concern** |
| `oauth_providers` | **4** | Inbound IdP config (`github`, `google`, `inneranimal`, `cloudflare`) |
| `mcp_workspace_tokens` | **14** (3 active) | MCP bearer tokens — **0 rows with `token_type='oauth'`** |
| `auth_event_log` | many | Supabase **consent bridge** events; no MCP IAM-provider success path |

### 1.2 Tables that do **not** exist

- `oauth_authorizations` — **missing** (required for consent lifecycle)
- `oauth_tokens` — **missing** (use `mcp_workspace_tokens` + `oauth_refresh_tokens` instead)

### 1.3 `oauth_clients` (only row)

| Column | Value |
|--------|--------|
| `id` | `oac_iam_mcp_server` |
| `client_id` | **`iam_mcp_inneranimalmedia`** (UNIQUE) |
| `tenant_id` | `tenant_sam_primeaux` |
| `owner_account_id` | `au_871d920d1233cbd1` |
| `redirect_uris` | `["https://mcp.inneranimalmedia.com/auth/callback"]` |
| `allowed_scopes` | `iam:profile`, `iam:workspaces`, `iam:agent`, `mcp:tools`, `mcp:userinfo` |
| `requires_pkce` | 1 |
| `total_authorizations` | **0** |

### 1.4 Why MCP OAuth is broken today (D1 evidence)

1. **Client ID mismatch** — Only live `inneranimalmedia_mcp` nonce stores `metadata_json.client_id = "agent_sam_mcp"`. That `client_id` is **not** in `oauth_clients` (only `iam_mcp_inneranimalmedia` exists).
2. **Token exchange never persisted** — `SELECT COUNT(*) FROM mcp_workspace_tokens WHERE token_type='oauth'` → **0**.
3. **Authorize codes never consumed** — All 9 `oauth_state_nonces`: `consumed_at IS NULL`, all `expires_at < unixepoch()` (expired).
4. **Legacy codes are dead** — All 5 `oauth_authorization_codes` use `client_id='inneranimal_builtin_oauth'` (not in registry), `user_id` in (`pending`, `10`) not `au_*`, `used=0`, expired.
5. **Registry unused** — `oauth_clients.total_authorizations = 0`.

### 1.5 `oauth_state_nonces` by `provider`

| provider | rows | consumed | not_expired (at audit time) |
|----------|------|----------|---------------------------|
| `inneranimal` | 5 | 0 | 0 |
| `inneranimalmedia` | 3 | 0 | 0 |
| `inneranimalmedia_mcp` | 1 | 0 | 0 (now expired) |

### 1.6 `mcp_workspace_tokens` by `token_type`

| token_type | is_active | count | revoked |
|------------|-----------|-------|---------|
| personal | 0/1 | 5/1 | mixed |
| service | 0/1 | 3/2 | mixed |
| agent | 0/1 | 3/1 | mixed |
| **oauth** | — | **0** | — |

### 1.7 `auth_event_log` (OAuth-related)

Dominated by **Supabase OAuth Server consent bridge** (`oauth_consent_received`, `oauth_consent_requires_login`, etc.) — not IAM-native MCP provider completions.

---

## 2. Target architecture (one lane)

```text
GET /oauth/authorize
  → SELECT oauth_clients WHERE client_id = ? AND is_active = 1
  → validate redirect_uri ⊆ redirect_uris JSON
  → validate scope ⊆ allowed_scopes
  → INSERT oauth_authorizations (status=pending)
  → redirect /api/auth/oauth/consent?authorization_id=<oaa_*>
       (IAM-native path — separate from Supabase bridge)

POST consent approve
  → UPDATE oauth_authorizations status=approved
  → INSERT oauth_authorization_codes (code = SHA256(plaintext), used=0)
  → redirect client redirect_uri ?code=&state=

POST /oauth/token
  → SELECT oauth_authorization_codes WHERE code = hash(plaintext) AND used=0
  → PKCE verify
  → INSERT mcp_workspace_tokens (token_type='oauth', token_hash=SHA256(bearer))
  → optional INSERT oauth_refresh_tokens
  → UPDATE oauth_authorization_codes SET used=1
  → UPDATE oauth_clients SET total_authorizations++, last_used_at
```

**Retire for MCP provider path:** `oauth_state_nonces` where `provider='inneranimalmedia_mcp'`.

**Keep separate:** `oauth_states` + `oauth_providers` (inbound login), `user_oauth_tokens` (integrations), Supabase consent bridge.

---

## 3. Execution phases

### Phase 0 — Baseline lock (30 min)

- [ ] Re-run validation queries (section 5) after any migration.
- [ ] Register D1 todos: `todo_iam_oauth_provider_schema`, `todo_iam_oauth_mcp_e2e`.

### Phase 1 — D1 migration `399_oauth_authorizations` (1–2 h)

**Deliverable:** `migrations/399_oauth_authorizations_iam_provider.sql`

1. `CREATE TABLE IF NOT EXISTS oauth_authorizations` (columns aligned to existing D1 types — see migration file).
2. Indexes: `(client_id, status)`, `(user_id, status)`, `(expires_at)`.
3. **Data hygiene (idempotent):**
   - `UPDATE oauth_authorization_codes SET used=1 WHERE client_id='inneranimal_builtin_oauth' AND used=0` (retire stale codes).
   - Do **not** delete `oauth_state_nonces` yet (audit trail).

**Pre-apply validation:** table missing.  
**Post-apply validation:** `PRAGMA table_info(oauth_authorizations)` + `SELECT COUNT(*) FROM oauth_authorizations` = 0.

### Phase 2 — Canonical client_id alignment (30 min)

**Decision (D1-driven):** Canonical MCP client = **`iam_mcp_inneranimalmedia`** (already in `oauth_clients` with correct redirect URI).

| Action | Detail |
|--------|--------|
| Worker | Reject unknown `client_id`; no default `'mcp'` or `'agent_sam_mcp'`. |
| MCP server config | Must send `client_id=iam_mcp_inneranimalmedia` on authorize. |
| Optional D1 | `INSERT` second client only if a real second relying party exists — do not add `agent_sam_mcp` unless product requires two clients. |

**Post-apply validation:**

```sql
SELECT client_id, redirect_uris FROM oauth_clients WHERE is_active=1;
-- Expect exactly iam_mcp_inneranimalmedia + mcp callback URL
```

### Phase 3 — Worker: authorize + consent (1–2 days)

| Step | Behavior |
|------|----------|
| Authorize | Load `oauth_clients`; validate redirect + scope + PKCE; `INSERT oauth_authorizations`; bump nothing on `oauth_state_nonces`. |
| Consent GET | Join `oauth_authorizations` + `oauth_clients` (display_name, logo_url, allowed_scopes). |
| Consent approve | `status=approved`; insert row in **`oauth_authorization_codes`** (`code` = SHA256 hex of plaintext code); redirect with plaintext code once. |
| Consent deny | `status=denied`; redirect `error=access_denied`. |

**auth_event_log:** `iam_oauth_authorize_pending`, `iam_oauth_consent_approved`, `iam_oauth_consent_denied`, `iam_oauth_token_issued`.

**Supabase bridge:** Leave existing `/api/auth/oauth/consent?authorization_id=` path untouched (different `authorization_id` namespace).

### Phase 4 — Worker: token + userinfo (1 day)

| Step | Behavior |
|------|----------|
| Token | Exchange via **`oauth_authorization_codes`** (not `oauth_state_nonces`). |
| Access token | `INSERT mcp_workspace_tokens` with **`token_type='oauth'`** (proves E2E in D1). |
| Refresh | `INSERT oauth_refresh_tokens` when `grant_types` includes `refresh_token`. |
| Userinfo | Resolve bearer from `mcp_workspace_tokens.token_hash` (existing pattern). |
| Client auth | Verify `client_secret_hash` when `token_endpoint_auth_method != 'none'`. |

**Post-deploy validation:**

```sql
SELECT COUNT(*) FROM mcp_workspace_tokens WHERE token_type='oauth' AND is_active=1;
-- Must be >= 1 after one successful E2E
```

### Phase 5 — Remove MCP path from `oauth_state_nonces` (0.5 day)

- Stop writing `provider='inneranimalmedia_mcp'` to `oauth_state_nonces`.
- Keep table for other providers until audited.
- Optional retention job: delete expired nonces > 30 days.

### Phase 6 — E2E + deploy (1 day)

1. `npm run deploy:full`
2. Manual: logged-in user → authorize URL with `client_id=iam_mcp_inneranimalmedia` + PKCE → consent → callback with code → token → userinfo.
3. D1 proof queries (section 5.4).
4. Playwright: no console errors on consent page.

**Done when:**

- `oauth_authorizations` row lifecycle works.
- `oauth_authorization_codes.used` flips 0→1 on token exchange.
- `mcp_workspace_tokens.token_type='oauth'` ≥ 1.
- `oauth_clients.total_authorizations` ≥ 1.

### Phase 7 — Later (not blocking MCP fix)

- `/.well-known/oauth-authorization-server` (RFC 8414)
- Admin UI to register `oauth_clients`
- General `oauth_tokens` table if MCP-only token model is too narrow

---

## 4. What we reuse vs add

| B0 concept | D1 today | Plan |
|------------|----------|------|
| Client registry | `oauth_clients` ✅ | **Wire** — no new table |
| Pending consent | ❌ missing | **Add** `oauth_authorizations` |
| Auth codes | `oauth_authorization_codes` ✅ (unused) | **Wire** on approve |
| Access tokens | `mcp_workspace_tokens` ✅ | **Wire** `token_type='oauth'` |
| Refresh | `oauth_refresh_tokens` ✅ (empty) | **Wire** on token response |
| Ad-hoc state | `oauth_state_nonces` | **Stop** for MCP provider |

---

## 5. Validation query pack (run before/after each phase)

```sql
-- 5.1 Inventory
SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'oauth%' ORDER BY 1;

-- 5.2 Registry
SELECT client_id, is_active, total_authorizations, last_used_at, redirect_uris
FROM oauth_clients;

-- 5.3 Authorizations (after Phase 1)
SELECT status, COUNT(*) FROM oauth_authorizations GROUP BY status;

-- 5.4 MCP OAuth proof (after Phase 6)
SELECT COUNT(*) AS oauth_mcp_tokens
FROM mcp_workspace_tokens WHERE token_type='oauth' AND is_active=1;

SELECT COUNT(*) AS codes_used
FROM oauth_authorization_codes
WHERE client_id='iam_mcp_inneranimalmedia' AND used=1;

-- 5.5 Stale path must not grow
SELECT COUNT(*) FROM oauth_state_nonces
WHERE provider='inneranimalmedia_mcp' AND created_at > unixepoch() - 3600;
```

---

## 6. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Supabase consent UI conflates with IAM `authorization_id` | Prefix IAM ids `oaa_*`; bridge uses Supabase UUIDs only |
| `client_secret_hash` required NOT NULL on `oauth_clients` | Generate hash in migration seed script for MCP client if missing |
| Two authorize implementations in parallel | Feature flag or hard cutover for `inneranimalmedia_mcp` only |
| Breaking existing MCP server | Coordinate `client_id=iam_mcp_inneranimalmedia` deploy with Worker |

---

## 7. Estimate

| Phase | Effort |
|-------|--------|
| 1 Migration + hygiene | 2 h |
| 2 Client alignment | 0.5 h |
| 3 Authorize + consent | 1–2 d |
| 4 Token + userinfo | 1 d |
| 5 Deprecate nonces path | 0.5 d |
| 6 E2E + deploy | 1 d |
| **Total** | **~4–5 focused days** |

---

## 8. Immediate next command (when executing)

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
  -c wrangler.production.toml --file=migrations/399_oauth_authorizations_iam_provider.sql
```

Then implement Phase 3–4 in `src/api/oauth.js` + consent handlers in `src/api/auth.js`.
