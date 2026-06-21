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
 *   MCP_EXEC_SMOKE  Set to 1 to call agentsam_terminal_local echo execos_ok (bridge/binding path).
 *   MCP_BRIDGE_TOKEN Optional bridge token override for MCP_EXEC_SMOKE (defaults to MCP_AUTH_TOKEN).
 *   MCP_AUDIT_SMOKE  Set to 1 to call agentsam_mcp_audit (limit 5).
 *
 * Output:
 *   reports/mcp-smoke/<runId>/summary.json
 */

import { mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { loadEnvCloudflare } from './lib/r2-inventory-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

loadEnvCloudflare(REPO_ROOT);

const MCP_URL = (process.env.MCP_URL || 'https://mcp.inneranimalmedia.com/mcp').replace(/\/$/, '');
const TOKEN = String(process.env.MCP_AUTH_TOKEN || '').trim();
const BRIDGE_TOKEN = String(process.env.MCP_BRIDGE_TOKEN || process.env.MCP_AUTH_TOKEN || '').trim();
const R2_BUCKET = String(process.env.R2_LIST_BUCKET ?? 'iam-platform').trim();
const MCP_EXEC_SMOKE = String(process.env.MCP_EXEC_SMOKE || '').trim() === '1';
const MCP_AUDIT_SMOKE = String(process.env.MCP_AUDIT_SMOKE || '').trim() === '1';

const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + 'Z';
const OUT_DIR = path.join(REPO_ROOT, 'reports', 'mcp-smoke', RUN_ID);

async function mcpJsonRpc(id, method, params = {}, token = TOKEN, extraHeaders = {}) {
  const t0 = Date.now();
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...extraHeaders,
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

function parseToolCallPayload(stepJson) {
  const text = stepJson?.result?.content?.[0]?.text;
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw_text: String(text).slice(0, 500) };
  }
}

async function main() {
  if (!TOKEN) {
    console.error('Set MCP_AUTH_TOKEN (Bearer for mcp.inneranimalmedia.com).');
    process.exit(2);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const results = { run_id: RUN_ID, mcp_url: MCP_URL, steps: [] };

  if (MCP_EXEC_SMOKE && !BRIDGE_TOKEN) {
    console.error('MCP_EXEC_SMOKE=1 requires MCP_BRIDGE_TOKEN or MCP_AUTH_TOKEN (bridge lane).');
    process.exit(2);
  }

  const init = await mcpJsonRpc(1, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'mcp-smoke', version: '1' },
  });
  results.steps.push({ name: 'initialize', ...init });

  const toolsList = await mcpJsonRpc(2, 'tools/list', {});
  results.steps.push({ name: 'tools/list', ...toolsList });
  const toolCount = toolsList.json?.result?.tools?.length ?? 0;

  let okR2 = true;
  if (R2_BUCKET) {
    const r2 = await mcpJsonRpc(3, 'tools/call', {
      name: 'r2_list',
      arguments: { bucket: R2_BUCKET, prefix: '', limit: 5 },
    });
    okR2 = r2.http_status === 200 && !r2.json?.error;
    results.steps.push({ name: 'r2_list', bucket: R2_BUCKET, ...r2 });
  }

  let rpcId = 4;
  let okExec = true;
  if (MCP_EXEC_SMOKE) {
    const exec = await mcpJsonRpc(
      rpcId++,
      'tools/call',
      {
        name: 'agentsam_terminal_local',
        arguments: { command: 'echo execos_ok' },
      },
      BRIDGE_TOKEN,
    );
    const execPayload = parseToolCallPayload(exec.json);
    const resolution = execPayload?.connection_resolution ?? null;
    okExec =
      exec.http_status === 200 &&
      !exec.json?.error &&
      String(execPayload?.stdout || '').includes('execos_ok') &&
      resolution === 'execos_binding';
    results.steps.push({
      name: 'agentsam_terminal_local_execos',
      connection_resolution: resolution,
      latency_ms: execPayload?.latency_ms ?? null,
      ok: okExec,
      ...exec,
    });
  }

  let okAudit = true;
  if (MCP_AUDIT_SMOKE) {
    const audit = await mcpJsonRpc(
      rpcId++,
      'tools/call',
      {
        name: 'agentsam_mcp_audit',
        arguments: { limit: 5, since_hours: 24 },
      },
      TOKEN,
      { 'X-MCP-Refresh': 'true' },
    );
    const auditPayload = parseToolCallPayload(audit.json);
    okAudit =
      audit.http_status === 200 &&
      !audit.json?.error &&
      auditPayload?.ok === true &&
      Number(auditPayload?.row_count) >= 0;
    results.steps.push({
      name: 'agentsam_mcp_audit',
      row_count: auditPayload?.row_count ?? null,
      ok: okAudit,
      ...audit,
    });
  }

  const okInit = init.http_status === 200 && !init.json?.error;
  const okTools = toolsList.http_status === 200 && toolCount > 0;
  results.success = okInit && okTools && okR2 && okExec && okAudit;
  results.tool_count = toolCount;

  const outPath = path.join(OUT_DIR, 'summary.json');
  writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`Wrote ${outPath}`);
  console.log(
    `  initialize: ${okInit ? 'ok' : 'fail'}  tools: ${toolCount}  r2_list: ${R2_BUCKET ? (okR2 ? 'ok' : 'fail') : 'skipped'}  execos: ${MCP_EXEC_SMOKE ? (okExec ? 'ok' : 'fail') : 'skipped'}  mcp_audit: ${MCP_AUDIT_SMOKE ? (okAudit ? 'ok' : 'fail') : 'skipped'}`,
  );
  process.exit(results.success ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
