#!/usr/bin/env node
/**
 * OAuth MCP smoke — D1 + R2 priority tools (ChatGPT/Claude connector surface).
 *
 * Usage:
 *   MCP_AUTH_TOKEN='...' node scripts/mcp-oauth-d1-r2-smoke.mjs
 *
 * Env: MCP_AUTH_TOKEN, MCP_URL (default https://mcp.inneranimalmedia.com/mcp)
 * Output: reports/mcp-oauth-d1-r2/<runId>/summary.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

function loadEnv() {
  const p = path.join(REPO_ROOT, '.env.cloudflare');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^export\s+([A-Z0-9_]+)=(.*)/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
loadEnv();

const MCP_URL = (process.env.MCP_URL || 'https://mcp.inneranimalmedia.com/mcp').replace(/\/$/, '');
const TOKEN = String(process.env.MCP_AUTH_TOKEN || process.env.OAUTH_TOKEN || '').trim();
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + 'Z';
const OUT_DIR = path.join(REPO_ROOT, 'reports', 'mcp-oauth-d1-r2', RUN_ID);

const PRIORITY_CALLS = [
  { name: 'agentsam_db_schema', arguments: {}, expect: ['success', 'mode', 'schema', 'objects'] },
  {
    name: 'agentsam_db_query',
    arguments: {
      sql: "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name LIMIT 5",
    },
    expect: ['success', 'rows'],
  },
  { name: 'agentsam_health_check', arguments: {}, expect: ['ok', 'workspace_id'] },
  { name: 'agentsam_vectorize_describe', arguments: { tier: 'all' }, expect: ['ok', 'dimensions'] },
  {
    name: 'agentsam_r2_read',
    arguments: { bucket: 'iam-platform', prefix: '', mode: 'list', limit: 5 },
    expect: ['key', 'Error', 'Unknown R2'],
  },
  { name: 'agentsam_memory_search', arguments: { top_k: 3 }, expect: [] },
];

async function mcpCall(name, args) {
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: name,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });
  const text = await res.text();
  const line = text.split('\n').find((l) => l.startsWith('data:'));
  const payload = line ? line.replace(/^data:\s*/, '').trim() : text.trim();
  let json;
  try {
    json = JSON.parse(payload);
  } catch {
    json = { parse_error: true, raw: text.slice(0, 500) };
  }
  const body = json?.result?.content?.[0]?.text ?? '';
  return { http_status: res.status, json, text: String(body).slice(0, 800) };
}

function classify(step) {
  const { text, json } = step;
  if (json?.error) return { ok: false, kind: 'rpc_error', detail: JSON.stringify(json.error) };
  if (json?.result?.isError) return { ok: false, kind: 'tool_error', detail: text };
  if (/trim is not defined/i.test(text)) return { ok: false, kind: 'trim_bug', detail: text };
  if (/reading 'replace'/i.test(text)) return { ok: false, kind: 'replace_bug', detail: text };
  if (/^Error:/i.test(text)) return { ok: false, kind: 'structured_error', detail: text.slice(0, 200) };
  return { ok: true, kind: 'success', detail: text.slice(0, 160) };
}

async function main() {
  if (!TOKEN) {
    console.error('Set MCP_AUTH_TOKEN');
    process.exit(2);
  }
  mkdirSync(OUT_DIR, { recursive: true });

  const listRes = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'tools/list', params: {} }),
  });
  const listText = await listRes.text();
  const listLine = listText.split('\n').find((l) => l.startsWith('data:'));
  const listJson = JSON.parse(listLine ? listLine.replace(/^data:\s*/, '') : listText);
  const listed = new Set((listJson?.result?.tools ?? []).map((t) => t.name));

  const results = [];
  for (const spec of PRIORITY_CALLS) {
    const visible = listed.has(spec.name);
    if (!visible) {
      results.push({ name: spec.name, visible: false, skipped: true });
      continue;
    }
    const out = await mcpCall(spec.name, spec.arguments);
    const verdict = classify(out);
    results.push({
      name: spec.name,
      visible: true,
      arguments: spec.arguments,
      http_status: out.http_status,
      ...verdict,
    });
  }

  const summary = {
    run_id: RUN_ID,
    mcp_url: MCP_URL,
    tools_listed: listed.size,
    has_r2_read: listed.has('agentsam_r2_read'),
    has_r2_upload: listed.has('agentsam_r2_upload'),
    has_db_query: listed.has('agentsam_db_query'),
    results,
    trim_bugs: results.filter((r) => r.kind === 'trim_bug').length,
    replace_bugs: results.filter((r) => r.kind === 'replace_bug').length,
  };
  writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  const hardFail = summary.trim_bugs > 0 || summary.replace_bugs > 0;
  process.exit(hardFail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
