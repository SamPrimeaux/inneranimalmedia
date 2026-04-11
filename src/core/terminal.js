/**
 * Core Layer: Terminal Execution
 * Handles PTY command execution via HTTP-exec primary, WebSocket fallback.
 * Logs history to D1 terminal_history table keyed to authenticated user session.
 */
import { getAuthUser } from './auth.js';
import { tenantIdFromEnv } from './auth.js';

export const HEADLESS_TERMINAL_SESSION_ID = 'term_headless_agent';

// ─── Output Aggregation ───────────────────────────────────────────────────────

/**
 * Merge WS frames from iam-pty: JSON session_id/error/output, or raw PTY UTF-8.
 */
export function aggregateTerminalRunOutput(parts) {
  let out = '';
  for (const p of parts) {
    let s = p;
    if (typeof ArrayBuffer !== 'undefined' && s instanceof ArrayBuffer) {
      s = new TextDecoder().decode(s);
    } else if (typeof Uint8Array !== 'undefined' && s instanceof Uint8Array) {
      s = new TextDecoder().decode(s);
    } else if (typeof s !== 'string') {
      s = String(s);
    }
    const trimStart = s.trimStart();
    if (trimStart.startsWith('{')) {
      try {
        const j = JSON.parse(s);
        if (j && typeof j === 'object') {
          if (j.type === 'session_id') continue;
          if (j.type === 'output' && j.data != null) {
            out += typeof j.data === 'string' ? j.data : String(j.data);
            continue;
          }
          if (j.type === 'error' && j.data != null) {
            out += typeof j.data === 'string' ? j.data : String(j.data);
            continue;
          }
        }
      } catch (_) { /* not JSON — treat as raw PTY */ }
    }
    out += s;
  }
  return out.trim();
}

// ─── URL Helpers ──────────────────────────────────────────────────────────────

/**
 * Derive HTTP exec URL from TERMINAL_WS_URL env var.
 * Same host as the WebSocket, POST /exec endpoint on iam-pty.
 */
export function terminalExecHttpUrlFromEnv(env) {
  const raw = (env.TERMINAL_WS_URL || '').trim().split('?')[0];
  if (!raw) return '';
  try {
    let u = raw;
    if (u.startsWith('wss://')) u = 'https://' + u.slice(6);
    else if (u.startsWith('ws://')) u = 'http://' + u.slice(7);
    else if (!/^https?:\/\//i.test(u)) u = 'https://' + u.replace(/^\/+/, '');
    return new URL('/exec', new URL(u).origin).href;
  } catch (_) {
    return '';
  }
}

// ─── HTTP Exec (Primary) ──────────────────────────────────────────────────────

/**
 * Run a command via iam-pty HTTP /exec endpoint.
 * Tries PTY_AUTH_TOKEN first, falls back to TERMINAL_SECRET.
 */
export async function runTerminalCommandViaHttpExec(env, cmd) {
  const execUrl = terminalExecHttpUrlFromEnv(env);
  if (!execUrl) return { ok: false };

  const tokens = [];
  const pushTok = (t) => {
    const s = String(t || '').trim();
    if (s && !tokens.includes(s)) tokens.push(s);
  };
  pushTok(env.PTY_AUTH_TOKEN);
  pushTok(env.TERMINAL_SECRET);
  if (!tokens.length) return { ok: false };

  try {
    for (let i = 0; i < tokens.length; i++) {
      const res = await fetch(execUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + tokens[i],
        },
        body: JSON.stringify({ command: cmd }),
      });
      if (res.status === 401 && i < tokens.length - 1) continue;
      if (!res.ok) return { ok: false };

      const data = await res.json().catch(() => null);
      if (!data || typeof data !== 'object') return { ok: false };

      const stdout = typeof data.stdout === 'string' ? data.stdout : '';
      const stderr = typeof data.stderr === 'string' ? data.stderr : '';
      const text = (stdout + (stderr ? '\nSTDERR: ' + stderr : '')).trim();
      return { ok: true, text, exitCode: data.exit_code ?? 0 };
    }
    return { ok: false };
  } catch (_) {
    return { ok: false };
  }
}

// ─── Primary Execution Orchestrator ──────────────────────────────────────────

/**
 * Run a shell command via HTTP-exec (primary) or WebSocket (fallback).
 * Logs input + output to terminal_history keyed to the authenticated user.
 */
export async function runTerminalCommand(env, request, command, sessionId = null) {
  const cmd = typeof command === 'string' ? command.trim() : '';
  let wsUrl = (env.TERMINAL_WS_URL || '').trim();
  if (!wsUrl) throw new Error('Terminal not configured');

  const httpTry = await runTerminalCommandViaHttpExec(env, cmd);
  let cleanOutput = '';
  let exitCode;

  if (httpTry.ok) {
    cleanOutput = httpTry.text;
    exitCode = httpTry.exitCode;
  } else {
    // WebSocket fallback
    if (wsUrl.startsWith('https://')) wsUrl = 'wss://' + wsUrl.slice(8);
    else if (wsUrl.startsWith('http://')) wsUrl = 'ws://' + wsUrl.slice(7);

    const sep = wsUrl.includes('?') ? '&' : '?';
    const wsUrlAuth = env.TERMINAL_SECRET
      ? `${wsUrl}${sep}token=${encodeURIComponent(env.TERMINAL_SECRET)}`
      : wsUrl;

    const wsResp = await fetch(wsUrlAuth, {
      headers: {
        Upgrade: 'websocket',
        Connection: 'Upgrade',
        'Sec-WebSocket-Version': '13',
      },
    });
    if (wsResp.status !== 101) throw new Error(`Terminal connect failed: ${wsResp.status}`);

    const ws = wsResp.webSocket;
    ws.accept();

    cleanOutput = await new Promise((resolve) => {
      const chunks = [];
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve(aggregateTerminalRunOutput(chunks));
      };
      setTimeout(finish, 10000);
      ws.addEventListener('message', (e) => chunks.push(e.data));
      ws.addEventListener('close', finish);
      ws.send(JSON.stringify({ type: 'run', command: cmd }));
    });
    ws.close();
  }

  // D1 history logging — keyed to authenticated user, never headless unless unavoidable
  if (env.DB) {
    const terminalSessionId = await resolveTerminalSessionIdForHistory(env, request);
    const tenantId = tenantIdFromEnv(env);
    if (terminalSessionId && tenantId) {
      const now = Math.floor(Date.now() / 1000);
      await Promise.allSettled([
        env.DB.prepare(
          `INSERT INTO terminal_history
           (id, terminal_session_id, tenant_id, direction, content, triggered_by, agent_session_id, recorded_at)
           VALUES (?,?,?,?,?,?,?,?)`
        ).bind(
          'th_' + crypto.randomUUID().slice(0, 16),
          terminalSessionId, tenantId,
          'input', cmd.slice(0, 5000),
          'agent', sessionId, now
        ).run(),

        env.DB.prepare(
          `INSERT INTO terminal_history
           (id, terminal_session_id, tenant_id, direction, content, exit_code, triggered_by, agent_session_id, recorded_at)
           VALUES (?,?,?,?,?,?,?,?,?)`
        ).bind(
          'th_' + crypto.randomUUID().slice(0, 16),
          terminalSessionId, tenantId,
          'output', cleanOutput.slice(0, 10000),
          exitCode ?? null,
          'agent', sessionId, now
        ).run(),
      ]);
    }
  }

  return { output: cleanOutput, command: cmd, exitCode };
}

// ─── Workspace Root ───────────────────────────────────────────────────────────

/**
 * Resolve the workspace root path from workspace_settings D1 table.
 * Returns empty string if not configured — callers must handle missing root.
 * Never falls back to a hardcoded path.
 */
export async function resolveIamWorkspaceRoot(env, workspaceId) {
  if (!env?.DB || !workspaceId) return '';
  try {
    const row = await env.DB.prepare(
      `SELECT settings_json FROM workspace_settings WHERE workspace_id = ? LIMIT 1`
    ).bind(workspaceId).first();

    if (row?.settings_json) {
      const j = JSON.parse(row.settings_json);
      return j.workspace_root || '';
    }
    return '';
  } catch (_) {
    return '';
  }
}

// ─── Session Resolution ───────────────────────────────────────────────────────

/**
 * Resolve the active terminal session ID for history logging.
 * Always prefers the authenticated user's active session.
 * Falls back to headless session only when no auth is available.
 */
export async function resolveTerminalSessionIdForHistory(env, request) {
  if (!env.DB) return null;
  try {
    const authUser = await getAuthUser(request, env);
    if (authUser?.id) {
      const tsRow = await env.DB.prepare(
        `SELECT id FROM terminal_sessions WHERE user_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1`
      ).bind(authUser.id).first();
      if (tsRow?.id) return tsRow.id;
    }
  } catch (_) {}

  await ensureHeadlessTerminalSession(env);
  return HEADLESS_TERMINAL_SESSION_ID;
}

/**
 * Ensure the headless session row exists in terminal_sessions.
 * Used only when no authenticated user session is found.
 */
export async function ensureHeadlessTerminalSession(env) {
  if (!env.DB) return;
  const tenantId = tenantIdFromEnv(env);
  if (!tenantId) return;
  await env.DB.prepare(
    `INSERT OR IGNORE INTO terminal_sessions
     (id, tenant_id, user_id, status, shell, created_at, updated_at)
     VALUES (?, ?, 'headless', 'active', '/bin/zsh', unixepoch(), unixepoch())`
  ).bind(HEADLESS_TERMINAL_SESSION_ID, tenantId).run().catch(() => {});
}
