/**
 * Core Layer: Terminal Execution
 * Handles PTY workshops, WebSocket runs, and workspace path resolution.
 * Deconstructed from legacy worker.js.
 */
import { getAuthUser, fetchAuthUserTenantId } from './auth';
import { notifySam } from './notifications';

export const HEADLESS_TERMINAL_SESSION_ID = 'term_headless_sam';

/**
 * Default PTY bridge from D1 (terminal_connections). Falls back to env.TERMINAL_WS_URL when absent.
 */
export async function getDefaultTerminalConnection(db) {
  if (!db) return null;
  try {
    const conn = await db.prepare(
      `SELECT ws_url, auth_token_secret_name, connection_type, ollama_url
       FROM terminal_connections
       WHERE is_default = 1 AND is_active = 1
       LIMIT 1`,
    ).first();
    return conn ?? null;
  } catch (e) {
    console.warn('[getDefaultTerminalConnection]', e?.message ?? e);
    return null;
  }
}

/**
 * Merge WS frames from iam-pty run: JSON session_id/error/output, or raw PTY UTF-8.
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
      } catch (_) { /* not JSON; treat as PTY raw */ }
    }
    out += s;
  }
  return out.trim();
}

/**
 * Same host as TERMINAL_WS_URL: POST /exec (iam-pty server.js).
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

/**
 * Run via HTTP-exec (reliable fallback for Cloudflare Workers).
 */
export async function runTerminalCommandViaHttpExec(env, cmd) {
  const tokens = [];
  const pushTok = (t) => {
    const s = String(t || '').trim();
    if (s && !tokens.includes(s)) tokens.push(s);
  };
  pushTok(env.PTY_AUTH_TOKEN);
  pushTok(env.TERMINAL_SECRET);
  if (!tokens.length) return { ok: false };

  // Prefer private VPC connector when present (tunnel handles auth; no worker-side PTY headers).
  if (env?.PTY_SERVICE) {
    try {
      const res = await env.PTY_SERVICE.fetch(
        new Request('http://localhost:3099/exec', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: cmd }),
        }),
      );
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data && typeof data === 'object') {
          const stdout = typeof data.stdout === 'string' ? data.stdout : '';
          const stderr = typeof data.stderr === 'string' ? data.stderr : '';
          const text = ((stdout || '') + (stderr ? '\nSTDERR: ' + stderr : '')).trim();
          return { ok: true, text, exitCode: data.exit_code ?? 0 };
        }
      }
    } catch (_) {
      /* fall through to TERMINAL_WS_URL-based HTTP /exec fallback */
    }
  }

  const execUrl = terminalExecHttpUrlFromEnv(env);
  if (!execUrl) return { ok: false };

  try {
    for (let i = 0; i < tokens.length; i++) {
      const bearer = tokens[i];
      const res = await fetch(execUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + bearer },
        body: JSON.stringify({ command: cmd }),
      });
      if (res.status === 401 && i < tokens.length - 1) continue;
      if (!res.ok) return { ok: false };
      
      const data = await res.json().catch(() => null);
      if (!data || typeof data !== 'object') return { ok: false };
      const stdout = typeof data.stdout === 'string' ? data.stdout : '';
      const stderr = typeof data.stderr === 'string' ? data.stderr : '';
      const text = ((stdout || '') + (stderr ? '\nSTDERR: ' + stderr : '')).trim();
      return { ok: true, text, exitCode: data.exit_code ?? 0 };
    }
    return { ok: false };
  } catch (e) {
    return { ok: false };
  }
}

/**
 * ACTIVE PATH: Execute through the authoritative Worker/DO control plane.
 * DEPRECATED DIRECT PATH: direct browser → upstream PTY websocket.
 */
export async function runTerminalCommandViaControlPlane(env, request, command, executionMode = 'pty', extra = {}) {
  if (!env?.AGENT_SESSION) return { ok: false };
  const cmd = typeof command === 'string' ? command.trim() : '';
  if (!cmd) return { ok: false, error: 'No command' };
  try {
    const authUser = await getAuthUser(request, env);
    const userId = String(authUser?.id || 'anonymous');
    const workspaceId = String(extra.workspace_id || authUser?.tenant_id || 'default').trim();
    const mode = ['pty', 'ssh', 'mcp'].includes(String(executionMode || '').toLowerCase())
      ? String(executionMode).toLowerCase()
      : 'pty';
    const sessionName = `terminal:${userId}:${workspaceId}:${mode}`;
    const doId = env.AGENT_SESSION.idFromName(sessionName);
    const stub = env.AGENT_SESSION.get(doId);
    const doUrl = new URL('https://do.internal/terminal/exec');
    doUrl.searchParams.set('execution_mode', mode);
    doUrl.searchParams.set('workspace_id', workspaceId);
    doUrl.searchParams.set('user_id', userId);
    const resp = await stub.fetch(new Request(doUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        command: cmd,
        execution_mode: mode,
        ssh_target_id: extra.ssh_target_id || null,
        tool_name: extra.tool_name || null,
        params: extra.params || null,
      }),
    }));
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok || payload?.ok === false) {
      return { ok: false, error: payload?.error || `control-plane ${resp.status}` };
    }
    return {
      ok: true,
      text: typeof payload?.output === 'string' ? payload.output : '',
      exitCode: payload?.exit_code ?? 0,
      toolName: payload?.tool_name ?? null,
      targetId: payload?.target_id ?? null,
    };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

async function writeTerminalHistory(env, request, sessionId, commandText, outputText, exitCode) {
  if (!env.DB) return;
  const terminalSessionId = await resolveTerminalSessionIdForHistory(env, request);
  const authUser = await getAuthUser(request, env).catch(() => null);
  let tenantId = authUser?.tenant_id != null && String(authUser.tenant_id).trim() !== '' ? String(authUser.tenant_id).trim() : null;
  if (!tenantId && authUser?.id) {
    tenantId = await fetchAuthUserTenantId(env, authUser.id).catch(() => null);
  }
  if (!terminalSessionId || !tenantId) return;
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO terminal_history (id, terminal_session_id, tenant_id, direction, content, triggered_by, agent_session_id, recorded_at) VALUES (?,?,?,?,?,?,?,?)`
  ).bind('th_' + crypto.randomUUID().slice(0, 16), terminalSessionId, tenantId, 'input', commandText.slice(0, 5000), 'agent', sessionId, now).run();
  await env.DB.prepare(
    `INSERT INTO terminal_history (id, terminal_session_id, tenant_id, direction, content, exit_code, triggered_by, agent_session_id, recorded_at) VALUES (?,?,?,?,?,?,?,?,?)`
  ).bind('th_' + crypto.randomUUID().slice(0, 16), terminalSessionId, tenantId, 'output', outputText.slice(0, 10000), exitCode ?? null, 'agent', sessionId, now).run();
}

/**
 * Primary Execution Orchestrator.
 */
export async function runTerminalCommand(env, request, command, sessionId = null, executionCtx = null) {
  const cmd = typeof command === 'string' ? command.trim() : '';
  const mode = String(executionCtx?.execution_mode || 'pty').toLowerCase();
  const controlTry = await runTerminalCommandViaControlPlane(env, request, cmd, mode, executionCtx || {});
  if (controlTry.ok) {
    const cleanOutput = controlTry.text;
    const exitCode = controlTry.exitCode;
    await writeTerminalHistory(env, request, sessionId, cmd, cleanOutput, exitCode);
    return { output: cleanOutput, command: cmd, exitCode };
  }

  // Keep single control plane for all modes.
  if (mode !== 'pty' || env?.AGENT_SESSION) {
    throw new Error(controlTry.error || `${mode} execution unavailable`);
  }

  // Legacy fallback path for environments missing AGENT_SESSION.
  const httpTry = await runTerminalCommandViaHttpExec(env, cmd);
  if (!httpTry.ok) {
    throw new Error(controlTry.error || 'terminal execution unavailable');
  }
  const cleanOutput = httpTry.text;
  const exitCode = httpTry.exitCode;

  await writeTerminalHistory(env, request, sessionId, cmd, cleanOutput, exitCode);

  return { output: cleanOutput, command: cmd, exitCode };
}

export async function resolveIamWorkspaceRoot(env) {
  if (!env?.DB) throw new Error('DB not configured');

  const workspaceSettingsRow = await env.DB
    .prepare('SELECT settings_json FROM workspace_settings WHERE workspace_id = ?')
    .bind('ws_inneranimalmedia')
    .first()
    .catch(() => null);

  if (workspaceSettingsRow?.settings_json) {
    try {
      const parsed = JSON.parse(workspaceSettingsRow.settings_json);
      const root = typeof parsed?.workspace_root === 'string' ? parsed.workspace_root.trim() : '';
      if (root) return root;
    } catch (_) {}
  }

  throw new Error('workspace_root_missing_in_d1');
}

export async function resolveTerminalSessionIdForHistory(env, request) {
  try {
    const authUser = await getAuthUser(request, env);
    if (authUser?.id) {
       const tsRow = await env.DB.prepare(`SELECT id FROM terminal_sessions WHERE user_id = ? AND status = 'active' LIMIT 1`).bind(authUser.id).first();
       if (tsRow?.id) return tsRow.id;
    }
  } catch (_) {}
  await ensureHeadlessTerminalSessionForHistory(env);
  return HEADLESS_TERMINAL_SESSION_ID;
}

export async function ensureHeadlessTerminalSessionForHistory(env) {
  if (!env.DB) return;
  const tid = 'system';
  await env.DB.prepare(
    `INSERT OR IGNORE INTO terminal_sessions (id, tenant_id, user_id, status, shell, created_at, updated_at) VALUES (?, ?, 'headless_session', 'active', '/bin/zsh', unixepoch(), unixepoch())`
  ).bind(HEADLESS_TERMINAL_SESSION_ID, tid).run();
}
