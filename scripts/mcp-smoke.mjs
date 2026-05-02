#!/usr/bin/env node
/**
 * mcp-smoke.mjs — Cheap MCP health: tools/list + optional r2_list (read-only).
 *
 * Usage:
 *   MCP_AUTH_TOKEN='...' node scripts/mcp-smoke.mjs
 *   MCP_URL=https://mcp.inneranimalmedia.com/mcp MCP_AUTH_TOKEN='...' node scripts/mcp-smoke.mjs
 *
 * Env:
 *   MCP_AUTH_TOKEN  Bearer token (same as mcp.json)
 *   MCP_URL         Default https://mcp.inneranimalmedia.com/mcp
 *   R2_LIST_BUCKET  Set to run r2_list (default: iam-platform). Empty = skip r2_list.
 *
 * Output:
 *   reports/mcp-smoke/<runId>/summary.json
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

function loadEnvCloudflare() {
  const p = path.join(REPO_ROOT, '.env.cloudflare');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^export\s+([A-Z0-9_]+)=(.*)/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
loadEnvCloudflare();

const MCP_URL = (process.env.MCP_URL || 'https://mcp.inneranimalmedia.com/mcp').replace(/\/$/, '');
const TOKEN = String(process.env.MCP_AUTH_TOKEN || '').trim();
const R2_BUCKET = String(process.env.R2_LIST_BUCKET ?? 'iam-platform').trim();

const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + 'Z';
const OUT_DIR = path.join(REPO_ROOT, 'reports', 'mcp-smoke', RUN_ID);

async function mcpJsonRpc(id, method, params = {}) {
  const t0 = Date.now();
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params,
    }),
  });
  const wall_ms = Date.now() - t0;
  const text = await res.text();
  let json = null;
  const line = text.split('\n').find((l) => l.startsWith('data:'));
  const payload = line ? line.replace(/^data:\s*/, '').trim() : text.trim();
  try {
    json = JSON.parse(payload);
  } catch {
    json = { parse_error: true, raw: text.slice(0, 500) };
  }
  return { http_status: res.status, wall_ms, json };
}

async function main() {
  if (!TOKEN) {
    console.error('Set MCP_AUTH_TOKEN (Bearer for mcp.inneranimalmedia.com).');
    process.exit(2);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const results = { run_id: RUN_ID, mcp_url: MCP_URL, steps: [] };

  const init = await mcpJsonRpc(1, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'mcp-smoke', version: '1' },
  });
  results.steps.push({ name: 'initialize', ...init });

  const toolsList = await mcpJsonRpc(2, 'tools/list', {});
  results.steps.push({ name: 'tools/list', ...toolsList });
  const toolCount = toolsList.json?.result?.tools?.length ?? 0;

  if (R2_BUCKET) {
    const r2 = await mcpJsonRpc(3, 'tools/call', {
      name: 'r2_list',
      arguments: { bucket: R2_BUCKET, prefix: '', limit: 5 },
    });
    results.steps.push({ name: 'r2_list', bucket: R2_BUCKET, ...r2 });
  }

  const okInit = init.http_status === 200 && !init.json?.error;
  const okTools = toolsList.http_status === 200 && toolCount > 0;
  const last = results.steps[results.steps.length - 1];
  const okR2 = !R2_BUCKET || (last.http_status === 200 && !last.json?.error);
  results.success = okInit && okTools && okR2;
  results.tool_count = toolCount;

  const outPath = path.join(OUT_DIR, 'summary.json');
  writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`Wrote ${outPath}`);
  console.log(`  initialize: ${okInit ? 'ok' : 'fail'}  tools: ${toolCount}  r2_list: ${R2_BUCKET ? (okR2 ? 'ok' : 'fail') : 'skipped'}`);
  process.exit(results.success ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
