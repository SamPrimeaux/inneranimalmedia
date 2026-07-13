#!/usr/bin/env node
/**
 * Agent routing / tool-profile gate — mint session, hit live /api/agent/chat,
 * assert D1 intent decisions + tool-call health. Deploy success alone never passes.
 *
 * Usage (repo root, .env.cloudflare present):
 *   npm run gate:agent-routing
 *   npm run gate:agent-routing -- --cases=G-ask-repo,G-pty-status
 *   npm run gate:agent-routing -- --include-image   # opt-in; image fast path already proven elsewhere
 *   npm run gate:agent-routing -- --rounds=2
 *
 * Receipts: tmp/gate-agent-routing/<ts>.json
 * D1: agentsam_gate_runs (+ ticket consecutive_pass_count when migration 840 applied)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadEnvCloudflare, REPO_ROOT } from './lib/load-env-cloudflare.mjs';
import { mintAgentSessionCookie, resolveOperatorUserId } from './lib/mint-agent-session.mjs';
import { d1Query, sqlQuote } from './lib/d1-remote.mjs';

loadEnvCloudflare();

const BASE_URL = (process.env.IAM_BASE_URL || 'https://inneranimalmedia.com').replace(/\/$/, '');
const WORKSPACE_ID = (process.env.WORKSPACE_ID || process.env.IAM_WORKSPACE_ID || 'ws_inneranimalmedia').trim();
const TENANT_ID = (process.env.IAM_TENANT_ID || 'tenant_sam_primeaux').trim();
const CHAT_TIMEOUT_MS = Number(process.env.IAM_GATE_CHAT_TIMEOUT_MS || 120_000);
const TICKET_ID = 'tkt_routing_tool_ssot';

/** @typedef {{
 *   id: string,
 *   kind: 'chat'|'d1',
 *   prompt?: string,
 *   mode?: string,
 *   assert: (ctx: GateCaseCtx) => string[],
 * }} GateCase */

/** @typedef {{
 *   caseId: string,
 *   conversationId?: string,
 *   httpStatus?: number,
 *   sseText?: string,
 *   toolNames?: string[],
 *   d1ToolCalls?: Record<string, unknown>[],
 *   toolErrors?: string[],
 *   streamErrors?: string[],
 *   decision?: Record<string, unknown>|null,
 *   decisions?: Record<string, unknown>[],
 *   d1Rows?: Record<string, unknown>[],
 * }} GateCaseCtx */

/** Default gate — routing + tool health only (image fast path proven separately). */
/** @type {GateCase[]} */
const CORE_CASES = [
  {
    id: 'G-tool-profiles',
    kind: 'd1',
    assert: () => assertToolProfilesResolveToCatalog(),
  },
  {
    id: 'G-pty-status',
    kind: 'd1',
    assert: (ctx) => {
      const fails = [];
      const row = (ctx.d1Rows || [])[0];
      if (!row) {
        fails.push('pty_git_status row missing');
        return fails;
      }
      const cfg = String(row.handler_config || '');
      if (!cfg.includes('command_template')) {
        fails.push('pty_git_status.handler_config missing command_template');
      }
      return fails;
    },
  },
  {
    id: 'G-ask-repo',
    kind: 'chat',
    prompt:
      'Use fs_read_file path package.json — from the file contents only, what is the npm package name for this repo?',
    mode: 'agent',
    assert: assertInspectishChat({
      maxToolsFromDecisionMeta: 20,
      requireMinTools: 1,
      maxDistinctTools: 20,
      banSubstrings: [
        'x-google-enum-descriptions',
        'terminal tool requires command',
        'Gemini 400',
      ],
      banToolPrefixes: ['gmail_', 'agentsam_gmail'],
    }),
  },
  {
    id: 'G-inspect',
    kind: 'chat',
    prompt:
      'can you inspect the repo/propose how we can improve the tool structure/agent to tool/task type?',
    mode: 'agent',
    assert: assertInspectishChat({
      expectTaskSpecKeyIncludes: 'inspect',
      maxToolsFromDecisionMeta: 20,
      requireMinTools: 1,
      maxDistinctTools: 20,
      banSubstrings: [
        'x-google-enum-descriptions',
        'terminal tool requires command',
        'Gemini 400',
        '__IAM_PROVIDER_HTTP__',
      ],
      banToolPrefixes: ['gmail_', 'agentsam_gmail'],
    }),
  },
    {
    id: 'G-d1',
    kind: 'chat',
    prompt: 'Use agentsam_d1_query: what tables are in our D1 database? Answer briefly from query results only.',
    mode: 'agent',
    assert: (ctx) => {
      const fails = assertNoBannedErrors(ctx, [
        'x-google-enum-descriptions',
        'Gemini 400',
        '__IAM_PROVIDER_HTTP__',
      ]);
      const tt = String(ctx.decision?.task_type || '');
      if (tt === 'image_generation') {
        fails.push('G-d1 must not be image_generation');
      }
      if (!ctx.decision) {
        fails.push('missing agentsam_intent_decisions row');
        return fails;
      }
      if (tt !== 'd1_query') {
        fails.push(`expected task_type=d1_query, got ${tt || '?'}`);
      }
      fails.push(...assertRequiredToolCall(ctx, /d1_query|d1_schema|agentsam_d1/i, 'G-d1'));
      return fails;
    },
  },
];

/** Opt-in — image fast path skips tool loop; routing-only check when explicitly requested. */
/** @type {GateCase[]} */
const OPTIONAL_CASES = [
  {
    id: 'G-mail',
    kind: 'chat',
    prompt: 'Check my inbox — how many unread emails do I have? Use Gmail tools only, not D1.',
    mode: 'agent',
    assert: (ctx) => {
      const fails = assertNoBannedErrors(ctx, ['Gemini 400', '__IAM_PROVIDER_HTTP__']);
      if (!ctx.decision) {
        fails.push('missing agentsam_intent_decisions row');
        return fails;
      }
      const tt = String(ctx.decision.task_type || '');
      if (!['gmail', 'mail_triage'].includes(tt)) {
        fails.push(`expected task_type=gmail|mail_triage, got ${tt || '?'}`);
      }
      let meta = {};
      try {
        meta = JSON.parse(String(ctx.decision.metadata_json || '{}'));
      } catch {
        fails.push('metadata_json not JSON');
      }
      const kwTask = String(meta.keyword_task || '');
      const kwConf = Number(meta.keyword_confidence);
      if (kwTask === 'gmail' && kwConf >= 0.8) {
        /* keyword path — good */
      } else if (tt === 'mail_triage') {
        /* explicit route/task pin from harness is acceptable */
      } else if (kwConf < 0.8) {
        fails.push(`gmail keyword miss — keyword_task=${kwTask || '?'} confidence=${kwConf || '?'}`);
      }
      const tools = mergedToolNames(ctx);
      if (tools.some((n) => /agentsam_d1_query|d1_query/i.test(n))) {
        fails.push('mail lane must not invoke D1 query tools');
      }
      return fails;
    },
  },
  {
    id: 'G-image',
    kind: 'chat',
    prompt: 'Generate an image of a red barn',
    mode: 'agent',
    assert: (ctx) => {
      const fails = [];
      const rows = ctx.decisions || (ctx.decision ? [ctx.decision] : []);
      const spine = rows.find((r) => {
        try {
          return JSON.parse(String(r.metadata_json || '{}')).spine === 'turn-decision-v1';
        } catch {
          return false;
        }
      });
      const imageGen = rows.find((r) => String(r.task_type) === 'image_generation');
      const primary = spine || imageGen || ctx.decision;
      const tt = String(primary?.task_type || '');
      let meta = {};
      try {
        meta = JSON.parse(String(primary?.metadata_json || '{}'));
      } catch {
        /* ignore */
      }
      if (tt !== 'image_generation' && meta.imageFastPath !== true) {
        fails.push(`expected image_generation/fastPath, got task_type=${tt}`);
      }
      // image_tier is a secondary side-log after the spine — allowed alongside one spine row
      const spineCount = rows.filter((r) => {
        try {
          return JSON.parse(String(r.metadata_json || '{}')).spine === 'turn-decision-v1';
        } catch {
          return false;
        }
      }).length;
      const nonTier = rows.filter((r) => String(r.task_type) !== 'image_tier');
      if (spineCount > 1) {
        fails.push(`expected 1 spine intent decision, got ${spineCount}`);
      } else if (!spine && nonTier.length > 1) {
        fails.push(`expected 1 non-tier intent decision, got ${nonTier.length}`);
      }
      if (ctx.streamErrors?.some((e) => /Gemini 400|x-google-enum/i.test(e))) {
        fails.push('stream error looks like tool-schema Gemini 400');
      }
      return fails;
    },
  },
];

/** @type {GateCase[]} */
const CASES = [...CORE_CASES, ...OPTIONAL_CASES];

/**
 * Merge SSE tool names with D1 agentsam_tool_call_log (SSE alone is not trusted).
 * @param {GateCaseCtx} ctx
 * @param {RegExp} pattern
 * @param {string} label
 * @returns {string[]}
 */
function assertRequiredToolCall(ctx, pattern, label) {
  const names = mergedToolNames(ctx);
  if (!names.some((n) => pattern.test(n))) {
    return [
      `${label}: required tool invocation missing (need ${pattern}; sse=${(ctx.toolNames || []).join(',') || 'none'} d1_log=${(ctx.d1ToolCalls || []).map((r) => r.tool_name).join(',') || 'none'})`,
    ];
  }
  return [];
}

/** @param {GateCaseCtx} ctx */
function mergedToolNames(ctx) {
  /** @type {string[]} */
  const names = [...(ctx.toolNames || [])];
  for (const row of ctx.d1ToolCalls || []) {
    const n = row.tool_name != null ? String(row.tool_name).trim() : '';
    if (n) names.push(n);
  }
  return [...new Set(names)];
}

/**
 * @param {{
 *   expectTaskSpecKeyIncludes?: string,
 *   maxDistinctTools?: number,
 *   requireMinTools?: number,
 *   maxToolsFromDecisionMeta?: number,
 *   banSubstrings?: string[],
 *   banToolPrefixes?: string[],
 * }} opts
 */
function assertInspectishChat(opts) {
  return (ctx) => {
    const fails = assertNoBannedErrors(ctx, opts.banSubstrings || []);
    const proofTools = mergedToolNames(ctx);
    if (opts.requireMinTools != null && proofTools.length < opts.requireMinTools) {
      fails.push(
        `${ctx.caseId || 'inspect'}: expected >=${opts.requireMinTools} tools, got ${proofTools.length} (${proofTools.join(',') || 'none'})`,
      );
    }
    if (opts.maxDistinctTools != null && proofTools.length > opts.maxDistinctTools) {
      fails.push(
        `${ctx.caseId || 'inspect'}: oauth dump suspected — ${proofTools.length} tools (max ${opts.maxDistinctTools})`,
      );
    }
    if (!ctx.decision) {
      fails.push('missing agentsam_intent_decisions row');
      return fails;
    }
    let meta = {};
    try {
      meta = JSON.parse(String(ctx.decision.metadata_json || '{}'));
    } catch {
      fails.push('metadata_json not JSON');
    }
    if (meta.spine && meta.spine !== 'turn-decision-v1') {
      fails.push(`unexpected spine=${meta.spine}`);
    }
    const specKey = String(meta.taskSpecKey || '');
    const toolProfile = String(meta.taskSpec?.toolProfile || meta.toolProfile || '');
    if (opts.expectTaskSpecKeyIncludes) {
      const hay = `${specKey} ${toolProfile} ${ctx.decision.task_type}`;
      if (!hay.toLowerCase().includes(opts.expectTaskSpecKeyIncludes.toLowerCase())) {
        fails.push(
          `expected inspect-ish decision (got taskSpecKey=${specKey} toolProfile=${toolProfile} task=${ctx.decision.task_type})`,
        );
      }
    }
    for (const t of ctx.toolNames || []) {
      for (const p of opts.banToolPrefixes || []) {
        if (String(t).startsWith(p)) fails.push(`banned tool used: ${t}`);
      }
    }
    for (const err of ctx.toolErrors || []) {
      if (/terminal tool requires command/i.test(err)) {
        fails.push(`tool error: ${err.slice(0, 120)}`);
      }
    }
    // Soft signal: if many distinct tools fired, oauth dump likely still on
    if ((ctx.toolNames || []).length > (opts.maxToolsFromDecisionMeta || 20)) {
      fails.push(`too many distinct tools in one turn: ${(ctx.toolNames || []).length}`);
    }
    return fails;
  };
}

/** @param {GateCaseCtx} ctx @param {string[]} ban */
function assertNoBannedErrors(ctx, ban) {
  const fails = [];
  const blob = [
    ctx.sseText || '',
    ...(ctx.streamErrors || []),
    ...(ctx.toolErrors || []),
  ].join('\n');
  for (const b of ban) {
    if (blob.includes(b)) fails.push(`banned substring in stream/tools: ${b}`);
  }
  if (ctx.httpStatus && (ctx.httpStatus < 200 || ctx.httpStatus >= 300)) {
    fails.push(`http status ${ctx.httpStatus}`);
  }
  return fails;
}

function parseArgs(argv) {
  /** @type {{ cases: string[]|null, rounds: number, skipChat: boolean, includeImage: boolean }} */
  const out = { cases: null, rounds: 1, skipChat: false, includeImage: false };
  for (const a of argv) {
    if (a.startsWith('--cases=')) out.cases = a.slice(8).split(',').map((s) => s.trim()).filter(Boolean);
    if (a.startsWith('--rounds=')) out.rounds = Math.max(1, Number(a.slice(9)) || 1);
    if (a === '--d1-only') out.skipChat = true;
    if (a === '--include-image') out.includeImage = true;
  }
  return out;
}

/** @param {{ cases: string[]|null, includeImage: boolean }} args */
function resolveCases(args) {
  if (args.cases) return CASES.filter((c) => args.cases.includes(c.id));
  if (args.includeImage) return CASES;
  return CORE_CASES;
}

/**
 * @param {string} cookie
 * @param {string} prompt
 * @param {string} mode
 * @param {string} conversationId
 */
async function postChatSse(cookie, prompt, mode, conversationId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/api/agent/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Cookie: cookie,
        'x-iam-workspace-id': WORKSPACE_ID,
        Origin: BASE_URL,
        Referer: `${BASE_URL}/dashboard/agent`,
        'User-Agent': 'inneranimalmedia-gate-agent-routing/1.0',
      },
      body: JSON.stringify({
        message: prompt,
        messages: [{ role: 'user', content: prompt }],
        mode,
        requestedMode: mode,
        workspace_id: WORKSPACE_ID,
        tenant_id: TENANT_ID,
        conversationId,
        conversation_id: conversationId,
        session_id: conversationId,
        stream: true,
      }),
      signal: controller.signal,
    });
    const raw = await res.text();
    const parsed = parseSse(raw);
    return {
      httpStatus: res.status,
      latencyMs: Date.now() - t0,
      raw,
      ...parsed,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** @param {string} raw */
function parseSse(raw) {
  /** @type {string[]} */
  const textParts = [];
  /** @type {string[]} */
  const toolNames = [];
  /** @type {string[]} */
  const toolErrors = [];
  /** @type {string[]} */
  const streamErrors = [];
  let sawDone = false;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const chunk = line.slice(5).trim();
    if (!chunk || chunk === '[DONE]') continue;
    let evt;
    try {
      evt = JSON.parse(chunk);
    } catch {
      continue;
    }
    if (!evt || typeof evt !== 'object') continue;
    const t = evt.type;
    if (t === 'text' || t === 'thinking') {
      if (evt.text) textParts.push(String(evt.text));
    } else if (
      t === 'tool_call' ||
      t === 'tool_start' ||
      t === 'tool' ||
      t === 'tool_use' ||
      t === 'tool_blocked' ||
      t === 'tool_error'
    ) {
      const name = evt.name || evt.tool_name || evt.tool || evt.toolName;
      if (name) toolNames.push(String(name));
    } else if (t === 'tool_output' || t === 'tool_result') {
      const name = evt.name || evt.tool_name || evt.tool;
      if (name) toolNames.push(String(name));
      const out = String(evt.output || evt.text || evt.error || '');
      if (/error|failed|requires command/i.test(out)) toolErrors.push(out.slice(0, 500));
      if (evt.error) toolErrors.push(String(evt.error).slice(0, 500));
    } else if (t === 'error' || t === 'fatal') {
      streamErrors.push(String(evt.error || evt.message || JSON.stringify(evt)).slice(0, 800));
    } else if (t === 'done') {
      sawDone = true;
      if (evt.stream_failed || evt.fatal) {
        streamErrors.push(String(evt.error || 'stream_failed'));
      }
    }
  }
  return {
    sseText: textParts.join(''),
    toolNames: [...new Set(toolNames)],
    toolErrors,
    streamErrors,
    sawDone,
  };
}

/** @param {string} conversationId */
function loadDecision(conversationId) {
  const rows = d1Query(
    `SELECT id, task_type, matched_by, reason, metadata_json, created_at
     FROM agentsam_intent_decisions
     WHERE conversation_id = ${sqlQuote(conversationId)}
     ORDER BY created_at DESC
     LIMIT 5`,
  );
  const spineRows = rows.filter((r) => {
    try {
      return JSON.parse(String(r.metadata_json || '{}')).spine === 'turn-decision-v1';
    } catch {
      return false;
    }
  });
  // Prefer spine; ignore image_tier side-logs when picking primary
  const primary =
    spineRows[0] ||
    rows.find((r) => String(r.task_type) !== 'image_tier') ||
    rows[0] ||
    null;
  return {
    decision: primary,
    decisionCount: spineRows.length || rows.filter((r) => String(r.task_type) !== 'image_tier').length,
    decisions: rows,
  };
}

function loadPtyGitStatus() {
  return d1Query(
    `SELECT tool_key, handler_type, handler_config
     FROM agentsam_tools
     WHERE tool_key = 'pty_git_status'
     LIMIT 1`,
  );
}

/**
 * Every active profile tool_keys_json entry must resolve to an active catalog row
 * (tool_key or tool_name). Empty keys on default_route are allowed.
 * @returns {string[]}
 */
function assertToolProfilesResolveToCatalog() {
  const fails = [];
  let profiles;
  try {
    profiles = d1Query(
      `SELECT profile_key, tool_keys_json
       FROM agentsam_tool_profiles
       WHERE COALESCE(is_active, 1) = 1`,
    );
  } catch (e) {
    return [`agentsam_tool_profiles query failed: ${e?.message || e}`];
  }
  if (!profiles.length) {
    return ['no active agentsam_tool_profiles rows'];
  }
  let catalog;
  try {
    catalog = d1Query(
      `SELECT lower(trim(tool_key)) AS k, lower(trim(COALESCE(tool_name, ''))) AS n
       FROM agentsam_tools
       WHERE COALESCE(is_active, 1) = 1`,
    );
  } catch (e) {
    return [`agentsam_tools query failed: ${e?.message || e}`];
  }
  const live = new Set();
  for (const row of catalog) {
    if (row.k) live.add(String(row.k));
    if (row.n) live.add(String(row.n));
  }
  for (const p of profiles) {
    const key = String(p.profile_key || '');
    let keys = [];
    try {
      const parsed = JSON.parse(String(p.tool_keys_json || '[]'));
      if (!Array.isArray(parsed)) {
        fails.push(`${key}: tool_keys_json is not an array`);
        continue;
      }
      keys = parsed.map((k) => String(k).trim().toLowerCase()).filter(Boolean);
    } catch {
      fails.push(`${key}: tool_keys_json not valid JSON`);
      continue;
    }
    if (key === 'default_route' && keys.length === 0) continue;
    if (!keys.length) {
      fails.push(`${key}: empty tool_keys_json (only default_route may be empty)`);
      continue;
    }
    for (const tk of keys) {
      if (!live.has(tk)) {
        fails.push(`${key}: tool_key "${tk}" not in active agentsam_tools`);
      }
    }
  }
  try {
    const bad = d1Query(
      `SELECT b.task_type, b.profile_key
       FROM agentsam_tool_profile_bindings b
       LEFT JOIN agentsam_tool_profiles p
         ON p.profile_key = b.profile_key AND COALESCE(p.is_active, 1) = 1
       WHERE COALESCE(b.is_active, 1) = 1 AND p.profile_key IS NULL`,
    );
    for (const r of bad) {
      fails.push(`binding task_type=${r.task_type} → missing profile_key=${r.profile_key}`);
    }
  } catch (e) {
    fails.push(`agentsam_tool_profile_bindings check failed: ${e?.message || e}`);
  }
  return fails;
}

/** @param {string} conversationId */
function loadToolCallsFromD1(conversationId) {
  try {
    return d1Query(
      `SELECT tool_name, status, error_message, created_at
       FROM agentsam_tool_call_log
       WHERE conversation_id = ${sqlQuote(conversationId)}
       ORDER BY created_at DESC
       LIMIT 20`,
    );
  } catch {
    return [];
  }
}

/**
 * @param {object} receipt
 */
function persistGateRun(receipt) {
  try {
    const id = `gate_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const allPass = receipt.rounds.every((r) => r.ok);
    d1Query(
      `INSERT INTO agentsam_gate_runs (
         id, gate_key, ticket_id, git_sha, ok, rounds_json, receipt_path, created_at
       ) VALUES (
         ${sqlQuote(id)},
         'agent_routing',
         ${sqlQuote(TICKET_ID)},
         ${sqlQuote(receipt.gitSha)},
         ${allPass ? 1 : 0},
         ${sqlQuote(JSON.stringify(receipt.rounds).slice(0, 50_000))},
         ${sqlQuote(receipt.receiptPath)},
         unixepoch()
       )`,
    );
    if (allPass) {
      d1Query(
        `UPDATE agentsam_tickets
         SET consecutive_pass_count = COALESCE(consecutive_pass_count, 0) + 1,
             last_gate_run_id = ${sqlQuote(id)},
             last_gate_ok_at = unixepoch(),
             updated_at = unixepoch()
         WHERE id = ${sqlQuote(TICKET_ID)}`,
      );
      d1Query(
        `INSERT INTO agentsam_ticket_events (
           id, ticket_id, event_type, from_status, to_status, detail, commit_sha, created_at
         ) VALUES (
           ${sqlQuote(`tev_${randomUUID().replace(/-/g, '').slice(0, 16)}`)},
           ${sqlQuote(TICKET_ID)},
           'gate_pass',
           NULL,
           NULL,
           ${sqlQuote(JSON.stringify({ gate: 'agent_routing', receipt: receipt.receiptPath, round_ok: true }).slice(0, 1500))},
           ${sqlQuote(receipt.gitSha)},
           unixepoch()
         )`,
      );
    } else {
      d1Query(
        `UPDATE agentsam_tickets
         SET consecutive_pass_count = 0,
             last_gate_run_id = ${sqlQuote(id)},
             updated_at = unixepoch()
         WHERE id = ${sqlQuote(TICKET_ID)}`,
      );
      d1Query(
        `INSERT INTO agentsam_ticket_events (
           id, ticket_id, event_type, from_status, to_status, detail, commit_sha, created_at
         ) VALUES (
           ${sqlQuote(`tev_${randomUUID().replace(/-/g, '').slice(0, 16)}`)},
           ${sqlQuote(TICKET_ID)},
           'gate_fail',
           NULL,
           NULL,
           ${sqlQuote(JSON.stringify({ gate: 'agent_routing', receipt: receipt.receiptPath, failures: receipt.summaryFailures }).slice(0, 1500))},
           ${sqlQuote(receipt.gitSha)},
           unixepoch()
         )`,
      );
    }
    return id;
  } catch (e) {
    console.warn('[gate] D1 persist skipped:', e?.message || e);
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { spawnSync } = await import('node:child_process');
  const shaProc = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' });
  const gitShaVal = (shaProc.stdout || '').trim() || 'unknown';

  let cases = resolveCases(args);
  if (args.skipChat) cases = cases.filter((c) => c.kind === 'd1');

  console.log(`[gate:agent-routing] base=${BASE_URL} workspace=${WORKSPACE_ID} cases=${cases.map((c) => c.id).join(',')} rounds=${args.rounds}`);

  let cookie = null;
  const needsChat = cases.some((c) => c.kind === 'chat');
  if (needsChat) {
    const mint = await mintAgentSessionCookie({ workspaceId: WORKSPACE_ID });
    cookie = mint.cookie;
    console.log(`[gate] minted session user=${resolveOperatorUserId()} session=${mint.sessionId}`);
  }

  /** @type {object[]} */
  const roundResults = [];
  /** @type {string[]} */
  const summaryFailures = [];

  for (let round = 1; round <= args.rounds; round++) {
    console.log(`\n=== round ${round}/${args.rounds} ===`);
    /** @type {object[]} */
    const caseResults = [];
    let roundOk = true;

    for (const c of cases) {
      /** @type {GateCaseCtx} */
      const ctx = { caseId: c.id };
      try {
        if (c.kind === 'd1') {
          ctx.d1Rows = loadPtyGitStatus();
        } else {
          const conversationId = randomUUID();
          ctx.conversationId = conversationId;
          const chat = await postChatSse(cookie, c.prompt, c.mode || 'agent', conversationId);
          ctx.httpStatus = chat.httpStatus;
          ctx.sseText = chat.sseText;
          ctx.toolNames = chat.toolNames;
          ctx.toolErrors = chat.toolErrors;
          ctx.streamErrors = chat.streamErrors;
          // Intent row may lag slightly
          await new Promise((r) => setTimeout(r, 800));
          const dec = loadDecision(conversationId);
          ctx.decision = dec.decision;
          ctx.decisions = dec.decisions;
          ctx.decisionCount = dec.decisionCount;
          ctx.d1ToolCalls = loadToolCallsFromD1(conversationId);
          Object.assign(ctx, { sawDone: chat.sawDone, latencyMs: chat.latencyMs });
        }
        const fails = c.assert(ctx);
        // G-image asserts its own decision-count rules; other chat cases want one spine row
        if (
          c.kind === 'chat' &&
          c.id !== 'G-image' &&
          ctx.decisionCount != null &&
          ctx.decisionCount > 1
        ) {
          fails.push(`expected 1 intent decision, got ${ctx.decisionCount}`);
        }
        const ok = fails.length === 0;
        if (!ok) roundOk = false;
        const proofTools = mergedToolNames(ctx);
        console.log(
          ok ? `PASS ${c.id}` : `FAIL ${c.id}`,
          ok
            ? ''
            : fails.join('; '),
          c.kind === 'chat'
            ? `task=${ctx.decision?.task_type || '?'} tools=${proofTools.slice(0, 8).join(',') || '(none)'}`
            : '',
        );
        caseResults.push({
          id: c.id,
          ok,
          fails,
          conversationId: ctx.conversationId || null,
          task_type: ctx.decision?.task_type || null,
          matched_by: ctx.decision?.matched_by || null,
          metadata_json: ctx.decision?.metadata_json || null,
          toolNames: ctx.toolNames || [],
          d1ToolCalls: (ctx.d1ToolCalls || []).map((r) => ({
            tool_name: r.tool_name,
            status: r.status,
          })),
          proofTools,
          toolErrors: ctx.toolErrors || [],
          streamErrors: ctx.streamErrors || [],
          httpStatus: ctx.httpStatus || null,
        });
        if (!ok) summaryFailures.push(...fails.map((f) => `${c.id}: ${f}`));
      } catch (e) {
        roundOk = false;
        const msg = e?.message || String(e);
        console.log(`FAIL ${c.id}`, msg);
        caseResults.push({ id: c.id, ok: false, fails: [msg] });
        summaryFailures.push(`${c.id}: ${msg}`);
      }
    }

    roundResults.push({ round, ok: roundOk, cases: caseResults });
  }

  const allOk = roundResults.every((r) => r.ok);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = join(REPO_ROOT, 'tmp', 'gate-agent-routing');
  mkdirSync(dir, { recursive: true });
  const receiptPath = join(dir, `${ts}.json`);
  const receipt = {
    gate: 'agent_routing',
    ticket_id: TICKET_ID,
    gitSha: gitShaVal,
    baseUrl: BASE_URL,
    workspaceId: WORKSPACE_ID,
    rounds: roundResults,
    ok: allOk,
    summaryFailures,
    receiptPath,
    created_at: new Date().toISOString(),
    law: 'Deploy success does not pass this gate. Code + D1 decision + tool invocation proof (SSE or agentsam_tool_call_log) required. G-image opt-in only. Ticket shipped only after consecutive_pass_count>=2.',
  };
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
  console.log(`\n[gate] receipt ${receiptPath}`);

  const gateRunId = persistGateRun(receipt);
  if (gateRunId) console.log(`[gate] D1 agentsam_gate_runs id=${gateRunId}`);

  try {
    const t = d1Query(
      `SELECT id, status, consecutive_pass_count, last_gate_ok_at
       FROM agentsam_tickets WHERE id = ${sqlQuote(TICKET_ID)} LIMIT 1`,
    )[0];
    if (t) {
      console.log(
        `[gate] ticket ${t.id} status=${t.status} consecutive_pass_count=${t.consecutive_pass_count}`,
      );
      if (Number(t.consecutive_pass_count) >= 2 && t.status !== 'shipped') {
        console.log(
          `[gate] READY FOR in_review/shipped only after operator confirms — consecutive_pass_count=${t.consecutive_pass_count} (deploy alone is NOT enough)`,
        );
      }
    }
  } catch {
    /* ticket may not exist until migration 840 */
  }

  if (!allOk) {
    console.error('\n[gate:agent-routing] FAILED');
    process.exit(1);
  }
  console.log('\n[gate:agent-routing] PASSED');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
