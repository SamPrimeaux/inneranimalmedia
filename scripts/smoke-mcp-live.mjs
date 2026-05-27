#!/usr/bin/env node
/**
 * Authenticated MCP production smoke — tools/list diff + safe tools/call matrix.
 *
 * Usage:
 *   MCP_AUTH_TOKEN='...' node scripts/smoke-mcp-live.mjs
 *   node scripts/smoke-mcp-live.mjs   # loads MCP_AUTH_TOKEN from .env.cloudflare if set
 *
 * Env:
 *   MCP_AUTH_TOKEN     Required bearer (OAuth or service token)
 *   MCP_URL            Default https://mcp.inneranimalmedia.com/mcp
 *   SKIP_D1_GROUND     Set 1 to skip wrangler D1 queries (offline MCP-only)
 *   SKIP_TOOLS_CALL    Set 1 to only run tools/list + diff
 *   MCP_AUTH_TOKEN     Bearer (or set AGENTSAM_BRIDGE_KEY + MCP_USE_BRIDGE=1)
 *   MCP_USE_BRIDGE     Use AGENTSAM_BRIDGE_KEY from .env.cloudflare (internal path)
 *   OAUTH_TOKEN        Alias for MCP_AUTH_TOKEN when testing OAuth allowlist surface
 *
 * Output:
 *   reports/mcp-live-smoke/<runId>/summary.json
 *   reports/mcp-live-smoke/<runId>/matrix.md
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const MCP_EXECUTABLE = new Set([
  'r2',
  'github',
  'http',
  'terminal',
  'time',
  'ai',
  'proxy',
  'mcp',
  'd1',
  'builtin',
]);

const OAUTH_CLIENT = 'iam_mcp_inneranimalmedia';

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

const MCP_URL = (process.env.MCP_URL || 'https://mcp.inneranimalmedia.com/mcp').replace(/\/$/, '');
const USE_BRIDGE = String(process.env.MCP_USE_BRIDGE || '') === '1';
const TOKEN = USE_BRIDGE
  ? String(process.env.AGENTSAM_BRIDGE_KEY || '').trim()
  : String(process.env.OAUTH_TOKEN || process.env.MCP_AUTH_TOKEN || '').trim();
const SKIP_D1 = String(process.env.SKIP_D1_GROUND || '') === '1';
const SKIP_CALL = String(process.env.SKIP_TOOLS_CALL || '') === '1';

const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + 'Z';
const OUT_DIR = path.join(REPO_ROOT, 'reports', 'mcp-live-smoke', RUN_ID);

function d1Query(sql) {
  const cmd = [
    `"${path.join(REPO_ROOT, 'scripts/with-cloudflare-env.sh')}"`,
    'npx wrangler d1 execute inneranimalmedia-business --remote',
    '-c wrangler.production.toml',
    '--json',
    `--command "${sql.replace(/"/g, '\\"')}"`,
  ].join(' ');
  const raw = execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const parsed = JSON.parse(raw);
  return parsed[0]?.results ?? [];
}

async function mcpRpc(id, method, params = {}) {
  const t0 = Date.now();
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  const wall_ms = Date.now() - t0;
  const text = await res.text();
  const line = text.split('\n').find((l) => l.startsWith('data:'));
  const payload = line ? line.replace(/^data:\s*/, '').trim() : text.trim();
  let json = null;
  try {
    json = JSON.parse(payload);
  } catch {
    json = { parse_error: true, raw: text.slice(0, 800) };
  }
  return { http_status: res.status, wall_ms, json };
}

function toolText(result) {
  const content = result?.content;
  if (!Array.isArray(content) || !content[0]) return '';
  return String(content[0].text ?? '').slice(0, 400);
}

function classifyCallOutcome(step) {
  const err = step.json?.error;
  if (err) return { ok: false, reason: err.message || JSON.stringify(err) };
  const res = step.json?.result;
  if (res?.isError) return { ok: false, reason: toolText(res) || 'isError' };
  const text = toolText(res);
  if (/^Error:/i.test(text)) return { ok: false, reason: text.slice(0, 200) };
  if (/Unknown R2 operation/i.test(text)) return { ok: false, reason: text.slice(0, 200) };
  return { ok: true, preview: text.slice(0, 120) };
}

function validateCatalogRow(row) {
  const handlerType = String(row?.handler_type || '').toLowerCase();
  if (!MCP_EXECUTABLE.has(handlerType)) {
    return { ok: false, reason: `handler_type=${handlerType}` };
  }
  let cfg = {};
  try {
    cfg = row?.handler_config ? JSON.parse(String(row.handler_config)) : {};
  } catch {
    return { ok: false, reason: 'invalid handler_config JSON' };
  }
  if (!cfg || typeof cfg !== 'object') {
    return { ok: false, reason: 'invalid handler_config' };
  }
  if (handlerType === 'builtin') return { ok: true };
  if (handlerType === 'd1' && trim(cfg.sql)) return { ok: true };
  if (handlerType === 'http' && (trim(cfg.url) || trim(cfg.base_url) || trim(cfg.endpoint))) {
    return { ok: true };
  }
  if (handlerType === 'proxy' && (trim(cfg.proxy_tool) || trim(cfg.fallback))) return { ok: true };
  if (['r2', 'github', 'terminal', 'ai', 'time', 'mcp'].includes(handlerType)) {
    if (trim(cfg.operation) || trim(cfg.auth_source) || trim(cfg.proxy_tool) || trim(cfg.url)) {
      return { ok: true };
    }
    return { ok: false, reason: 'missing operation/auth/url in handler_config' };
  }
  if (!Object.keys(cfg).length) return { ok: false, reason: 'empty handler_config' };
  return { ok: true };
}

function trim(v) {
  return v == null ? '' : String(v).trim();
}

function simulateOAuthToolsList(allowKeys, aliasMap, activeByKey) {
  const expanded = new Set();
  const publicNameByHandler = new Map();
  for (const k of allowKeys) {
    const handler = aliasMap[k] || k;
    expanded.add(handler);
    if (!publicNameByHandler.has(handler)) publicNameByHandler.set(handler, k);
  }
  const wouldList = [];
  const blocked = [];
  for (const allowKey of allowKeys) {
    const handler = aliasMap[allowKey] || allowKey;
    const row = activeByKey[handler] || activeByKey[allowKey];
    if (!row) {
      blocked.push({ allow_key: allowKey, reason: 'no agentsam_tools row' });
      continue;
    }
    const v = validateCatalogRow(row);
    if (!v.ok) {
      blocked.push({ allow_key: allowKey, handler_key: handler, reason: v.reason });
      continue;
    }
    wouldList.push(publicNameByHandler.get(handler) || handler);
  }
  return {
    expected_count: wouldList.length,
    expected_names: [...new Set(wouldList)].sort(),
    blocked,
  };
}

/** Calls run for any authenticated token; picks names present on live list when possible. */
function buildSafeCalls(listedNames) {
  const set = new Set(listedNames);
  const calls = [];
  const add = (name, lane, args, note) => {
    if (!set.has(name)) return;
    calls.push({ name, lane, arguments: args, note });
  };
  add(
    'd1_query',
    'd1',
    {
      query: "SELECT id, name, tenant_id FROM workspaces WHERE id = 'ws_inneranimalmedia' LIMIT 1",
    },
    'scoped SELECT via d1_query (workspaces.id)',
  );
  add('r2_list', 'r2', { bucket: 'iam-platform', prefix: '', limit: 3 }, 'handler r2_list (catalog operation field)');
  add('github_repos', 'github', {}, 'github list_repos');
  if (set.has('agentsam_health_check')) {
    calls.push({
      name: 'agentsam_health_check',
      lane: 'd1-oauth',
      arguments: {},
      note: 'OAuth discovery — bind_workspace on workspaces.id',
    });
  }
  if (set.has('agentsam_r2_list')) {
    calls.push({
      name: 'agentsam_r2_list',
      lane: 'r2-oauth',
      arguments: { bucket: 'iam-platform', prefix: '', limit: 3 },
      note: 'OAuth alias → r2_list',
    });
  }
  return calls;
}

async function main() {
  if (!TOKEN) {
    console.error('Set MCP_AUTH_TOKEN (Bearer for mcp.inneranimalmedia.com).');
    process.exit(2);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const summary = {
    run_id: RUN_ID,
    mcp_url: MCP_URL,
    token_mode: USE_BRIDGE ? 'bridge' : 'bearer',
    token_present: true,
    token_fingerprint: `${TOKEN.slice(0, 6)}…${TOKEN.slice(-4)}`,
    d1_ground_truth: null,
    auth_status: null,
    tools_list: null,
    diff: null,
    tools_call: [],
    risks: [],
    success: false,
  };

  if (!SKIP_D1) {
    const allowlist = d1Query(
      `SELECT tool_key FROM agentsam_mcp_oauth_tool_allowlist WHERE client_id='${OAUTH_CLIENT}' AND COALESCE(is_active,1)=1 ORDER BY sort_order, tool_key`,
    );
    const activeTools = d1Query(
      `SELECT tool_key, handler_type, tool_category, handler_config FROM agentsam_tools WHERE COALESCE(is_active,1)=1 AND COALESCE(is_degraded,0)=0`,
    );
    const aliases = d1Query(
      `SELECT abstract_capability, match_value FROM agentsam_capability_aliases WHERE COALESCE(is_active,1)=1`,
    );
    const aliasMap = Object.fromEntries(
      aliases.map((r) => [String(r.abstract_capability), String(r.match_value)]),
    );
    const activeByKey = Object.fromEntries(
      activeTools.map((r) => [String(r.tool_key), r]),
    );
    const nonExecutable = activeTools.filter(
      (r) => !MCP_EXECUTABLE.has(String(r.handler_type || '').toLowerCase()),
    );
    const allowKeys = allowlist.map((r) => r.tool_key);
    summary.d1_ground_truth = {
      oauth_allowlist_count: allowlist.length,
      oauth_allowlist_keys: allowKeys,
      active_tools_count: activeTools.length,
      non_executable_handler_count: nonExecutable.length,
      non_executable_by_type: nonExecutable.reduce((acc, r) => {
        const t = r.handler_type;
        acc[t] = (acc[t] || 0) + 1;
        return acc;
      }, {}),
      catalog_constant_76_note: 'CATALOG_ACTIVE_TOOL_COUNT in MCP repo may still say 76',
      simulated_oauth_tools_list: simulateOAuthToolsList(allowKeys, aliasMap, activeByKey),
    };
    summary._aliasMap = aliasMap;
    summary._activeByKey = activeByKey;
  }

  const authRes = await fetch('https://mcp.inneranimalmedia.com/auth/status', {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const authJson = await authRes.json().catch(() => ({}));
  summary.auth_status = { http_status: authRes.status, body: authJson };

  const init = await mcpRpc(1, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'smoke-mcp-live', version: '1' },
  });
  const toolsList = await mcpRpc(2, 'tools/list', {});
  const listed = toolsList.json?.result?.tools ?? [];
  const listedNames = listed.map((t) => String(t.name));

  summary.tools_list = {
    http_status: toolsList.http_status,
    wall_ms: toolsList.wall_ms,
    count: listedNames.length,
    names: listedNames,
    error: toolsList.json?.error ?? null,
  };

  if (summary.d1_ground_truth) {
    const allow = new Set(summary.d1_ground_truth.oauth_allowlist_keys);
    const aliasMap = summary._aliasMap;
    const activeByKey = summary._activeByKey;
    const listedSet = new Set(listedNames);

    const allowlistAnalysis = summary.d1_ground_truth.oauth_allowlist_keys.map((key) => {
      const handlerKey = aliasMap[key] || key;
      const row = activeByKey[handlerKey] || activeByKey[key];
      const handlerType = row?.handler_type ?? null;
      const executable = handlerType
        ? MCP_EXECUTABLE.has(String(handlerType).toLowerCase())
        : null;
      return {
        allow_key: key,
        resolved_handler_key: handlerKey,
        in_tools_list: listedSet.has(key),
        d1_row: !!row,
        handler_type: handlerType,
        mcp_executable: executable,
        list_gap:
          !listedSet.has(key) &&
          (executable === false || executable === null),
      };
    });

    const inListNotAllow = listedNames.filter((n) => !allow.has(n));
    const allowMissingFromList = allowlistAnalysis.filter((a) => !a.in_tools_list);
    const allowBroken = allowlistAnalysis.filter((a) => a.list_gap);

    summary.diff = {
      listed_count: listedNames.length,
      allowlist_count: allow.size,
      in_list_not_on_allowlist: inListNotAllow,
      allowlist_missing_from_list: allowMissingFromList.map((a) => a.allow_key),
      allowlist_not_executable_in_d1: allowBroken,
    };

    if (allowMissingFromList.length && !process.env.OAUTH_TOKEN) {
      summary.risks.push({
        code: 'ALLOWLIST_GAPS',
        message: `${allowMissingFromList.length} OAuth allowlist keys absent from live tools/list`,
      });
    }
    if (inListNotAllow.length) {
      summary.risks.push({
        code: 'LIST_EXTRA',
        message: `${inListNotAllow.length} tools/list names not on OAuth allowlist (token may be non-OAuth lane)`,
      });
    }
    const silentDead = allowlistAnalysis.filter(
      (a) => a.d1_row && a.mcp_executable === false,
    );
    if (silentDead.length) {
      summary.risks.push({
        code: 'ALLOWLIST_DEAD_HANDLER',
        message: `${silentDead.length} allowlist keys resolve to non-MCP-executable handler_type in D1`,
        keys: silentDead.map((a) => a.allow_key),
      });
    }

    delete summary._aliasMap;
    delete summary._activeByKey;
  }

  if (!SKIP_CALL) {
    let id = 10;
    const safeCalls = buildSafeCalls(listedNames);
    if (!safeCalls.length) {
      summary.risks.push({
        code: 'NO_CALLABLE_ON_LIST',
        message: 'None of the default safe call targets appear on live tools/list',
      });
    }
    for (const spec of safeCalls) {
      id += 1;
      const step = await mcpRpc(id, 'tools/call', {
        name: spec.name,
        arguments: spec.arguments,
      });
      const outcome = classifyCallOutcome(step);
      summary.tools_call.push({
        ...spec,
        http_status: step.http_status,
        wall_ms: step.wall_ms,
        ok: outcome.ok,
        reason: outcome.reason ?? null,
        preview: outcome.preview ?? null,
      });
    }
  }

  const okInit = init.http_status === 200 && !init.json?.error;
  const okList = toolsList.http_status === 200 && listedNames.length > 0;
  const okAuth = authRes.status === 200 && authJson.authenticated === true;
  const callsOk =
    SKIP_CALL || summary.tools_call.every((c) => c.ok);
  const isOAuthToken =
    String(authJson?.token_type || '').toLowerCase() === 'oauth';
  const OAUTH_MIN_TOOLS = 19;
  const oauthListOk =
    !isOAuthToken ||
    (listedNames.length >= OAUTH_MIN_TOOLS && listedNames.some((n) => n.startsWith('agentsam_')));
  const oauthPlumbingOk = !isOAuthToken || (okAuth && oauthListOk && callsOk);
  if (isOAuthToken && summary.diff?.allowlist_missing_from_list?.length) {
    summary.risks.push({
      code: 'ALLOWLIST_GAPS',
      message: `${summary.diff.allowlist_missing_from_list.length} OAuth allowlist keys absent from live tools/list (informational; plumbing pass uses count>=${OAUTH_MIN_TOOLS})`,
      informational: true,
    });
  }
  summary.success = okInit && okList && okAuth && callsOk && (isOAuthToken ? oauthPlumbingOk : true);
  summary.auth_token_type = authJson?.token_type ?? null;

  const md = buildMarkdown(summary);
  writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
  writeFileSync(path.join(OUT_DIR, 'matrix.md'), md);

  console.log(`Wrote ${OUT_DIR}/summary.json`);
  console.log(`Wrote ${OUT_DIR}/matrix.md`);
  console.log('');
  console.log(md);
  process.exit(summary.success ? 0 : 1);
}

function buildMarkdown(s) {
  const lines = [
    `# MCP live smoke — ${s.run_id}`,
    '',
    `- MCP: ${s.mcp_url}`,
    `- Auth status: ${s.auth_status?.http_status} authenticated=${s.auth_status?.body?.authenticated}`,
    `- tools/list: ${s.tools_list?.count} tools (${s.tools_list?.wall_ms}ms)`,
    '',
  ];
  if (s.d1_ground_truth) {
    lines.push(
      '## D1 ground truth',
      '',
      `| Metric | Count |`,
      `|--------|------:|`,
      `| OAuth allowlist (\`${OAUTH_CLIENT}\`) | ${s.d1_ground_truth.oauth_allowlist_count} |`,
      `| Active \`agentsam_tools\` | ${s.d1_ground_truth.active_tools_count} |`,
      `| Non-MCP-executable handler types | ${s.d1_ground_truth.non_executable_handler_count} |`,
      '',
    );
    const sim = s.d1_ground_truth.simulated_oauth_tools_list;
    if (sim) {
      lines.push(
        `**Simulated OAuth tools/list** (catalog validation only): **${sim.expected_count}** tools would list; **${sim.blocked.length}** allowlist keys blocked.`,
        '',
      );
      if (sim.blocked.length) {
        lines.push('Blocked allowlist keys:');
        for (const b of sim.blocked.slice(0, 12)) {
          lines.push(`- \`${b.allow_key}\`: ${b.reason}`);
        }
        if (sim.blocked.length > 12) lines.push(`- … +${sim.blocked.length - 12} more`);
        lines.push('');
      }
    }
  }
  if (s.diff) {
    lines.push('## tools/list diff', '');
    if (s.diff.allowlist_missing_from_list?.length) {
      lines.push('**Missing from live list (allowlist):**');
      for (const k of s.diff.allowlist_missing_from_list) lines.push(`- ${k}`);
      lines.push('');
    }
    if (s.diff.allowlist_not_executable_in_d1?.length) {
      lines.push('**Allowlist keys not executable (D1 handler_type):**');
      for (const a of s.diff.allowlist_not_executable_in_d1) {
        lines.push(`- ${a.allow_key} → ${a.handler_type}`);
      }
      lines.push('');
    }
    if (s.diff.in_list_not_on_allowlist?.length) {
      lines.push('**In tools/list but not on OAuth allowlist:**');
      for (const k of s.diff.in_list_not_on_allowlist) lines.push(`- ${k}`);
      lines.push('');
    }
  }
  if (s.tools_call?.length) {
    lines.push('## tools/call', '', '| Tool | Lane | OK | ms | Note |', '|------|------|:--:|---:|------|');
    for (const c of s.tools_call) {
      lines.push(
        `| ${c.name} | ${c.lane} | ${c.ok ? '✓' : '✗'} | ${c.wall_ms} | ${c.ok ? (c.preview || 'ok') : c.reason} |`,
      );
    }
    lines.push('');
  }
  if (s.risks?.length) {
    lines.push('## Risks', '');
    for (const r of s.risks) lines.push(`- **${r.code}**: ${r.message}`);
    lines.push('');
  }
  lines.push(`**Overall:** ${s.success ? 'PASS' : 'FAIL'}`);
  return lines.join('\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
