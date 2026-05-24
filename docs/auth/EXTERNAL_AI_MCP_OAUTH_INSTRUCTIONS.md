# External AI clients — IAM MCP OAuth (ChatGPT, Claude.ai, Cursor)

**Status:** IAM MCP OAuth **shipped** for Cursor (browser flow → bearer). **Native** ChatGPT / Claude.ai remote connectors need additional IAM + MCP worker work (see [Engineering backlog](#engineering-backlog-native-connectors)).

**Related:**

- [IAM_OAUTH_PROVIDER_EXECUTION_PLAN.md](./IAM_OAUTH_PROVIDER_EXECUTION_PLAN.md) — D1 truth, provider design
- [MCP_OAUTH_UI_AGENT_HANDOFF.md](./MCP_OAUTH_UI_AGENT_HANDOFF.md) — consent UI + MCP worker maintenance
- MCP server README — [inneranimalmedia-mcp-server](https://github.com/SamPrimeaux/inneranimalmedia-mcp-server)

---

## Three lanes (do not mix)

| Lane | What it is | Used for |
|------|------------|----------|
| **IAM MCP OAuth** (this doc) | `https://mcp.inneranimalmedia.com/mcp` + IAM login/consent | Agent Sam MCP tools (~400+), D1/R2/CF-backed operations |
| **Supabase** (separate) | Dashboard **Integrations → Connect Supabase** (`/api/oauth/supabase/*`) | Postgres/Management API, `agent_memory`, accountability mirrors |
| **Cloudflare** (separate) | Cloudflare plugin / bindings MCP | Workers, D1, R2, observability — **not** IAM MCP OAuth |

IAM MCP OAuth is **not** Supabase project login and **not** Cloudflare Access. A Supabase or Cloudflare connector in ChatGPT/Claude does **not** authenticate to `mcp.inneranimalmedia.com`.

---

## Canonical identifiers

| Item | Value |
|------|--------|
| MCP URL | `https://mcp.inneranimalmedia.com/mcp` |
| OAuth connect (browser) | `https://mcp.inneranimalmedia.com/auth/connect` |
| IAM authorization server | `https://inneranimalmedia.com` |
| Authorize | `GET /api/oauth/authorize` |
| Token | `POST /api/oauth/token` |
| Consent UI | `https://inneranimalmedia.com/oauth/mcp/consent?authorization_id=oaa_*` |
| `client_id` | **`iam_mcp_inneranimalmedia`** |
| MCP callback (Cursor path) | `https://mcp.inneranimalmedia.com/auth/callback` |
| Scopes | `iam:profile`, `iam:workspaces`, `mcp:tools`, `mcp:userinfo` |
| Discovery (partial) | `GET https://mcp.inneranimalmedia.com/.well-known/oauth-authorization-server` |
| Supabase `plan_id` | `plan_accountability_spine_20260524` |
| `workflow_key` / `project` | `mcp_oauth_provider_cutover` / `mcp_oauth` |

---

## What works today vs native connector OAuth

| Client | Works today | Native “Add connector” OAuth in UI |
|--------|-------------|-------------------------------------|
| **Cursor** | Yes — `/auth/connect` → bearer in `mcp.json` | N/A (bearer) |
| **Claude API** (`mcp_servers` + `authorization_token`) | Yes — bearer from browser flow | Yes, pass token from flow below |
| **Claude.ai / ChatGPT** | Bearer path if UI allows; else blocked | Needs [backlog](#engineering-backlog-native-connectors) |

### Production path (all clients that accept Bearer)

1. Open while logged into IAM: `https://mcp.inneranimalmedia.com/auth/connect`
2. Approve at `https://inneranimalmedia.com/oauth/mcp/consent?authorization_id=oaa_*` (pick workspace).
3. Copy the one-time bearer (`mcp_oauth_…`) from the success page.
4. Validate:

```bash
export TOKEN="mcp_oauth_…"

curl -s https://mcp.inneranimalmedia.com/auth/status \
  -H "Authorization: Bearer $TOKEN" | jq .

curl -s -X POST https://mcp.inneranimalmedia.com/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | grep -o '"name":"[^"]*"' | wc -l
```

Expect `authenticated: true` and a large tool count (not `401`).

**E2E script (IAM repo):** `scripts/cursor-mcp-oauth-connect-e2e.mjs` (optional `WRITE_CURSOR_MCP_JSON=1`).

### Why hosted ChatGPT / Claude.ai OAuth-only connectors fail today

- IAM `oauth_clients.redirect_uris` only includes the MCP worker callback (Cursor path).
- Hosted clients require **their** redirect URIs on IAM (see [Platform redirect URIs](#platform-redirect-uris-to-allowlist)).
- MCP `POST /mcp` returns `401` without `WWW-Authenticate` + `resource_metadata` pointing at protected-resource metadata (Claude requirement for Workers-hosted MCP).
- ChatGPT often expects **Dynamic Client Registration** (`registration_endpoint`); IAM does not expose it yet.

---

## Platform redirect URIs to allowlist

Register on IAM `oauth_clients` (`iam_mcp_inneranimalmedia` or dedicated client rows) before native connector OAuth:

| Host | Redirect URI |
|------|----------------|
| Claude.ai | `https://claude.ai/api/mcp/auth_callback` |
| Claude.com | `https://claude.com/api/mcp/auth_callback` |
| ChatGPT | `https://chatgpt.com/connector_platform_oauth_redirect` |
| ChatGPT (legacy) | `https://chat.openai.com/connector_platform_oauth_redirect` |
| Cursor / MCP worker (shipped) | `https://mcp.inneranimalmedia.com/auth/callback` |

Claude egress allowlist (if using WAF): Anthropic `160.79.104.0/21` — [IP reference](https://platform.claude.com/docs/en/api/ip-addresses).

---

## Copy-paste: ChatGPT (Custom GPT / Project instructions)

```markdown
# Inner Animal Media — Agent Sam MCP (IAM OAuth)

## Identity
- MCP server URL: https://mcp.inneranimalmedia.com/mcp
- OAuth provider (IAM): https://inneranimalmedia.com
- Canonical OAuth client_id: iam_mcp_inneranimalmedia
- Scopes: iam:profile iam:workspaces mcp:tools mcp:userinfo
- Accountability: plan_accountability_spine_20260524 | workflow mcp_oauth_provider_cutover | project mcp_oauth

## What you are NOT
- NOT the Supabase Management integration (dashboard Connect Supabase).
- NOT the Cloudflare Workers MCP plugin.

## Authentication (current production path)
1. User completes IAM OAuth in browser: https://mcp.inneranimalmedia.com/auth/connect
2. User approves at inneranimalmedia.com/oauth/mcp/consent (workspace picker).
3. User copies one-time Bearer (mcp_oauth_…).
4. Every MCP call:
   Authorization: Bearer <token>
   Accept: application/json, text/event-stream
   Content-Type: application/json

## Do not
- Put tokens in connector URL (?token=, ?apiKey=).
- Assume Supabase or Cloudflare credentials replace IAM MCP bearer.

## Verify before claiming success
- GET …/auth/status → authenticated: true
- POST …/mcp tools/list → large tool list
- D1 mcp_workspace_tokens has token_type=oauth for user

## Native ChatGPT connector OAuth
Only after IAM allowlists ChatGPT redirect URIs and MCP exposes protected-resource metadata + 401 WWW-Authenticate. Until then: Bearer from /auth/connect only.
```

**ChatGPT UI (when native OAuth is ready):** Settings → Apps & Connectors → Add connector → URL `https://mcp.inneranimalmedia.com/mcp` → Authentication **OAuth** → IAM consent. Log MCP OAuth deploys to Supabase `build_deploy_events`.

---

## Copy-paste: Claude.ai (Project / connector instructions)

```markdown
# Inner Animal Media — Agent Sam MCP (IAM OAuth)

## MCP endpoint
https://mcp.inneranimalmedia.com/mcp

## OAuth architecture
- Resource server: mcp.inneranimalmedia.com
- Authorization server: inneranimalmedia.com
  - Authorize: GET /api/oauth/authorize
  - Token: POST /api/oauth/token
  - Consent: /oauth/mcp/consent?authorization_id=oaa_*
- Discovery: GET https://mcp.inneranimalmedia.com/.well-known/oauth-authorization-server

## Separate integrations
- Supabase: dashboard integration OAuth — Postgres/agent_memory/accountability, NOT this MCP bearer.
- Cloudflare: platform MCP — Workers/D1/R2; does not replace IAM MCP OAuth.

## Connect today
### Option A — Bearer (works now)
1. Human: https://mcp.inneranimalmedia.com/auth/connect → copy Bearer.
2. Settings → Connectors → Add custom connector → URL above.
3. Paste bearer in Advanced settings if the product allows static bearer.

### Option B — Claude API
Messages API MCP connector: authorization_token = bearer from Option A.
Header: anthropic-beta: mcp-client-2025-11-20

### Option C — Native OAuth connector (after IAM/MCP backlog)
Allowlist claude.ai + claude.com callbacks; MCP 401 + oauth-protected-resource metadata required.

## Accountability (Supabase)
plan_id: plan_accountability_spine_20260524
Tables: agentsam_plans, agentsam_plan_tasks, agentsam_workflow_runs,
        agentsam_workflow_steps, agentsam_tool_call_events, agentsam_error_events,
        build_deploy_events
```

**Claude docs:** [Authentication for connectors](https://claude.com/docs/connectors/building/authentication)

---

## Cursor `mcp.json`

```json
{
  "mcpServers": {
    "inneranimalmedia": {
      "url": "https://mcp.inneranimalmedia.com/mcp",
      "headers": {
        "Authorization": "Bearer <access_token from /auth/connect>",
        "Accept": "application/json, text/event-stream"
      }
    }
  }
}
```

Restart Cursor after updating the bearer.

---

## Alignment checklist

### D1 (operational truth)

```sql
SELECT client_id, redirect_uris, total_authorizations, last_used_at
FROM oauth_clients WHERE client_id = 'iam_mcp_inneranimalmedia';

SELECT COUNT(*) AS oauth_active
FROM mcp_workspace_tokens
WHERE token_type = 'oauth' AND is_active = 1;
```

### Supabase (accountability spine)

- Plan: `plan_accountability_spine_20260524`
- After IAM or MCP deploy for this initiative: insert into `public.build_deploy_events`
- Tool usage: `agentsam_tool_call_events`; failures: `agentsam_error_events`

### Per user

One OAuth token per workspace chosen at consent. Re-run `/auth/connect` to rotate.

---

## Engineering backlog (native connectors)

1. **D1 migration** — extend `oauth_clients.redirect_uris` with Claude + ChatGPT callbacks (or separate `client_id` per host).
2. **MCP worker** — `GET /.well-known/oauth-protected-resource` + `POST /mcp` returns `401` with:
   `WWW-Authenticate: Bearer resource_metadata="https://mcp.inneranimalmedia.com/.well-known/oauth-protected-resource"`
3. **IAM** — optional `registration_endpoint` for ChatGPT DCR; refresh tokens + `offline_access` when hosts request it.
4. **Optional** — `oauth_anthropic_creds` via `mcp-review@anthropic.com` for Anthropic-held client credentials.

---

## Practical recommendation

| Tool | Use now | After backlog |
|------|---------|----------------|
| Cursor | `/auth/connect` → `mcp.json` | Same |
| Claude API / scripts | Bearer + `authorization_token` | Native connector OAuth |
| Claude.ai web | Bearer if UI allows | Settings → OAuth connector |
| ChatGPT | Bearer via API/backend; not native OAuth-only connector | Developer Mode OAuth connector |
| Supabase data | Existing Supabase integration | Unchanged |
| Cloudflare ops | Existing Cloudflare MCP | Unchanged |
