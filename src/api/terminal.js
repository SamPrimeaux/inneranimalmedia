/**
 * IAM Terminal API
 *
 * POST /api/terminal/assist          — AI assist for terminal context
 * POST /api/terminal/session/register — register new PTY session
 * GET  /api/terminal/session/validate — validate PTY auth token via KV
 */
import { jsonResponse }      from '../core/responses.js';
import { getAuthUser, fetchAuthUserTenantId } from '../core/auth.js';
import {
  resolveEffectiveWorkspaceId,
  resolveActiveBootstrap,
  WORKSPACE_CONTEXT_MISSING,
  resolveTenantIdForWorkspace,
} from '../core/bootstrap.js';
import { dispatchComplete,
         dispatchStream }    from '../core/provider.js';

// ── Token validation ───────────────────────────────────────────────────────────
export async function handleTerminalApi(request, url, env, ctx) {
  const path   = url.pathname;
  const method = request.method.toUpperCase();

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
    let regTid =
      authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
        ? String(authUser.tenant_id).trim()
        : '';
    if (!regTid) regTid = await resolveTenantIdForWorkspace(env, regWorkspaceId);
    if (!regTid) regTid = await fetchAuthUserTenantId(env, regUid);
    if (!regTid) return jsonResponse({ error: 'Tenant not resolved for terminal session' }, 403);

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

    await env.DB?.prepare(
      `INSERT INTO terminal_sessions
       (id, tenant_id, user_id, workspace_id, person_uuid, tunnel_url, cols, rows, shell, cwd, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         status=excluded.status, updated_at=excluded.updated_at,
         tunnel_url=excluded.tunnel_url,
         workspace_id=excluded.workspace_id,
         person_uuid=excluded.person_uuid`
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
      cwd || '',
      now,
      now,
    )
     .run().catch(() => {});

    return jsonResponse({ ok: true, session_id });
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

    // Resolve gate model from mode config or use nano as default
    let modelKey = 'gpt-5.4-nano';
    try {
      const modeSlug = mode === 'agent' ? 'agent' : 'ask';
      const modeRow  = await env.DB?.prepare(
        `SELECT gate_model, model_preference FROM agent_mode_configs
         WHERE slug = ? AND is_active = 1 LIMIT 1`
      ).bind(modeSlug).first();

      if (mode === 'agent' && modeRow?.model_preference) {
        modelKey = modeRow.model_preference; // gpt-5.4 for agent mode
      } else if (modeRow?.gate_model) {
        modelKey = modeRow.gate_model;       // gpt-5.4-nano for quick assist
      }
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
