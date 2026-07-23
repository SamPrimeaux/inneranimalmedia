# External AI clients — IAM MCP OAuth (ChatGPT, Claude.ai, Cursor)

**Status:** IAM MCP OAuth is **live** for Cursor, Claude.ai, and ChatGPT via **Dynamic Client Registration** (`POST /api/oauth/register` → `iam_dcr_*`) + consent + bearer. Do **not** hardcode `clientId: iam_mcp_inneranimalmedia` in host configs.

**Related:**

- **[MCP_CLOUDFLARE_AI_CONTROLS_SETUP.md](./MCP_CLOUDFLARE_AI_CONTROLS_SETUP.md)** — Zero Trust UI + API
- [IAM_OAUTH_PROVIDER_EXECUTION_PLAN.md](./IAM_OAUTH_PROVIDER_EXECUTION_PLAN.md) — D1 truth
- [MCP_OAUTH_UI_AGENT_HANDOFF.md](./MCP_OAUTH_UI_AGENT_HANDOFF.md) — consent UI
- MCP server README — [inneranimalmedia-mcp-server](https://github.com/SamPrimeaux/inneranimalmedia-mcp-server)
- D1 law: `rule_mcp_user_client_allowlist_enforced`

---

## Three lanes (do not mix)

| Lane | What it is | Used for |
|------|------------|----------|
| **IAM MCP OAuth** (this doc) | `https://mcp.inneranimalmedia.com/mcp` + IAM login/consent | Agent Sam MCP tools |
| **Supabase** | Dashboard Integrations → Connect Supabase | Postgres / memory lanes |
| **Cloudflare** | Cloudflare plugin / bindings MCP | CF account ops — not IAM MCP OAuth |

---

## How hosts connect (DCR — required)

| Host | How |
|------|-----|
| **Cursor** | `{ "url": "https://mcp.inneranimalmedia.com/mcp" }` only — Cursor discovers AS + **registers** `iam_dcr_*` |
| **Claude.ai / ChatGPT** | Add connector URL `https://mcp.inneranimalmedia.com/mcp` — same DCR path |

**Do not** paste `iam_mcp_inneranimalmedia` as Client ID. That id is the **platform tool-catalog** client, not a per-host registration.

### Flow

1. Host → `GET /.well-known/oauth-authorization-server` (200)
2. Host → `POST /api/oauth/register` (201 → `iam_dcr_*` with host’s redirect URI)
3. Host → `GET /api/oauth/authorize` → consent UI
4. Approve → grant written to **`agentsam_mcp_oauth_user_client_allowlist`** (mandatory)
5. Token mint → tools/call requires that grant (`requireGrant`)

### Isolation

| Layer | Mechanism |
|-------|-----------|
| Who | Token `user_id` / derived `workspace_id` |
| Which host | `external_client_key` (cursor / claude / chatgpt) + **user_client_allowlist** |
| Which tools | `agentsam_mcp_oauth_tool_allowlist` on catalog client (DCR falls back via `resolveMcpOAuthCatalogClientId`) |

Revoke a host: set `agentsam_mcp_oauth_user_client_allowlist.is_active = 0` for that `user_id` + `workspace_id` + `client_key`.

---

## Canonical identifiers

| Item | Value |
|------|--------|
| MCP URL | `https://mcp.inneranimalmedia.com/mcp` |
| AS | `https://inneranimalmedia.com` |
| Register (DCR) | `POST /api/oauth/register` |
| Authorize | `GET /api/oauth/authorize` |
| Token | `POST /api/oauth/token` |
| Consent | `https://inneranimalmedia.com/oauth/mcp/consent?authorization_id=oaa_*` |
| Catalog client (not for host configs) | `iam_mcp_inneranimalmedia` |
| Per-host clients | `iam_dcr_*` |
| Scopes | `iam:profile`, `iam:workspaces`, `mcp:tools`, `mcp:userinfo` (+ `iam:agent` when granted) |

---

## Cursor `mcp.json` (correct)

```json
{
  "mcpServers": {
    "inneranimalmedia": {
      "url": "https://mcp.inneranimalmedia.com/mcp"
    }
  }
}
```

Wrong (forces static client / broken DCR):

```json
"auth": { "clientId": "iam_mcp_inneranimalmedia", ... }
```

Example file: [`docs/cursor-mcp-config.example.json`](../cursor-mcp-config.example.json)

---

## Proof queries

```sql
-- Recent DCR clients
SELECT client_id, redirect_uris, datetime(updated_at,'unixepoch')
FROM oauth_clients WHERE client_id LIKE 'iam_dcr_%'
ORDER BY updated_at DESC LIMIT 10;

-- Consent grants (required)
SELECT user_id, workspace_id, client_key, is_active, datetime(updated_at,'unixepoch')
FROM agentsam_mcp_oauth_user_client_allowlist
ORDER BY updated_at DESC LIMIT 20;

-- Authorizations
SELECT id, client_id, status, substr(redirect_uri,1,60), datetime(created_at,'unixepoch')
FROM oauth_authorizations ORDER BY created_at DESC LIMIT 10;
```
