#!/usr/bin/env node
/**
 * Generates migrations/789_agentsam_gmail_official_mcp_surface.sql from Google's
 * official Gmail MCP tools/list (no auth required for discovery).
 *
 * Usage:
 *   node scripts/generate-gmail-mcp-tools-migration.js
 *
 * Runtime auth: per-user google_gmail OAuth (user_oauth_tokens) via
 * executeMcpCatalogRow() — never platform GMAIL_DELEGATED_USER.
 */

import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const MCP_URL = 'https://gmailmcp.googleapis.com/mcp/v1';
const SERVER_KEY = 'gmail-official';
const OUT_FILE = path.resolve('migrations/789_agentsam_gmail_official_mcp_surface.sql');

const READ_TOOLS = new Set([
  'get_thread',
  'search_threads',
  'list_drafts',
  'list_labels',
]);

const APPROVAL_TOOLS = new Set([
  'create_draft',
  'create_label',
  'apply_sensitive_thread_label',
  'apply_sensitive_message_label',
]);

function sqlEscape(value) {
  if (value == null) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function jsonSqlEscape(value) {
  return sqlEscape(JSON.stringify(value ?? {}));
}

async function fetchToolsList() {
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    }),
  });
  if (!res.ok) {
    throw new Error(`tools/list failed: HTTP ${res.status} ${await res.text().catch(() => '')}`);
  }
  const body = await res.json();
  if (body.error) {
    throw new Error(`tools/list JSON-RPC error: ${JSON.stringify(body.error)}`);
  }
  return body.result?.tools ?? [];
}

function buildToolRowSql(tool) {
  const op = String(tool.name || '').trim();
  const toolKey = `agentsam_gmail_mcp_${op}`;
  const displayName = op
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  const readOnly = READ_TOOLS.has(op);
  const riskLevel = readOnly ? 'low' : APPROVAL_TOOLS.has(op) ? 'high' : 'medium';
  const requiresApproval = readOnly ? 0 : APPROVAL_TOOLS.has(op) ? 1 : 0;
  const modes = readOnly
    ? '["ask","plan","debug","agent","multitask"]'
    : requiresApproval
      ? '["agent","multitask"]'
      : '["ask","plan","debug","agent","multitask"]';

  const handlerConfig = {
    mcp_service_url: MCP_URL,
    operation: op,
    auth_source: 'user_oauth_tokens',
    provider: 'google_gmail',
    server_key: SERVER_KEY,
  };

  const description = String(tool.description || `Gmail MCP: ${op}`).slice(0, 500);

  return `(
  ${sqlEscape(toolKey)}, ${sqlEscape(toolKey)},
  ${sqlEscape(`Gmail ${displayName}`)}, ${sqlEscape('gmail.official')},
  ${sqlEscape(description)},
  ${jsonSqlEscape(tool.inputSchema || { type: 'object', properties: {} })},
  'mcp', ${jsonSqlEscape(handlerConfig)},
  ${sqlEscape(riskLevel)}, ${requiresApproval},
  '["*"]', ${sqlEscape(modes)},
  1, 1, 1, unixepoch()
)`;
}

async function main() {
  console.log(`Fetching tools/list from ${MCP_URL} ...`);
  const tools = await fetchToolsList();
  console.log(`Got ${tools.length} tools.`);

  if (!tools.length) {
    console.error('No tools returned — aborting.');
    process.exit(1);
  }

  const rows = tools.map((tool) => buildToolRowSql(tool)).join(',\n');

  const sql = `-- 789: Register Google's official Gmail MCP server tools (generated).
-- Source: tools/list from ${MCP_URL}, ${tools.length} tools, generated ${new Date().toISOString()}.
-- Regenerate: node scripts/generate-gmail-mcp-tools-migration.js
--
-- Depends on 788_register_gmail_official_mcp_server.sql and executeMcpCatalogRow()
-- google_gmail OAuth forwarding in src/core/catalog-tool-executor.js.
--
-- Multi-tenant: each call uses the signed-in user's google_gmail OAuth token(s).
-- Platform GMAIL_DELEGATED_USER / service-account JWT is NOT used for these tools.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \\
--     --remote -c wrangler.production.toml --file=./migrations/789_agentsam_gmail_official_mcp_surface.sql

INSERT INTO agentsam_tools
  (tool_key, tool_name, display_name, tool_category,
   description, input_schema,
   handler_type, handler_config,
   risk_level, requires_approval, workspace_scope, modes_json,
   oauth_visible, is_active, is_global,
   updated_at)
VALUES
${rows}
ON CONFLICT(tool_name) DO UPDATE SET
  tool_key = excluded.tool_key,
  display_name = excluded.display_name,
  tool_category = excluded.tool_category,
  description = excluded.description,
  input_schema = excluded.input_schema,
  handler_type = excluded.handler_type,
  handler_config = excluded.handler_config,
  risk_level = excluded.risk_level,
  requires_approval = excluded.requires_approval,
  workspace_scope = excluded.workspace_scope,
  modes_json = excluded.modes_json,
  oauth_visible = excluded.oauth_visible,
  is_active = excluded.is_active,
  is_global = excluded.is_global,
  updated_at = unixepoch();

UPDATE agentsam_tools
SET mcp_service_url = '${MCP_URL}',
    handler_config = json_set(
      CASE WHEN json_valid(handler_config) THEN handler_config ELSE '{}' END,
      '$.server_key', '${SERVER_KEY}'
    ),
    dispatch_target = 'both',
    updated_at = unixepoch()
WHERE tool_key LIKE 'agentsam_gmail_mcp_%';
`;

  await writeFile(OUT_FILE, sql, 'utf8');
  console.log(`Wrote ${OUT_FILE} (${tools.length} tool rows).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
