#!/usr/bin/env node
/**
 * Gate 0 pass #1 — live workspace E2E via /api/agent/chat.
 * Forces fs_write_file → fs_read_file (same connection_id) + agentsam_terminal_local pwd.
 *
 *   node scripts/gate0-workspace-e2e.mjs
 */
import { randomUUID } from 'node:crypto';
import { loadEnvCloudflare } from './lib/load-env-cloudflare.mjs';
import { mintAgentSessionCookie, resolveOperatorUserId } from './lib/mint-agent-session.mjs';
import { d1Query, sqlQuote } from './lib/d1-remote.mjs';

loadEnvCloudflare();

const BASE_URL = (process.env.IAM_BASE_URL || 'https://inneranimalmedia.com').replace(/\/$/, '');
const WORKSPACE_ID = (process.env.WORKSPACE_ID || 'ws_inneranimalmedia').trim();
const TENANT_ID = (process.env.IAM_TENANT_ID || 'tenant_sam_primeaux').trim();
const TIMEOUT_MS = Number(process.env.IAM_GATE0_TIMEOUT_MS || 120_000);
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const PROOF_PATH = `.scratch/gate0-workspace-e2e-${STAMP}.txt`;
const PROOF_BODY = `GATE0_PASS1\nstamp=${STAMP}\nexpect_same_connection_id=1\n`;

const PROMPT = [
  'Gate 0 workspace E2E — do exactly these tools in order, nothing else:',
  `1) Call fs_write_file with path="${PROOF_PATH}" and content exactly:`,
  PROOF_BODY.trimEnd(),
  `2) Call fs_read_file with path="${PROOF_PATH}" and confirm the content.`,
  '3) Call agentsam_terminal_local with command: pwd && whoami',
  'Do NOT use openai_hosted_shell, search_tools, or any other tool.',
  'After tools, reply with one line: GATE0_DONE',
].join('\n');

function parseSse(raw) {
  const toolNames = [];
  const toolOutputs = [];
  const streamErrors = [];
  for (const line of String(raw || '').split('\n')) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    let ev;
    try {
      ev = JSON.parse(payload);
    } catch {
      continue;
    }
    const t = String(ev.type || ev.event || '');
    if (t === 'error' || ev.error) streamErrors.push(String(ev.error || ev.message || JSON.stringify(ev)).slice(0, 300));
    if (t === 'tool_call' || t === 'tool_start') {
      const n = String(ev.tool || ev.tool_name || '').trim();
      if (n) toolNames.push(n);
    }
    if (t === 'tool_output' || t === 'tool_result' || t === 'tool_done') {
      toolOutputs.push(ev);
    }
  }
  return { toolNames, toolOutputs, streamErrors };
}

async function postChat(cookie, conversationId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let raw = '';
  let httpStatus = 0;
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
        'User-Agent': 'inneranimalmedia-gate0-workspace-e2e/1.0',
      },
      body: JSON.stringify({
        message: PROMPT,
        messages: [{ role: 'user', content: PROMPT }],
        mode: 'agent',
        requestedMode: 'agent',
        workspace_id: WORKSPACE_ID,
        tenant_id: TENANT_ID,
        conversationId,
        conversation_id: conversationId,
        session_id: conversationId,
        stream: true,
      }),
      signal: controller.signal,
    });
    httpStatus = res.status;
    if (!res.body?.getReader) {
      raw = await res.text();
    } else {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        raw += decoder.decode(value, { stream: true });
        if (/\ndata:\s*\{[^}]*"type"\s*:\s*"done"/m.test(raw) || /\ndata:\s*\[DONE\]/m.test(raw)) {
          try {
            await reader.cancel();
          } catch {
            /* ignore */
          }
          break;
        }
      }
      raw += decoder.decode();
    }
    return { httpStatus, raw, ...parseSse(raw) };
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const userId = resolveOperatorUserId();
  const conversationId = randomUUID();
  console.log(JSON.stringify({ phase: 'mint', userId, conversationId, path: PROOF_PATH }, null, 2));
  const { cookie } = await mintAgentSessionCookie({ userId, workspaceId: WORKSPACE_ID });
  const chat = await postChat(cookie, conversationId);
  console.log(
    JSON.stringify(
      {
        phase: 'chat',
        httpStatus: chat.httpStatus,
        toolNames: chat.toolNames,
        streamErrors: chat.streamErrors,
        raw_len: chat.raw?.length || 0,
      },
      null,
      2,
    ),
  );

  // Allow tool_call_log to settle
  await sleep(2500);

  const since = Math.floor(Date.now() / 1000) - 600;
  const rows = d1Query(
    `SELECT id, tool_name, status, substr(COALESCE(output_json,''),1,600) AS outj, created_at
     FROM agentsam_tool_call_log
     WHERE created_at >= ${since}
       AND session_id = ${sqlQuote(conversationId)}
       AND tool_name IN ('fs_write_file','fs_read_file','agentsam_terminal_local')
     ORDER BY created_at ASC
     LIMIT 20`,
  );

  const writes = rows.filter((r) => r.tool_name === 'fs_write_file' && r.status === 'success');
  const reads = rows.filter((r) => r.tool_name === 'fs_read_file' && r.status === 'success');
  const terms = rows.filter((r) => r.tool_name === 'agentsam_terminal_local' && r.status === 'success');

  function connId(outj) {
    try {
      const j = JSON.parse(String(outj || '{}'));
      return String(j.connection_id || j.connectionId || '').trim() || null;
    } catch {
      const m = String(outj || '').match(/"connection_id"\s*:\s*"([^"]+)"/);
      return m ? m[1] : null;
    }
  }

  const w = writes[writes.length - 1] || null;
  const r = reads[reads.length - 1] || null;
  const t = terms[terms.length - 1] || null;
  const wConn = w ? connId(w.outj) : null;
  const rConn = r ? connId(r.outj) : null;

  let termOut = null;
  try {
    termOut = t ? JSON.parse(String(t.outj || '{}')) : null;
  } catch {
    termOut = { raw: String(t?.outj || '').slice(0, 400) };
  }

  const pin = d1Query(
    `SELECT agent_run_id, connection_id, datetime(created_at,'unixepoch') AS created
     FROM agentsam_pty_lane_pin
     WHERE created_at >= ${since}
     ORDER BY created_at DESC LIMIT 5`,
  );

  const report = {
    gate: '0',
    pass: 1,
    conversation_id: conversationId,
    proof_path: PROOF_PATH,
    fs_write: w ? { id: w.id, connection_id: wConn, status: w.status } : null,
    fs_read: r ? { id: r.id, connection_id: rConn, status: r.status } : null,
    same_connection_id: Boolean(wConn && rConn && wConn === rConn),
    terminal_local: t
      ? {
          id: t.id,
          cwd: termOut?.cwd || null,
          stdout: String(termOut?.stdout || termOut?.output || '').slice(0, 200),
          connection_id: termOut?.connection_id || null,
          exit_code: termOut?.exit_code ?? null,
        }
      : null,
    pins: pin,
    ok: Boolean(
      w &&
        r &&
        wConn &&
        rConn &&
        wConn === rConn &&
        t &&
        (termOut?.exit_code === 0 || termOut?.ok === true),
    ),
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
