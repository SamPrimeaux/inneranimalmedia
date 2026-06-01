/**
 * IAM Terminal API
 *
 * POST /api/terminal/assist          — AI assist for terminal context
 * POST /api/terminal/session/register — register new PTY session
 * GET  /api/terminal/session/validate — validate PTY auth token via KV
 * POST /api/terminal/session/verify — PTY backend: SHA256(token) vs terminal_sessions.auth_token_hash
 */
import { jsonResponse }      from '../core/responses.js';
import { getAuthUser } from '../core/auth.js';
import {
  resolveEffectiveWorkspaceId,
  resolveActiveBootstrap,
  resolveTerminalWorkspaceId,
  WORKSPACE_CONTEXT_MISSING,
} from '../core/bootstrap.js';
import {
  resolvePtyTenantIdForUser,
  buildPtySessionWorkingDir,
} from '../core/pty-workspace-paths.js';
import { dispatchComplete,
         dispatchStream }    from '../core/provider.js';
import { resolveModelForTask, normalizeCanonicalTaskType } from '../core/resolveModel.js';
import {
  computeTerminalSessionAuthTokenHash,
  sha256HexUtf8,
  mintSessionToken,
  getUserHostedTunnelConnection,
  provisionUserHostedTunnelConnection,
  activateUserHostedTunnelConnection,
  closeTerminalSessionRecord,
  userCanRunPtyFromPolicy,
  getTerminalInputHistory,
} from '../core/terminal.js';

// ── Token validation ───────────────────────────────────────────────────────────
export async function handleTerminalApi(request, url, env, ctx) {
  const path   = url.pathname;
  const method = request.method.toUpperCase();

  // POST /api/terminal/session/verify — PTY backend validates bearer vs D1 terminal_sessions (token_mint)
  if (path === '/api/terminal/session/verify' && method === 'POST') {
    let body = {};
    try {
      body = await request.json();
    } catch (_) {}
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    const sessionId = typeof body?.session_id === 'string' ? body.session_id.trim() : '';
    if (!token || !sessionId) return jsonResponse({ valid: false, error: 'token and session_id required' }, 400);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

    try {
      const row = await env.DB.prepare(
        `SELECT auth_token_hash FROM terminal_sessions WHERE id = ? LIMIT 1`,
      )
        .bind(sessionId)
        .first();
      const stored = row?.auth_token_hash != null ? String(row.auth_token_hash).trim() : '';
      if (!stored) return jsonResponse({ valid: false, error: 'invalid session' }, 401);
      const digest = await sha256HexUtf8(token);
      if (digest !== stored) return jsonResponse({ valid: false, error: 'invalid token' }, 401);
      return jsonResponse({ valid: true, session_id: sessionId, ok: true });
    } catch (e) {
      return jsonResponse({ valid: false, error: 'verify failed', detail: e?.message || String(e) }, 500);
    }
  }

  // GET /api/terminal/session/validate
  if (path === '/api/terminal/session/validate' && method === 'GET') {
    const auth  = request.headers.get('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : auth.trim();

    if (!token) return jsonResponse({ error: 'token required' }, 401);

    // Check KV first (fastest)
    if (env.KV) {
      try {
        const raw = await env.KV.get(`pty_session:${token}`);
        if (raw) {
          const session = JSON.parse(raw);
          if (session.expires && Date.now() > session.expires) {
            await env.KV.delete(`pty_session:${token}`);
            return jsonResponse({ error: 'token expired' }, 401);
          }
          return jsonResponse({ valid: true, ...session });
        }
      } catch (_) {}
    }

    // Fallback: check static PTY_AUTH_TOKEN for Sam's personal terminal
    const staticToken = env.PTY_AUTH_TOKEN || '';
    if (staticToken && token === staticToken) {
      return jsonResponse({
        valid:    true,
        userId:   'sam',
        tenantId: null,
        role:     'owner',
      });
    }

    return jsonResponse({ valid: false, error: 'invalid token' }, 401);
  }

  // POST /api/terminal/session/register
  if (path === '/api/terminal/session/register' && method === 'POST') {
    const auth  = request.headers.get('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : auth.trim();
    const bridgeKey = request.headers.get('X-Bridge-Key') || '';
    const validBridge = env.AGENTSAM_BRIDGE_KEY && bridgeKey === env.AGENTSAM_BRIDGE_KEY;
    const validToken  = token && token === (env.PTY_AUTH_TOKEN || '');
    if (!validToken && !validBridge) {
      return jsonResponse({ error: 'unauthorized' }, 401);
    }

    let body = {};
    try { body = await request.json(); } catch (_) {}

    const { session_id, tunnel_url, cols, rows, shell, cwd } = body;
    if (!session_id || !tunnel_url) return jsonResponse({ error: 'session_id and tunnel_url required' }, 400);

    const now = Math.floor(Date.now() / 1000);
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

    const wsRes = await resolveEffectiveWorkspaceId(env, request, authUser, {});
    if (wsRes.error || !wsRes.workspaceId) {
      return jsonResponse({ error: WORKSPACE_CONTEXT_MISSING, code: WORKSPACE_CONTEXT_MISSING }, 400);
    }
    const regWorkspaceId = wsRes.workspaceId;
    const regUid = String(authUser.id || '').trim();
    let regTid = await resolvePtyTenantIdForUser(env, authUser, regUid);
    if (!regTid) return jsonResponse({ error: 'Tenant not resolved for terminal session' }, 403);

    const workingDir = buildPtySessionWorkingDir(env, { tenantId: regTid, userId: regUid }) || '';

    const bootstrap = await resolveActiveBootstrap(env, {
      userId: regUid,
      personUuid: authUser.person_uuid || null,
      tenantId: regTid,
      workspaceId: regWorkspaceId,
    });
    if (!bootstrap) return jsonResponse({ error: 'Terminal not permitted' }, 403);

    let capabilities = {};
    let executionModes = [];
    try { capabilities = JSON.parse(bootstrap.capabilities_json || '{}'); } catch (_) { capabilities = {}; }
    try { executionModes = JSON.parse(bootstrap.allowed_execution_modes_json || '[]'); } catch (_) { executionModes = []; }
    const canPty = capabilities.can_run_pty === true || capabilities.terminal === true;
    if (!canPty) return jsonResponse({ error: 'Terminal not permitted' }, 403);
    if (!Array.isArray(executionModes) || !executionModes.includes('pty')) {
      return jsonResponse({ error: 'Terminal execution mode not permitted' }, 403);
    }

    // If PTY sends a session_token (token_mint flow), store its SHA-256
    // Otherwise fall back to legacy pepper+sessionId hash
    const authTokenHash = body.session_token
      ? await sha256HexUtf8(String(body.session_token))
      : await computeTerminalSessionAuthTokenHash(env, session_id);

    await env.DB?.prepare(
      `INSERT INTO terminal_sessions
       (id, tenant_id, user_id, workspace_id, person_uuid, tunnel_url, cols, rows, shell, cwd, status, auth_token_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         status=excluded.status, updated_at=excluded.updated_at,
         tunnel_url=excluded.tunnel_url,
         workspace_id=excluded.workspace_id,
         person_uuid=excluded.person_uuid,
         auth_token_hash=COALESCE(excluded.auth_token_hash, auth_token_hash)`
    ).bind(
      session_id,
      regTid,
      regUid,
      regWorkspaceId,
      authUser.person_uuid || null,
      tunnel_url || '',
      cols || 220,
      rows || 50,
      shell || '/bin/zsh',
      cwd || workingDir,
      authTokenHash,
      now,
      now,
    )
     .run().catch(() => {});

    return jsonResponse({ ok: true, session_id });
  }

  // GET /api/terminal/history — user input lines for shell history seed (no secrets in response)
  if (path === '/api/terminal/history' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    const commands = await getTerminalInputHistory(env, authUser.id, 200);
    return jsonResponse({ commands, count: commands.length });
  }

  // GET /api/terminal/connections/local — user_hosted_tunnel row for current user/workspace
  if (path === '/api/terminal/connections/local' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    const tw = await resolveTerminalWorkspaceId(env, request, authUser, url.searchParams.get('workspace_id'));
    if (!tw.workspaceId) {
      return jsonResponse({ error: WORKSPACE_CONTEXT_MISSING, code: WORKSPACE_CONTEXT_MISSING }, 400);
    }
    if (!(await userCanRunPtyFromPolicy(env, authUser.id, tw.workspaceId))) {
      return jsonResponse({ error: 'terminal_not_enabled' }, 403);
    }
    const row = await getUserHostedTunnelConnection(env.DB, authUser.id, tw.workspaceId);
    if (!row) {
      return jsonResponse({ connection: null, has_local: false });
    }
    const wsUrl = row.ws_url != null ? String(row.ws_url).trim() : '';
    return jsonResponse({
      has_local: true,
      connection: {
        id: String(row.id),
        platform: row.platform ?? null,
        shell: row.shell ?? null,
        is_active: Number(row.is_active) === 1,
        ws_url_present: !!wsUrl,
      },
    });
  }

  // POST /api/terminal/connections/provision — create inactive user_hosted_tunnel row
  if (path === '/api/terminal/connections/provision' && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    const tw = await resolveTerminalWorkspaceId(env, request, authUser, null);
    if (!tw.workspaceId) {
      return jsonResponse({ error: WORKSPACE_CONTEXT_MISSING, code: WORKSPACE_CONTEXT_MISSING }, 400);
    }
    const body = await request.json().catch(() => ({}));
    const targetType = String(body?.target_type || 'user_hosted_tunnel').trim();
    if (targetType !== 'user_hosted_tunnel') {
      return jsonResponse({ error: 'unsupported_target_type' }, 400);
    }
    const result = await provisionUserHostedTunnelConnection(env, authUser, tw.workspaceId, {
      platform: body?.platform,
      shell: body?.shell,
    });
    if (!result.ok) {
      return jsonResponse({ error: result.error, detail: result.detail ?? null }, result.status || 500);
    }
    return jsonResponse({ ok: true, created: result.created === true, connection: result.connection });
  }

  // POST /api/terminal/connections/activate — set ws_url and is_active=1
  if (path === '/api/terminal/connections/activate' && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    const tw = await resolveTerminalWorkspaceId(env, request, authUser, null);
    if (!tw.workspaceId) {
      return jsonResponse({ error: WORKSPACE_CONTEXT_MISSING, code: 'WORKSPACE_CONTEXT_MISSING' }, 400);
    }
    const body = await request.json().catch(() => ({}));
    const result = await activateUserHostedTunnelConnection(env, authUser, tw.workspaceId, {
      connection_id: body?.connection_id,
      ws_url: body?.ws_url,
    });
    if (!result.ok) {
      return jsonResponse({ error: result.error }, result.status || 500);
    }
    return jsonResponse({ ok: true, connection: result.connection });
  }

  // POST /api/terminal/session/close — mark D1 session closed (inactivity / client disconnect)
  if (path === '/api/terminal/session/close' && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    const body = await request.json().catch(() => ({}));
    const sessionId = String(body?.session_id || '').trim();
    if (!sessionId) return jsonResponse({ error: 'session_id required' }, 400);
    await closeTerminalSessionRecord(env, sessionId, authUser.id);
    return jsonResponse({ ok: true });
  }

  // POST /api/terminal/assist
  if (path === '/api/terminal/assist' && method === 'POST') {
    const auth  = request.headers.get('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : auth.trim();
    if (!token || token !== (env.PTY_AUTH_TOKEN || '')) {
      return jsonResponse({ error: 'unauthorized' }, 401);
    }

    let body = {};
    try { body = await request.json(); } catch (_) {}

    const { mode, context, command, output, exit_code, session_id } = body;

    // Strip ANSI escape codes from terminal output
    const cleanOutput = (output || '')
      .replace(/\x1b\[[0-9;]*[mGKHF]/g, '')
      .replace(/\r/g, '\n')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && l.length < 300)
      .slice(-15)
      .join('\n');

    // Build prompt based on mode
    const prompts = {
      error: `A shell command produced an error. Explain what went wrong and suggest a fix in 3-5 lines.
Command: ${command || 'unknown'}
Exit code: ${exit_code ?? 1}
Output:
${cleanOutput}`,

      fix: `Suggest a fix for this failed command in 2-3 lines. Be specific.
Command: ${command || 'unknown'}
Output:
${cleanOutput}`,

      explain: `Explain this briefly in plain English (3-5 lines max):
${context || cleanOutput}`,

      ask: `Answer this concisely (under 10 lines). Plain text, no markdown headers:
${context || ''}
${cleanOutput ? `\nTerminal context:\n${cleanOutput}` : ''}`,

      agent: `You are Agent Sam. The user needs help with:
${context || command || ''}
${cleanOutput ? `\nRecent terminal output:\n${cleanOutput}` : ''}
Complete this task or provide a specific actionable response.`,
    };

    const userPrompt = prompts[mode] || prompts.ask;

    let modelKey = 'gpt-5.4-nano';
    try {
      let workspaceId = '';
      if (session_id && env.DB) {
        const sess = await env.DB.prepare(
          'SELECT workspace_id FROM terminal_sessions WHERE id = ? LIMIT 1',
        )
          .bind(session_id)
          .first();
        workspaceId = sess?.workspace_id != null ? String(sess.workspace_id).trim() : '';
      }
      if (!workspaceId) {
        return jsonResponse({ error: 'unauthorized' }, 401);
      }
      const resolved = await resolveModelForTask(env, {
        task_type: normalizeCanonicalTaskType('terminal_execution'),
        mode: 'agent',
        workspace_id: workspaceId,
      });
      modelKey = resolved.model_key;
    } catch (_) {}

    const systemPrompt = `You are a developer assistant embedded in the IAM terminal.
Be concise. Plain text only. No markdown headers. Dashes not bullet asterisks.
Max 10 lines unless more detail is essential.`;

    try {
      if (mode === 'agent') {
        // Agent mode — stream back (SSE)
        return dispatchStream(env, request, {
          modelKey,
          systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
          reasoningEffort: mode === 'agent' ? 'medium' : 'none',
          verbosity: 'low',
        });
      }

      // Non-agent — blocking JSON response (PTY server awaits and prints)
      const result = await dispatchComplete(env, {
        modelKey,
        systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        options: { reasoningEffort: 'none', verbosity: 'low' },
      });

      // Extract text from various response shapes
      const text =
        result?.content?.[0]?.text ||
        result?.choices?.[0]?.message?.content ||
        result?.text ||
        result?.output_text ||
        (typeof result === 'string' ? result : JSON.stringify(result));

      return jsonResponse({ text: String(text).slice(0, 1200) });

    } catch (e) {
      return jsonResponse({ error: 'assist failed', detail: e.message }, 500);
    }
  }

  return jsonResponse({ error: 'not found' }, 404);
}
