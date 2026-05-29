# Agent Sam MCP — D1 single source of truth (SSOT)

**Goal:** Add or change tools, policies, and workflow steps via **D1 migrations / admin SQL** — not Worker redeploys for every catalog tweak.

## Canonical tables (keep)

| Table | Role |
|-------|------|
| **`agentsam_tools`** | **SSOT** — `tool_key`, `handler_type`, `handler_config`, `input_schema`, risk, approval, `mcp_service_url` |
| **`agentsam_mcp_oauth_tool_allowlist`** | OAuth client surface (which keys external connectors may list/call) |
| **`agentsam_mcp_allowlist`** | Per-user/workspace tool grants |
| **`agentsam_capability_aliases`** | Public name → `tool_key` |
| **`agentsam_tool_policy_keys`** | Baseline policy sets (allowlist exemptions, non-cacheable tools, panel denylist) |
| **`agentsam_workflow_handlers`** | Use `executor_kind = catalog_tool` + `handler_config_json.tool_key` |
| **`mcp_workspace_tokens`** | Bearer hashes (OAuth + static); not tool config |

## Deprecating (mirror only — drop after parity audit)

| Table | Status |
|-------|--------|
| **`agentsam_mcp_tools`** | Mirror of `agentsam_tools` for legacy dashboard reads; synced by migration **450** + `patchAgentsamToolCatalogAndMirror()` |
| **`mcp_registered_tools`** | **Dropped** (migration **402**) |
| **`mcp_services`** | Endpoint catalog; migrate reads to `agentsam_mcp_servers` when ready |

## Execution paths (all read `agentsam_tools`)

| Surface | Entry |
|---------|--------|
| Agent chat | `dispatchByToolCode` → `catalog-tool-executor.js` |
| Workflow | `executor_kind = catalog_tool` (or `mcp_tool` → same dispatch after **450**) |
| MCP server `tools/call` | `loadAgentsamToolRow` → `dispatchTool` |
| IAM `/api/mcp/tools/*/config` | `patchAgentsamToolCatalogAndMirror` (writes catalog + mirror) |
| OAuth policy | `mcp-authorization.js` + `agentsam_tool_policy_keys` |

## Adding a new tool (no Worker deploy)

1. **INSERT** into `agentsam_tools` with valid `handler_type` + `handler_config` (see `validateHandlerConfigForExecution` in `agentsam-tools-catalog.js`).
2. **INSERT** into `agentsam_mcp_oauth_tool_allowlist` if OAuth clients should see it.
3. Optional: **INSERT** into `agentsam_mcp_allowlist` for strict workspaces.
4. Run mirror sync (automatic on admin config POST, or migration-style `INSERT` from **450** pattern).
5. Smoke: `POST https://mcp.inneranimalmedia.com/mcp` `tools/list` + `tools/call`.

New **`handler_type`** values still require a **one-time** executor branch in `catalog-tool-executor.js` (IAM) or `dispatchTool` (MCP server) — that is the only code coupling.

## Policy keys (`agentsam_tool_policy_keys`)

| `policy_kind` | Replaces |
|---------------|----------|
| `builtin_safe_allowlist` | `BUILTIN_SAFE_WITH_REQUIRE_ALLOWLIST` in `agent-policy.js` |
| `agent_chat_essential` | `AGENT_CHAT_ESSENTIAL_TOOL_KEYS` |
| `non_cacheable` | `NON_CACHEABLE_TOOLS` in `mcp-tool-execution.js` |
| `mcp_panel_denylist` | `MCP_PANEL_SLUG_DENYLIST` in `mcp.js` (seeded; wire read path when panel uses D1) |

Edit policy without deploy:

```sql
INSERT OR IGNORE INTO agentsam_tool_policy_keys (id, policy_kind, tool_key, sort_order)
VALUES ('atpk_custom_1', 'agent_chat_essential', 'my_new_tool', 100);
```

## Apply migration 450

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
  -c wrangler.production.toml --file=./migrations/450_agentsam_mcp_ssot_unify.sql
```

Deploy order when changing runtime code:

1. Apply **450** on D1
2. `npm run deploy:full` (IAM Worker)
3. `cd ~/inneranimalmedia-mcp-server && npx wrangler deploy --config wrangler.jsonc`

## Drop checklist (future)

- [ ] Zero `SELECT` from `agentsam_mcp_tools` in `src/` and MCP server (except mirror sync module)
- [ ] Dashboard settings use `agentsam_tools` only
- [ ] `mcp_tool_calls` → `agentsam_tool_call_log` only
- [ ] Views recreated without `agentsam_mcp_tools` dependency
