-- 1007: Enforce user_client_allowlist + Cursor DCR (localhost patterns).
-- Cursor must not hardcode iam_mcp_inneranimalmedia; DCR like Claude/ChatGPT.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml \
--     --file=./migrations/1007_mcp_user_client_allowlist_enforced.sql

UPDATE agentsam_mcp_oauth_external_client_registry
SET
  redirect_host_patterns = json('["mcp.inneranimalmedia.com","localhost","127.0.0.1"]'),
  notes = TRIM(COALESCE(notes, '') || ' | 2026-07-23: localhost for Cursor DCR callback'),
  updated_at = unixepoch()
WHERE client_key = 'cursor';

INSERT OR REPLACE INTO agentsam_rules_document (
  id, rule_key, user_id, workspace_id, title, body_markdown, version, is_active,
  created_at_epoch, updated_at_epoch, apply_mode, rule_type, trigger_type, sort_order, notes, source_stored
) VALUES (
  'rule_mcp_user_client_allowlist_enforced',
  'rule_mcp_user_client_allowlist_enforced',
  '',
  'ws_inneranimalmedia',
  'LOCKED: MCP user_client_allowlist is mandatory — not optional',
  '# MCP external client allowlist (LOCKED)

## Law
1. `agentsam_mcp_oauth_user_client_allowlist` is **required** for OAuth MCP hosts (Cursor, Claude, ChatGPT).
2. Consent **writes** the grant. Runtime tools/call **requires** an active grant (`requireGrant`).
3. Revoke = `is_active=0` → hard deny.
4. Cursor must **Dynamic Client Register** (`iam_dcr_*`) — do **not** hardcode `clientId: iam_mcp_inneranimalmedia` in `.cursor/mcp.json`.
5. Canonical client stays the **tool catalog** SSOT; DCR clients fall back via `resolveMcpOAuthCatalogClientId`.

## Config
```json
{ "mcpServers": { "inneranimalmedia": { "url": "https://mcp.inneranimalmedia.com/mcp" } } }
```
',
  1,
  1,
  unixepoch(),
  unixepoch(),
  'always',
  'platform',
  'system',
  8,
  '2026-07-23: enforce allowlist; Cursor via DCR',
  'migrations/1007_mcp_user_client_allowlist_enforced.sql'
);
