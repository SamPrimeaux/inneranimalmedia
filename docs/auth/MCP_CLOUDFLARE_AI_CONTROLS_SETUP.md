# MCP + Cloudflare AI Controls — end-to-end setup

**Goal:** Sam, Connor, and future users connect external AI apps (Claude, ChatGPT, Cursor) and the Inner Animal Media app to **Agent Sam MCP** with IAM OAuth, optionally fronted by **Cloudflare Zero Trust** portals.

**Repos:**

| Repo | Deploy |
|------|--------|
| `inneranimalmedia` (IAM provider) | `npm run deploy:full` |
| `inneranimalmedia-mcp-server` | `npx wrangler deploy --config wrangler.jsonc` |

**Canonical OAuth client:** `iam_mcp_inneranimalmedia`  
**MCP URL:** `https://mcp.inneranimalmedia.com/mcp`

---

## Architecture (three layers)

```text
External AI app / Cursor
    → (optional) Cloudflare MCP portal  [Access IdP: Google, etc.]
    → MCP worker mcp.inneranimalmedia.com/mcp
    → IAM OAuth inneranimalmedia.com [login: existing Google OAuth OK]
    → D1 mcp_workspace_tokens (token_type=oauth)
```

| Layer | Product | Your Google OAuth? |
|-------|---------|-------------------|
| IAM login | `inneranimalmedia.com` sign-in | **Yes** — already configured |
| MCP tool access | `iam_mcp_inneranimalmedia` | Separate — IAM consent, not Google Console |
| CF portal gate | Zero Trust Access | Optional — [Google IdP in Zero Trust](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google/) |

---

## Phase 0 — Ship code + D1 (once per environment)

### 1. Apply migration 401 (redirect URIs)

```bash
cd /Users/samprimeaux/inneranimalmedia
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
  -c wrangler.production.toml --file migrations/401_oauth_clients_external_ai_redirect_uris.sql
```

Registers:

- `https://mcp.inneranimalmedia.com/auth/callback` (Cursor / MCP worker)
- `https://claude.ai/api/mcp/auth_callback`
- `https://claude.com/api/mcp/auth_callback`
- `https://chatgpt.com/connector_platform_oauth_redirect`
- `https://chat.openai.com/connector_platform_oauth_redirect`

### 2. Deploy IAM worker

```bash
npm run deploy:full
```

Adds `https://inneranimalmedia.com/.well-known/oauth-authorization-server`.

### 3. Deploy MCP worker

```bash
cd ../inneranimalmedia-mcp-server
npx wrangler deploy --config wrangler.jsonc
```

Adds:

- `/.well-known/oauth-protected-resource`
- `401` + `WWW-Authenticate` on unauthenticated `/mcp` (Claude / ChatGPT discovery)

### 4. Smoke test

```bash
curl -s https://mcp.inneranimalmedia.com/.well-known/oauth-protected-resource | jq .
curl -s https://inneranimalmedia.com/.well-known/oauth-authorization-server | jq .
curl -sI -X POST https://mcp.inneranimalmedia.com/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | grep -i www-authenticate
```

---

## Phase 1 — Cloudflare dashboard (UI)

Official guide: [MCP server portals](https://developers.cloudflare.com/cloudflare-one/access-controls/ai-controls/mcp-portals/)

### A. Register MCP server

1. **Zero Trust** → **Access controls** → **AI controls** → **MCP servers**
2. **Add an MCP server**
3. Fill in:

| Field | Value |
|-------|--------|
| Name | `InnerAnimalMedia MCP Server` |
| Server ID | `inneranimalmedia-mcp-server` |
| Description | *(see below)* |
| HTTP URL | `https://mcp.inneranimalmedia.com/mcp` |
| Authentication | **OAuth** |

**Description (paste):**

```text
Production Agent Sam MCP for Inner Animal Media. Workspace-scoped tools (D1, R2, Workers). IAM OAuth client_id iam_mcp_inneranimalmedia; consent at inneranimalmedia.com/oauth/mcp/consent. For team use via this Cloudflare portal with per-user IAM tokens.
```

4. **Access policies** → Allow → your email (add Connor’s email or a group policy for scale)
5. **Save and connect server**
6. Complete **IAM** login + MCP consent when redirected (use your IAM account — Google sign-in on IAM is fine)
7. Status should become **Ready** (not SYNC REQUIRED)
8. **⋯** → **Sync capabilities** if tools stay at 0

**If redirect fails:** open browser DevTools → Network → copy `redirect_uri` from the failed authorize request → append to D1 (see migration 401 comment) → retry **Authenticate server**.

### B. Create MCP portal (team entry point)

1. **AI controls** → **MCP server portals** → **Add MCP server portal**
2. Name: `Agent Sam Portal`
3. **Custom domain:** e.g. `mcp-portal.inneranimalmedia.com` (dedicated hostname — do not reuse upstream URL only)
4. Attach **InnerAnimalMedia MCP Server** (must be **Ready**)
5. **Require user auth for OAuth servers:** **Enabled** (each user gets own IAM token)
6. **Access policies:** Allow team emails
7. Save

Users and clients should use **portal URL** `https://<portal-host>/mcp`, not only the raw upstream URL.

### C. Google for portal login (optional)

To sign into the **portal** with Google (separate from IAM MCP OAuth):

**Zero Trust** → **Settings** → **Authentication** → **Login methods** → **Google**  
Docs: https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google/

---

## Phase 2 — Cloudflare API (automation / Connor envs)

**API token permissions:** `Access: Apps and Policies Write`, Account read.

Account ID from dashboard URL: `ede6590ac0d2fb7daf155b35653457b2` (verify yours).

### List MCP servers

```bash
export CF_ACCOUNT_ID="ede6590ac0d2fb7daf155b35653457b2"
export CF_API_TOKEN="<token>"

curl -s "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/access/ai-controls/mcp/servers" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" | jq .
```

### Create MCP server (OAuth)

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/access/ai-controls/mcp/servers" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{
    "name": "InnerAnimalMedia MCP Server",
    "server_id": "inneranimalmedia-mcp-server",
    "hostname": "https://mcp.inneranimalmedia.com/mcp",
    "auth_type": "oauth",
    "description": "Agent Sam MCP — IAM OAuth iam_mcp_inneranimalmedia"
  }' | jq .
```

After create, complete OAuth in dashboard (**Authenticate server**) — API cannot substitute browser consent.

### Force sync tools

```bash
export SERVER_ID="inneranimalmedia-mcp-server"

curl -s -X POST \
  "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/access/ai-controls/mcp/servers/${SERVER_ID}/sync" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" | jq .
```

### Create portal

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/access/ai-controls/mcp/portals" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{
    "name": "Agent Sam Portal",
    "hostname": "mcp-portal.inneranimalmedia.com",
    "auth_type": "oauth",
    "require_user_auth": true
  }' | jq .
```

API reference: [Cloudflare API — AI controls MCP](https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/ai_controls/)

---

## Phase 3 — Client connection matrix

| Client | URL | OAuth Client ID | Client Secret |
|--------|-----|-----------------|---------------|
| **Cursor** | `https://mcp.inneranimalmedia.com/mcp` | — | — (use bearer from `/auth/connect`) |
| **Claude.ai** | Portal URL or upstream | `iam_mcp_inneranimalmedia` | leave blank |
| **ChatGPT** | Portal or Developer connector | `iam_mcp_inneranimalmedia` | leave blank |
| **CF Playground** | Portal URL | via Access login | — |

**Never** put `mcp_oauth_…` in OAuth Client Secret — that is the **access token**.

User flow for everyone:

1. Open `https://mcp.inneranimalmedia.com/auth/connect` (or portal → connect upstream)
2. Sign in to IAM (**Google login OK**)
3. Approve MCP consent + pick workspace
4. Client receives / stores bearer automatically (portal) or copy for Cursor `mcp.json`

---

## Phase 4 — Scale (Connor + future users)

1. **D1:** each user’s token in `mcp_workspace_tokens` (`token_type=oauth`, scoped workspace)
2. **Access policy:** group `@inneranimalmedia.com` or named emails on portal + MCP server
3. **Require user auth** on portal (no shared admin bearer in production)
4. **Revoke:** deactivate token in IAM / disconnect connector
5. **Observability:** Supabase `agentsam_tool_call_events`, `build_deploy_events` — plan `plan_accountability_spine_20260524`

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| SYNC REQUIRED | **Authenticate server** or bearer admin token; then **Sync capabilities** |
| `redirect_uri_not_registered` | Run migration 401; add CF callback URI from network tab |
| Claude “Couldn’t reach MCP server” | Deploy MCP 2.5.1+; verify `WWW-Authenticate` header on 401 |
| 0 tools after Ready | Re-sync; verify bearer works: `curl …/mcp tools/list` |
| User bypasses portal | Add self-hosted Access app on `mcp.inneranimalmedia.com` ([Secure MCP servers](https://developers.cloudflare.com/cloudflare-one/access-controls/ai-controls/saas-mcp/)) |

---

## Related docs

- [EXTERNAL_AI_MCP_OAUTH_INSTRUCTIONS.md](./EXTERNAL_AI_MCP_OAUTH_INSTRUCTIONS.md)
- [IAM_OAUTH_PROVIDER_EXECUTION_PLAN.md](./IAM_OAUTH_PROVIDER_EXECUTION_PLAN.md)
- [MCP_OAUTH_UI_AGENT_HANDOFF.md](./MCP_OAUTH_UI_AGENT_HANDOFF.md)
