/**
 * Core Layer: Terminal Execution
 * Handles PTY workshops, WebSocket runs, and workspace path resolution.
 * Deconstructed from legacy worker.js.
 */
import { getAuthUser, fetchAuthUserTenantId } from './auth';
import {
  resolveTerminalWorkspaceId,
  WORKSPACE_CONTEXT_MISSING,
  WORKSPACE_ROOT_CONTEXT_MISSING,
} from './bootstrap.js';
import { resolvePtyTenantIdForUser, buildPtySessionWorkingDir } from './pty-workspace-paths.js';
import { notifySam } from './notifications';

/**
 * Deterministic SHA-256 for `terminal_sessions.auth_token_hash` (never store raw session secrets in D1).
 * Pepper order: TERMINAL_SESSION_PEPPER → PTY_AUTH_TOKEN → INTERNAL_API_SECRET → dev fallback.
 * @param {Record<string, unknown>} env
 * @param {string} sessionId
 * @returns {Promise<string>} 64-char hex
 */
export async function computeTerminalSessionAuthTokenHash(env, sessionId) {
  const sid = String(sessionId || '').trim();
  const pepper = String(
    env?.TERMINAL_SESSION_PEPPER ||
      env?.PTY_AUTH_TOKEN ||
      env?.INTERNAL_API_SECRET ||
      'iam-terminal-session-pepper',
  ).trim();
  const payload = `${sid}:${pepper}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const TERMINAL_CONN_SELECT = `
  id, ws_url, auth_token_secret_name, connection_type, ollama_url,
  shell, platform, user_id, auth_mode, token_verify_endpoint`;

/**
 * Resolve PTY bridge row from D1 (terminal_connections).
 * Priority: user+workspace active → workspace-shared (user_id NULL) → global is_default.
 * Falls back to env.TERMINAL_WS_URL when absent downstream.
 *
 * @param {import('@cloudflare/workers-types').D1Database | null} db
 * @param {string | null | undefined} userId
 * @param {string | null | undefined} workspaceId
 */
export async function getDefaultTerminalConnection(db, userId = null, workspaceId = null) {
  if (!db) return null;
  const uid =
    userId != null && String(userId).trim() !== '' ? String(userId).trim() : null;
  const wid =
    workspaceId != null && String(workspaceId).trim() !== ''
      ? String(workspaceId).trim()
      : null;
  try {
    if (uid && wid) {
      const row = await db
        .prepare(
          `SELECT ${TERMINAL_CONN_SELECT}
           FROM terminal_connections
           WHERE user_id = ? AND workspace_id = ? AND is_active = 1
           LIMIT 1`,
        )
        .bind(uid, wid)
        .first();
      if (row) return row;
    }
    if (wid) {
      const row = await db
        .prepare(
          `SELECT ${TERMINAL_CONN_SELECT}
           FROM terminal_connections
           WHERE workspace_id = ? AND user_id IS NULL AND is_active = 1
           LIMIT 1`,
        )
        .bind(wid)
        .first();
      if (row) return row;
    }
    const conn = await db
      .prepare(
        `SELECT ${TERMINAL_CONN_SELECT}
         FROM terminal_connections
         WHERE is_default = 1 AND is_active = 1
         LIMIT 1`,
      )
      .first();
    return conn ?? null;
  } catch (e) {
    console.warn('[getDefaultTerminalConnection]', e?.message ?? e);
    return null;
  }
}

/**
 * SHA-256 hex of raw UTF-8 token (for PTY token_mint verify vs terminal_sessions.auth_token_hash).
 * @param {string} token
 */
export async function mintSessionToken() {
  const raw = crypto.randomUUID().replace(/-/g,'') + crypto.randomUUID().replace(/-/g,'');
  const hash = await sha256HexUtf8(raw);
  return { rawToken: raw, tokenHash: hash };
}

export async function sha256HexUtf8(token) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(token ?? '')));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * D1 agentsam_user_policy.can_run_pty gate (replaces superadmin-only terminal checks).
 * @param {Record<string, unknown>} env
 * @param {string} userId
 * @param {string} workspaceId
 */
export async function userCanRunPtyFromPolicy(env, userId, workspaceId) {
  if (!env?.DB || !userId || !workspaceId) return false;
  try {
    const policy = await env.DB.prepare(
      'SELECT can_run_pty FROM agentsam_user_policy WHERE user_id = ? AND workspace_id = ? LIMIT 1',
    )
      .bind(String(userId).trim(), String(workspaceId).trim())
      .first();
    return Number(policy?.can_run_pty) === 1;
  } catch (_) {
    return false;
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
    if (!authUser?.id) return { ok: false, error: 'Unauthorized' };
    const userId = String(authUser.id).trim();
    const tw = await resolveTerminalWorkspaceId(env, request, authUser, extra.workspace_id);
    if (tw.error === 'Forbidden') return { ok: false, error: 'Forbidden' };
    if (tw.error || !tw.workspaceId) return { ok: false, error: WORKSPACE_CONTEXT_MISSING };
    const workspaceId = tw.workspaceId;
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
    let tid = await resolvePtyTenantIdForUser(env, authUser, userId);
    tid = tid != null ? String(tid).trim() : '';
    if (!tid) return { ok: false, error: 'TENANT_CONTEXT_REQUIRED' };
    doUrl.searchParams.set('tenant_id', tid);
    const workingDir = buildPtySessionWorkingDir(env, { tenantId: tid, userId });
    if (workingDir) doUrl.searchParams.set('cwd', workingDir);
    const puuid = authUser.person_uuid != null && String(authUser.person_uuid).trim() !== '' ? String(authUser.person_uuid).trim() : '';
    if (puuid) doUrl.searchParams.set('person_uuid', puuid);
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
  if (!terminalSessionId || !tenantId) {
    console.warn('[terminal_history] skip: terminal_session_missing', {
      terminalSessionId: terminalSessionId || null,
      tenantId: tenantId || null,
      agentSessionId: sessionId || null,
    });
    return;
  }

  // Validate FK target exists (terminal_sessions.id). If it doesn't, avoid FK violations.
  try {
    const exists = await env.DB.prepare('SELECT 1 AS ok FROM terminal_sessions WHERE id = ? LIMIT 1')
      .bind(terminalSessionId)
      .first();
    if (!exists?.ok) {
      console.warn('[terminal_history] skip: parent_missing', { terminalSessionId, tenantId, agentSessionId: sessionId || null });
      return;
    }
  } catch (e) {
    console.warn('[terminal_history] skip: terminal_session_check_failed', { terminalSessionId, error: e?.message ?? String(e) });
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  let seq = 0;
  try {
    const seqRow = await env.DB.prepare(
      'SELECT COALESCE(MAX(sequence), 0) AS m FROM terminal_history WHERE terminal_session_id = ?'
    ).bind(terminalSessionId).first();
    seq = Number(seqRow?.m ?? 0);
    if (!Number.isFinite(seq)) seq = 0;
  } catch (_) {
    seq = 0;
  }
  seq += 1;
  await env.DB.prepare(
    `INSERT INTO terminal_history (id, terminal_session_id, tenant_id, sequence, direction, content, triggered_by, agent_session_id, recorded_at) VALUES (?,?,?,?,?,?,?,?,?)`
  ).bind('th_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16), terminalSessionId, tenantId, seq, 'input', commandText.slice(0, 5000), 'agent', sessionId, now).run();
  seq += 1;
  await env.DB.prepare(
    `INSERT INTO terminal_history (id, terminal_session_id, tenant_id, sequence, direction, content, exit_code, triggered_by, agent_session_id, recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).bind('th_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16), terminalSessionId, tenantId, seq, 'output', outputText.slice(0, 10000), exitCode ?? null, 'agent', sessionId, now).run();
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

/**
 * Resolve filesystem root for IAM git/terminal from D1 workspace_settings.workspace_root.
 *
 * @param {any} env
 * @param {{ workspaceId?: string|null, allowPlatformFallback?: boolean }} [opts]
 */
export async function resolveIamWorkspaceRoot(env, opts = {}) {
  if (!env?.DB) throw new Error('DB not configured');

  const allowPlatformFallback = opts.allowPlatformFallback === true;
  let wid = String(opts.workspaceId || '').trim();

  if (!wid) {
    if (allowPlatformFallback) {
      const plat =
        env?.DEFAULT_WORKSPACE_ID != null && String(env.DEFAULT_WORKSPACE_ID).trim() !== ''
          ? String(env.DEFAULT_WORKSPACE_ID).trim()
          : '';
      if (plat) {
        console.warn(
          '[resolveIamWorkspaceRoot] platform-scoped: using env.DEFAULT_WORKSPACE_ID (allowPlatformFallback=true)',
        );
        wid = plat;
      }
    }
  }

  if (!wid) {
    throw new Error(WORKSPACE_CONTEXT_MISSING);
  }

  const workspaceSettingsRow = await env.DB
    .prepare('SELECT settings_json FROM workspace_settings WHERE workspace_id = ?')
    .bind(wid)
    .first()
    .catch(() => null);

  if (workspaceSettingsRow?.settings_json) {
    try {
      const parsed = JSON.parse(workspaceSettingsRow.settings_json);
      const root = typeof parsed?.workspace_root === 'string' ? parsed.workspace_root.trim() : '';
      if (root) return root;
    } catch (_) {}
  }

  throw new Error(WORKSPACE_ROOT_CONTEXT_MISSING);
}

export async function resolveTerminalSessionIdForHistory(env, request) {
  try {
    const authUser = await getAuthUser(request, env);
    if (authUser?.id) {
      const tsRow = await env.DB
        .prepare(`SELECT id FROM terminal_sessions WHERE user_id = ? AND status = 'active' LIMIT 1`)
        .bind(authUser.id)
        .first();
      if (tsRow?.id) return tsRow.id;
    }
  } catch (_) {}
  return null;
}
