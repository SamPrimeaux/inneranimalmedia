#!/usr/bin/env node
/**
 * OAuth allowlist ↔ agentsam_tools catalog alignment audit.
 *
 * Usage:
 *   node scripts/audit/oauth-allowlist-catalog-alignment.mjs
 *   REMOTE=1 node scripts/audit/oauth-allowlist-catalog-alignment.mjs
 *
 * Env:
 *   REMOTE=1           Query production D1 via wrangler (default: local instructions only)
 *   OAUTH_CLIENT_ID    Default iam_mcp_inneranimalmedia
 *   WRANGLER_CONFIG    Default wrangler.production.toml
 *   D1_DATABASE        Default inneranimalmedia-business
 */
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  IAM_MCP_OAUTH_CLIENT_ID,
  TOOL_SUPERSESSION,
  isCanonicalActiveToolRow,
  resolveToolSupersession,
} from '../../src/core/agentsam-tool-supersession.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const CLIENT_ID = String(process.env.OAUTH_CLIENT_ID || IAM_MCP_OAUTH_CLIENT_ID).trim();
const WRANGLER_CONFIG = String(process.env.WRANGLER_CONFIG || 'wrangler.production.toml').trim();
const D1_DATABASE = String(process.env.D1_DATABASE || 'inneranimalmedia-business').trim();
const USE_REMOTE = String(process.env.REMOTE || '') === '1';

function d1Query(sql) {
  const cmd = [
    `"${path.join(REPO_ROOT, 'scripts/with-cloudflare-env.sh')}"`,
    'npx wrangler d1 execute',
    D1_DATABASE,
    USE_REMOTE ? '--remote' : '',
    `-c ${WRANGLER_CONFIG}`,
    '--json',
    `--command "${sql.replace(/"/g, '\\"')}"`,
  ]
    .filter(Boolean)
    .join(' ');
  const raw = execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const parsed = JSON.parse(raw);
  return parsed[0]?.results ?? [];
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exitCode = 1;
}

function warn(msg) {
  console.warn(`WARN: ${msg}`);
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

async function main() {
  if (!USE_REMOTE) {
    console.log('Set REMOTE=1 to run against D1. Static supersession map entries:', Object.keys(TOOL_SUPERSESSION).length);
    process.exit(0);
  }

  const violations = [];

  const allowlist = d1Query(`
    SELECT a.tool_key, a.access_class, a.sort_order, a.is_active AS allowlist_active,
           t.is_active, t.is_degraded, t.oauth_visible, t.handler_type,
           json_extract(t.handler_config, '$.operation') AS operation
    FROM agentsam_mcp_oauth_tool_allowlist a
    LEFT JOIN agentsam_tools t ON t.tool_key = a.tool_key
    WHERE a.client_id = '${CLIENT_ID}'
    ORDER BY a.sort_order, a.tool_key
  `);

  const activeAllowlist = allowlist.filter((r) => Number(r.allowlist_active ?? 1) === 1);

  for (const row of activeAllowlist) {
    const key = String(row.tool_key || '').trim();
    if (!key) continue;
    const successor = resolveToolSupersession(key);
    if (successor !== key) {
      violations.push({
        kind: 'allowlist_legacy_key',
        tool_key: key,
        successor,
        fix: `deactivate allowlist row or replace with ${successor}`,
      });
      continue;
    }
    if (!row.tool_key || row.is_active == null) {
      violations.push({ kind: 'allowlist_missing_catalog', tool_key: key });
      continue;
    }
    if (!isCanonicalActiveToolRow(row)) {
      violations.push({
        kind: 'allowlist_inactive_catalog',
        tool_key: key,
        is_active: row.is_active,
        is_degraded: row.is_degraded,
      });
    }
  }

  const brokenAliases = d1Query(`
    SELECT a.abstract_capability, a.match_value
    FROM agentsam_capability_aliases a
    LEFT JOIN agentsam_tools t ON t.tool_key = a.match_value
    WHERE a.is_active = 1
      AND lower(trim(a.match_kind)) = 'tool_key'
      AND (
        t.tool_key IS NULL
        OR COALESCE(t.is_active, 1) <> 1
        OR COALESCE(t.is_degraded, 0) <> 0
      )
    ORDER BY a.match_value
    LIMIT 200
  `);

  for (const row of brokenAliases) {
    const legacy = String(row.match_value || '').trim();
    const successor = resolveToolSupersession(legacy);
    const inSupersessionMap = Object.prototype.hasOwnProperty.call(TOOL_SUPERSESSION, legacy);
    if (!inSupersessionMap) {
      warn(`capability_alias_out_of_scope: ${row.abstract_capability} → ${legacy} (Tag D — manual review)`);
      continue;
    }
    violations.push({
      kind: 'capability_alias_stale_target',
      abstract_capability: row.abstract_capability,
      match_value: legacy,
      suggested: successor !== legacy ? successor : '(manual review)',
    });
  }

  const oauthVisibleGap = d1Query(`
    SELECT a.tool_key
    FROM agentsam_mcp_oauth_tool_allowlist a
    INNER JOIN agentsam_tools t ON t.tool_key = a.tool_key
    WHERE a.client_id = '${CLIENT_ID}'
      AND COALESCE(a.is_active, 1) = 1
      AND COALESCE(t.is_active, 1) = 1
      AND COALESCE(t.is_degraded, 0) = 0
      AND COALESCE(t.oauth_visible, 0) = 0
    ORDER BY a.tool_key
  `);

  for (const row of oauthVisibleGap) {
    violations.push({
      kind: 'allowlist_active_but_not_oauth_visible',
      tool_key: row.tool_key,
      fix: 'set oauth_visible=1 or remove from OAuth allowlist',
    });
  }

  const tokenDrift = d1Query(`
    SELECT id, allowed_tools
    FROM mcp_workspace_tokens
    WHERE lower(COALESCE(token_type, '')) = 'oauth'
      AND COALESCE(is_active, 1) = 1
      AND COALESCE(revoked_at, 0) = 0
      AND allowed_tools IS NOT NULL
      AND trim(allowed_tools) NOT IN ('', '[]', 'null')
    LIMIT 50
  `);

  const deadKeys = new Set(
    Object.keys(TOOL_SUPERSESSION).filter((k) => TOOL_SUPERSESSION[k] !== k),
  );

  for (const tok of tokenDrift) {
    let tools = [];
    try {
      tools = JSON.parse(String(tok.allowed_tools || '[]'));
    } catch {
      violations.push({ kind: 'token_invalid_allowed_tools_json', token_id: tok.id });
      continue;
    }
    if (!Array.isArray(tools)) continue;
    for (const name of tools) {
      const k = String(name || '').trim();
      if (deadKeys.has(k)) {
        violations.push({
          kind: 'token_snapshot_legacy_key',
          token_id: tok.id,
          tool_key: k,
          successor: TOOL_SUPERSESSION[k],
        });
      }
    }
  }

  const byKind = {};
  for (const v of violations) {
    byKind[v.kind] = (byKind[v.kind] || 0) + 1;
  }

  console.log(JSON.stringify({ client_id: CLIENT_ID, violation_counts: byKind, total: violations.length }, null, 2));

  if (violations.length) {
    console.log('\nSample violations (first 25):');
    console.log(JSON.stringify(violations.slice(0, 25), null, 2));
    fail(`${violations.length} alignment violation(s) — run migration 518 or repair D1`);
  } else {
    ok(`OAuth allowlist aligned with catalog (${activeAllowlist.length} active allowlist keys)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
