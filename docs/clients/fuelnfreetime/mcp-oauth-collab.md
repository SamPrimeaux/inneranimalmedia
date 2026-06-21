# Fuel N Free Time — MCP OAuth (Sam + Connor)

Remote dev on **fuelnfreetime** from Claude, ChatGPT, or phone — same MCP server, dual attribution.

## MCP worker architecture (one platform D1 binding)

The MCP worker (`inneranimalmedia-mcp-server`) has **one** D1 binding:

| Binding | Database | Purpose |
|---|---|---|
| `DB` | `inneranimalmedia-business` | Auth, workspace resolution, allowlists, audit |

**Client databases (fuelnfreetime, companionscpas, etc.) are workspace concerns** — not worker-level bindings. Workspace-bound D1 is reached via **credentialed D1 REST** (platform token or workspace BYOK), not extra wrangler bindings on the MCP worker.

The MCP worker `CLOUDFLARE_API_TOKEN` must include **Account → D1 → Edit** (or Read) on the IAM Cloudflare account for superadmin / platform-member REST queries. A 403 on REST is often mislabeled `cross_account_database` in tool output.

## Connect once per app

1. Open **Claude** or **ChatGPT** → Settings → Integrations / Connectors
2. **Remove** any existing Inner Animal / MCP connector that failed
3. Add connector — **URL only** (no manual OAuth fields):

```
https://mcp.inneranimalmedia.com/mcp
```

4. Sign in as your IAM account when the browser opens
5. Approve consent

**Do not** paste a Client ID, Client Secret, or `inneranimalmedia.com` as the MCP URL.

### If you see `{"error":"invalid_client"}` with `client_id=Ov23...`

That means a **GitHub OAuth App ID** was sent instead of the MCP client (`iam_mcp_inneranimalmedia`). Usually caused by:

- Wrong connector URL (e.g. `inneranimalmedia.com` instead of `mcp.inneranimalmedia.com/mcp`)
- Manually filling OAuth Client ID in Claude's advanced settings

**Fix:** Delete the connector and re-add using only the MCP URL above. On the login redirect, the URL should contain `client_id=iam_mcp_inneranimalmedia`, not `Ov23...`.

**Connor:** sign in with **`connordmcneely@gmail.com`** (Claude account / Google) or `connordmcneely@leadershiplegacydigital.com` — both map to the same IAM user.  
**Sam:** any superadmin IAM email

### If Claude says it "couldn't register with Inner Animal Media's sign-in service"

That is Claude's **Dynamic Client Registration** step (`POST /api/oauth/register`) failing before login.  
After the platform fix, delete the connector and re-add using **only** `https://mcp.inneranimalmedia.com/mcp`.

## Connor scope (not superadmin, no client D1 via MCP)

Connor is **`is_superadmin = 0`**. He does **not** get platform IAM catalog D1 or `agentsam_d1_query` / `agentsam_d1_write` on OAuth.

**Allowed:** GitHub (fuel repo), R2 (fuel bucket), `agentsam_terminal_sandbox`, workspace context, health check — on `ws_fuelnfreetime` and his own `ws_connor_mcneely`.

**Fuel D1 / schema / migrations:** use **terminal sandbox**, not MCP D1 tools:

```
Using agentsam_terminal_sandbox with workspace_slug "fuelnfreetime" and zone_slug "fuelnfreetime", run:
npx wrangler d1 execute fuelnfreetime --remote --command "SELECT name FROM sqlite_master WHERE type='table' LIMIT 5"
```

Runs under `.mcp-zones/fuelnfreetime` in the fuel workspace root — isolated from production paths outside the zone.

**Sam** may still use `agentsam_d1_query` with `workspace_slug: "fuelnfreetime"` (superadmin REST lane).

## Sam: fuel D1 via MCP (optional)

Pass the slug on every D1 tool call:

```json
{
  "workspace_slug": "fuelnfreetime",
  "sql": "SELECT name FROM sqlite_master WHERE type='table' LIMIT 5"
}
```

Success response includes:
- `d1_database_id`: `9fd6ff92-e407-4b51-8b01-3c93f3845bb2`
- `requested_workspace_id`: `ws_fuelnfreetime`

## Accountability (DORA)

Each tool call logs **who** and **which app**:

| Table | Fields |
|---|---|
| `mcp_audit_log` | `user_id`, `workspace_id`, `external_client_key` (`claude` / `chatgpt`) |
| `agentsam_tool_call_log` | `user_id`, `workspace_id`, `source_tool` |
| `agentsam_mcp_tool_execution` | `user_id`, `workspace_id`, `actor_source` |

Sam and Connor are distinguishable by `user_id` even on the same workspace.

## Limits

Both are **owners** on `ws_fuelnfreetime` → **no MCP rate limits** on that workspace context.

## DORA project id

Deploy attribution for fuel: `PROJECT_ID=proj_fuelnfreetime`

## PrimeTech CMS (dashboard)

Sam and Connor both edit **Fuel N Free Time** in PrimeTech CMS Lite when the active workspace is **Fuel N Free Time** (`ws_fuelnfreetime`):

1. Switch workspace → **Fuel N Free Time**
2. Open **Dashboard → CMS** (`/dashboard/cms`)

**Scope:** Only the `fuelnfreetime` site appears — not Sam's full IAM CMS catalog.

**Identity (critical):** Each actor keeps their own `tenant_id` (`tenant_sam_primeaux` vs `tenant_connor_mcneely`). CMS authorization is **workspace membership + `cms_site` project registry** — never routing Connor through Sam's tenant. Activity logs, drafts, and IAM_COLLAB WebSocket attachments use the authenticated user's real identity.

**Migrations:** `660_fuelnfreetime_cms_site.sql` (site seed), `661_fuelnfreetime_cms_workspace_scope.sql` (workspace-scoped registry).

### Runtime wiring (no containers for CMS edit path)

| Layer | Binding | Role for Fuel CMS |
|---|---|---|
| D1 | `DB` → `inneranimalmedia-business` | Page/section metadata, live edit sessions, bootstrap prefs |
| R2 | `ASSETS` → `inneranimalmedia` | Published + draft HTML (`cms/ws_fuelnfreetime/fuelnfreetime/...`) |
| KV | `SESSION_CACHE` | Bootstrap cache, per-user drafts, publish locks, live session hints |
| Durable Object | `IAM_COLLAB` → `IAMCollaborationSession` | Realtime presence per page room `cms:{page_id}` via `/api/collab/room/cms:{page_id}` |
| Worker | `inneranimalmedia` | `/api/cms/*` APIs + dashboard shell |

**Not used for CMS editing:** `MY_CONTAINER`, `PTY_SERVICE`, or fuel's separate D1 (`9fd6ff92…`) — those are MCP terminal / client-app lanes, not PrimeTech CMS Lite.

**Collab flow:** `POST /api/cms/live-session/join` → D1 `cms_live_edit_sessions` + KV `cms:live-session:{pageId}:{userId}` → client opens WebSocket to `IAM_COLLAB` room `cms:{pageId}` (each socket stores the user's own `userId` + `tenantId` from auth).
