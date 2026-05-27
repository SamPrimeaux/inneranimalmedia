#!/usr/bin/env node
/**
 * Validate agentsam_db_write → d1_write execution on live MCP (no ChatGPT).
 *
 * Usage:
 *   MCP_AUTH_TOKEN='…' node scripts/validate-agentsam-db-write-mcp.mjs
 *   MCP_USE_BRIDGE=1 node scripts/validate-agentsam-db-write-mcp.mjs
 *
 * Env:
 *   MEMORY_KEY   Default connector_d1_architecture_live_2026_05_27
 *   SKIP_CLEANUP Set 1 to leave the test memory row
 */
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const MCP_URL = (process.env.MCP_URL || 'https://mcp.inneranimalmedia.com/mcp').replace(/\/$/, '');
const MEMORY_KEY =
  process.env.MEMORY_KEY || 'connector_d1_architecture_live_2026_05_27';

function loadEnvCloudflare() {
  const p = path.join(REPO_ROOT, '.env.cloudflare');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^export\s+([A-Z0-9_]+)=(.*)/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

loadEnvCloudflare();

const USE_BRIDGE = String(process.env.MCP_USE_BRIDGE || '') === '1';
const TOKEN = USE_BRIDGE
  ? String(process.env.AGENTSAM_BRIDGE_KEY || '').trim()
  : String(process.env.OAUTH_TOKEN || process.env.MCP_AUTH_TOKEN || '').trim();

function d1Query(sql) {
  const cmd = [
    `"${path.join(REPO_ROOT, 'scripts/with-cloudflare-env.sh')}"`,
    'npx wrangler d1 execute inneranimalmedia-business --remote',
    '-c wrangler.production.toml',
    '--json',
    `--command "${sql.replace(/"/g, '\\"')}"`,
  ].join(' ');
  const raw = execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  return JSON.parse(raw)[0]?.results ?? [];
}

async function mcpRpc(id, method, params = {}) {
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  const text = await res.text();
  const line = text.split('\n').find((l) => l.startsWith('data:'));
  const payload = line ? line.replace(/^data:\s*/, '').trim() : text.trim();
  return { http_status: res.status, json: JSON.parse(payload) };
}

function toolText(result) {
  const content = result?.content;
  if (!Array.isArray(content) || !content[0]) return '';
  return String(content[0].text ?? '');
}

function escSql(s) {
  return String(s).replace(/'/g, "''");
}

async function main() {
  if (!TOKEN) {
    console.error('Set MCP_AUTH_TOKEN or MCP_USE_BRIDGE=1 with AGENTSAM_BRIDGE_KEY');
    process.exit(2);
  }

  const authRes = await fetch('https://mcp.inneranimalmedia.com/auth/status', {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const auth = await authRes.json().catch(() => ({}));
  const ws = auth.workspace_id || auth.workspace?.id;
  const tenant = auth.tenant_id || auth.tenant?.id;
  let userId = auth.user_id || auth.user?.id;

  if (!ws || !tenant) {
    console.error('auth/status missing workspace_id or tenant_id', auth);
    process.exit(2);
  }

  if (!userId) {
    const owners = d1Query(
      `SELECT user_id FROM mcp_workspace_tokens
        WHERE workspace_id = '${escSql(ws)}'
          AND user_id IS NOT NULL AND trim(user_id) != ''
          AND COALESCE(is_active, 1) = 1
        ORDER BY CASE WHEN lower(COALESCE(token_type,'')) = 'oauth' THEN 0 ELSE 1 END,
                 COALESCE(created_at, 0) DESC
        LIMIT 1`,
    );
    userId = owners[0]?.user_id || null;
  }
  if (!userId) {
    const members = d1Query(
      `SELECT user_id FROM workspace_members
        WHERE workspace_id = '${escSql(ws)}' AND COALESCE(is_active, 1) = 1
        LIMIT 1`,
    );
    userId = members[0]?.user_id || null;
  }
  if (!userId) {
    console.error('Could not resolve user_id for workspace', ws);
    process.exit(2);
  }

  console.log('auth', {
    mode: USE_BRIDGE ? 'bridge' : 'oauth',
    workspace_id: ws,
    tenant_id: tenant,
    user_id: userId.slice(0, 12) + '…',
    scopes: auth.scopes || auth.scope,
  });

  const approvalId = `appr_mcp_validate_${Date.now().toString(36)}`;
  const expires = Math.floor(Date.now() / 1000) + 3600;
  d1Query(
    `INSERT INTO agentsam_approval_queue (
      id, tenant_id, workspace_id, user_id,
      tool_name, tool_key, action_summary, input_json,
      risk_level, approval_type, status, approved_by, decided_at, expires_at, created_at
    ) VALUES (
      '${escSql(approvalId)}',
      '${escSql(tenant)}',
      '${escSql(ws)}',
      '${escSql(userId)}',
      'agentsam_db_write',
      'agentsam_db_write',
      'MCP validate agentsam_db_write → agentsam_memory',
      '{}',
      'medium',
      'db_write',
      'approved',
      '${escSql(userId)}',
      unixepoch(),
      ${expires},
      unixepoch()
    )`,
  );
  console.log('approval', approvalId);

  const memId = `mem_${Date.now().toString(36)}`;
  const value = escSql(
    JSON.stringify({
      validated_at: new Date().toISOString(),
      path: 'agentsam_db_write→d1_write',
      client: 'validate-agentsam-db-write-mcp.mjs',
    }),
  );
  const insertSql = `INSERT INTO agentsam_memory (
    id, tenant_id, user_id, workspace_id, memory_type, key, value, source, confidence, created_at, updated_at
  ) VALUES (
    '${escSql(memId)}',
    '${escSql(tenant)}',
    '${escSql(userId)}',
    '${escSql(ws)}',
    'project',
    '${escSql(MEMORY_KEY)}',
    '${value}',
    'mcp_validate_db_write',
    1.0,
    unixepoch(),
    unixepoch()
  ) ON CONFLICT(tenant_id, user_id, key) DO UPDATE SET
    value = excluded.value,
    source = excluded.source,
    updated_at = unixepoch()`;

  await mcpRpc(1, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'validate-db-write', version: '1' },
  });

  const list = await mcpRpc(2, 'tools/list', {});
  const names = (list.json?.result?.tools ?? []).map((t) => t.name);
  const hasWrite = names.includes('agentsam_db_write');
  console.log('tools/list', { count: names.length, has_agentsam_db_write: hasWrite });

  const call = await mcpRpc(3, 'tools/call', {
    name: 'agentsam_db_write',
    arguments: {
      approval_id: approvalId,
      query: insertSql,
      sql: insertSql,
    },
  });

  const err = call.json?.error;
  const res = call.json?.result;
  const text = toolText(res);
  const isErr = res?.isError || !!err;

  console.log('tools/call agentsam_db_write', {
    http_status: call.http_status,
    rpc_error: err || null,
    isError: !!isErr,
    preview: text.slice(0, 500),
  });

  const rows = d1Query(
    `SELECT id, key, substr(value,1,120) AS value_preview, updated_at
       FROM agentsam_memory
      WHERE tenant_id = '${escSql(tenant)}'
        AND user_id = '${escSql(userId)}'
        AND key = '${escSql(MEMORY_KEY)}'
      LIMIT 1`,
  );

  console.log('d1_verify', rows[0] || null);

  if (process.env.SKIP_CLEANUP !== '1' && rows[0]) {
    d1Query(
      `DELETE FROM agentsam_approval_queue WHERE id = '${escSql(approvalId)}'`,
    );
  }

  const ok = !isErr && rows.length > 0 && /mcp_validate_db_write|validated_at/.test(rows[0].value_preview || '');
  if (!ok) {
    process.exit(1);
  }
  console.log('PASS: agentsam_db_write executed and agentsam_memory row confirmed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
