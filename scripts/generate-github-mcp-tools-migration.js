#!/usr/bin/env node
/**
 * Generates migrations/702_register_github_official_mcp_tools.sql by calling
 * tools/list on GitHub's official remote MCP server and emitting one
 * agentsam_tools row per tool (handler_type='mcp', server_key='github-official').
 *
 * Why generate instead of hand-write: GitHub's official server has ~75 tools
 * across 18 toolsets and its input schemas change with releases (see their
 * changelog — Projects consolidation, new search_commits, etc). Pulling live
 * from tools/list guarantees the D1 catalog matches the real contract instead
 * of a stale manual transcription.
 *
 * Usage:
 *   GITHUB_TOKEN=ghp_xxx node scripts/generate-github-mcp-tools-migration.js
 *   # or reuse whatever token your `gh auth token` / stored OAuth token is:
 *   GITHUB_TOKEN=$(gh auth token) node scripts/generate-github-mcp-tools-migration.js
 *
 * The token here is ONLY used to call tools/list once, locally, to read the
 * schema — it is never written to the migration file or committed anywhere.
 * At runtime, Agent Sam resolves each user's own stored GitHub OAuth token
 * (see the catalog-tool-executor.js patch) — this script does not wire that.
 */

import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const MCP_URL = 'https://api.githubcopilot.com/mcp/';
const SERVER_KEY = 'github-official';
const OUT_FILE = path.resolve('migrations/702_register_github_official_mcp_tools.sql');

const READ_PREFIXES = ['get_', 'list_', 'search_'];

function isReadOnly(toolName) {
  return READ_PREFIXES.some((p) => toolName.startsWith(p));
}

function sqlEscape(value) {
  if (value == null) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function jsonSqlEscape(value) {
  return sqlEscape(JSON.stringify(value ?? {}));
}

async function fetchToolsList(token) {
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
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

function buildToolRowSql(tool, sortPriority) {
  const toolKey = `agentsam_gh_${tool.name}`;
  const displayName = tool.name
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  const readOnly = isReadOnly(tool.name);
  const riskLevel = readOnly ? 'low' : 'medium';
  const requiresApproval = readOnly ? 0 : 1;
  const modes = readOnly
    ? '["ask","plan","debug","agent","multitask"]'
    : '["agent","multitask"]';

  const handlerConfig = {
    auth_source: 'user_oauth_github',
    server_key: SERVER_KEY,
    remote_tool: tool.name,
  };

  return `(
  ${sqlEscape(toolKey)},
  ${sqlEscape(tool.name)},
  ${sqlEscape(displayName)},
  ${sqlEscape('github.official')},
  'mcp',
  ${sqlEscape((tool.description || '').slice(0, 500))},
  ${jsonSqlEscape(tool.inputSchema || { type: 'object', properties: {} })},
  ${jsonSqlEscape(handlerConfig)},
  ${sqlEscape(MCP_URL)},
  ${sqlEscape(`github.official.${tool.name}`)},
  ${sqlEscape(riskLevel)},
  ${requiresApproval},
  0,
  1,
  0,
  '["*"]',
  ${sortPriority},
  1,
  0,
  ${sqlEscape(modes)},
  unixepoch()
)`;
}

async function main() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) {
    console.error('Set GITHUB_TOKEN (or GH_TOKEN) to a valid GitHub token before running this.');
    process.exit(1);
  }

  console.log(`Fetching tools/list from ${MCP_URL} ...`);
  const tools = await fetchToolsList(token);
  console.log(`Got ${tools.length} tools.`);

  if (!tools.length) {
    console.error('No tools returned — aborting without writing a migration.');
    process.exit(1);
  }

  const rows = tools
    .map((tool, i) => buildToolRowSql(tool, 30 + i))
    .join(',\n');

  const sql = `-- 702: Register GitHub official MCP server tools (generated).
-- Source: tools/list from ${MCP_URL}, ${tools.length} tools, generated ${new Date().toISOString()}.
-- Regenerate with: GITHUB_TOKEN=... node scripts/generate-github-mcp-tools-migration.js
--
-- Depends on 700_register_github_official_mcp_server.sql (agentsam_mcp_servers row)
-- and executeMcpCatalogRow() user_oauth_github auth in src/core/catalog-tool-executor.js.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \\
--     --remote -c wrangler.production.toml --file=./migrations/702_register_github_official_mcp_tools.sql

INSERT INTO agentsam_tools (
  tool_key, tool_name, display_name, tool_category,
  handler_type, description, input_schema, handler_config,
  mcp_service_url, capability_key,
  risk_level, requires_approval, requires_confirmation,
  is_active, is_degraded, workspace_scope, sort_priority, is_global,
  oauth_visible, modes_json, updated_at
) VALUES
${rows}
ON CONFLICT(tool_name) DO UPDATE SET
  tool_key = excluded.tool_key,
  display_name = excluded.display_name,
  tool_category = excluded.tool_category,
  handler_type = excluded.handler_type,
  description = excluded.description,
  input_schema = excluded.input_schema,
  handler_config = excluded.handler_config,
  mcp_service_url = excluded.mcp_service_url,
  capability_key = excluded.capability_key,
  risk_level = excluded.risk_level,
  requires_approval = excluded.requires_approval,
  is_active = excluded.is_active,
  workspace_scope = excluded.workspace_scope,
  sort_priority = excluded.sort_priority,
  is_global = excluded.is_global,
  modes_json = excluded.modes_json,
  updated_at = unixepoch();
`;

  await writeFile(OUT_FILE, sql, 'utf8');
  console.log(`Wrote ${OUT_FILE} (${tools.length} tool rows).`);
  console.log('Review it, then apply with wrangler d1 execute (see header comment).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
