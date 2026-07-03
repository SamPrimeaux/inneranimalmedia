/**
 * IAM Terminal API
 *
 * POST /api/terminal/assist          — AI assist for terminal context (Agent Sam / agentsam_model_catalog)
 * GET  /api/terminal/models          — PTY-auth model list for /agents slash command
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
  resolveTerminalCwd,
  loadWorkspaceRootFromSettings,
} from '../core/pty-workspace-paths.js';
import { dispatchComplete } from '../core/provider.js';
import { resolveModelForTask, normalizeCanonicalTaskType } from '../core/resolveModel.js';
import {
  extractDispatchUsage,
  finalizeTerminalAssistAgentRun,
  logTerminalAssistError,
  mintTerminalAssistAgentRunId,
  startTerminalAssistAgentRun,
} from '../core/terminal-assist-telemetry.js';
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
  loadAuthUserRowForPty,
  ptyBackendBearerValid,
  buildTerminalConfigStatus,
} from '../core/terminal.js';
import {
  buildTerminalLaneTargets,
  buildTerminalSplashStatus,
} from '../core/terminal-splash-status.js';
import {
  generateUserPtyAuthToken,
  getUserPtyAuthTokenStatus,
  revokeUserPtyAuthToken,
  CF_CREDENTIALS_HELP,
} from '../core/user-secrets.js';
import {
  provisionPtyTunnel,
  deprovisionPtyTunnel,
  getPtyTunnelStatus,
  tryAutoActivateUserHostedTunnel,
} from '../core/pty-tunnel-provisioner.js';
import { resolveWorkspaceCloudflareCredentials } from '../core/workspace-cloudflare-credentials.js';
import { resolvePtySessionCloudflareEnv } from '../core/pty-session-cloudflare-env.js';

// ── Token validation ───────────────────────────────────────────────────────────
export async function handleTerminalApi(request, url, env, ctx) {
  const path   = url.pathname;
  const method = request.method.toUpperCase();

  // POST /api/terminal/session/verify — PTY backend validates bearer vs D1 terminal_sessions (token_mint)
  if (path === '/api/terminal/session/verify' && method === 'POST') {
    const authHdr = request.headers.get('Authorization') || '';
    const bearer = authHdr.startsWith('Bearer ') ? authHdr.slice(7).trim() : authHdr.trim();
    const bridgeKey = request.headers.get('X-Bridge-Key') || '';
    const validBridge = env.AGENTSAM_BRIDGE_KEY && bridgeKey === env.AGENTSAM_BRIDGE_KEY;

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
        `SELECT auth_token_hash, user_id, workspace_id, tenant_id
         FROM terminal_sessions WHERE id = ? LIMIT 1`,
      )
        .bind(sessionId)
        .first();
      const stored = row?.auth_token_hash != null ? String(row.auth_token_hash).trim() : '';
      if (!stored) return jsonResponse({ valid: false, error: 'invalid session' }, 401);
      const digest = await sha256HexUtf8(token);
      if (digest !== stored) return jsonResponse({ valid: false, error: 'invalid token' }, 401);

      const sessionUserId = row?.user_id != null ? String(row.user_id).trim() : '';
      const sessionWorkspaceId = row?.workspace_id != null ? String(row.workspace_id).trim() : '';
      const sessionTenantId = row?.tenant_id != null ? String(row.tenant_id).trim() : '';
      const validBackend =
        validBridge ||
        (bearer &&
          (await ptyBackendBearerValid(env, bearer, sessionUserId, sessionWorkspaceId)));
      if (!validBackend) return jsonResponse({ valid: false, error: 'unauthorized' }, 401);

      const cf = await resolvePtySessionCloudflareEnv(env, {
        userId: sessionUserId,
        tenantId: sessionTenantId,
        workspaceId: sessionWorkspaceId,
      });

      return jsonResponse({
        valid: true,
        session_id: sessionId,
        ok: true,
        user_id: sessionUserId || null,
        workspace_id: sessionWorkspaceId || null,
        tenant_id: sessionTenantId || null,
        cloudflare_api_token: cf.cloudflare_api_token,
        cloudflare_account_id: cf.cloudflare_account_id,
        cloudflare_configured: cf.ok === true,
        cloudflare_error: cf.ok ? null : cf.error,
      });
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

    let body = {};
    try { body = await request.json(); } catch (_) {}

    const regUserIdHint = String(body?.user_id || '').trim();
    const regWsHint = String(body?.workspace_id || '').trim();
    const validToken =
      validBridge ||
      (token && (await ptyBackendBearerValid(env, token, regUserIdHint, regWsHint)));
    if (!validToken) {
      return jsonResponse({ error: 'unauthorized' }, 401);
    }

    const { session_id, tunnel_url, cols, rows, shell, cwd } = body;
    if (!session_id || !tunnel_url) return jsonResponse({ error: 'session_id and tunnel_url required' }, 400);

    const now = Math.floor(Date.now() / 1000);
    let authUser = await getAuthUser(request, env);
    if (!authUser && regUserIdHint && env.DB) {
      const row = await loadAuthUserRowForPty(env.DB, regUserIdHint);
      if (row?.id) {
        authUser = {
          id: String(row.id),
          email: row.email ?? null,
          person_uuid: row.person_uuid ?? null,
          tenant_id: row.tenant_id ?? row.active_tenant_id ?? null,
        };
      }
    }
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

    let regWorkspaceId = regWsHint;
    if (regWorkspaceId) {
      const { userHasWorkspaceMembership } = await import('../core/workspace-provisioning.js');
      const memberOk = await userHasWorkspaceMembership(env, String(authUser.id).trim(), regWorkspaceId);
      if (!memberOk) {
        return jsonResponse({ error: 'Forbidden', code: 'workspace_forbidden' }, 403);
      }
    } else {
      const wsRes = await resolveEffectiveWorkspaceId(env, request, authUser, {});
      if (wsRes.error || !wsRes.workspaceId) {
        return jsonResponse({ error: WORKSPACE_CONTEXT_MISSING, code: WORKSPACE_CONTEXT_MISSING }, 400);
      }
      regWorkspaceId = wsRes.workspaceId;
    }
    const regUid = String(authUser.id || '').trim();
    let regTid = await resolvePtyTenantIdForUser(env, authUser, regUid);
    if (!regTid) return jsonResponse({ error: 'Tenant not resolved for terminal session' }, 403);

    const cwdResolved = await resolveTerminalCwd(env, {
      connection: null,
      tenantId: regTid,
      userId: regUid,
      workspaceId: regWorkspaceId,
    });
    const workingDir = cwdResolved.cwd || (await loadWorkspaceRootFromSettings(env, regWorkspaceId)) || '';

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

    const autoActivate = await tryAutoActivateUserHostedTunnel(
      env,
      tunnel_url,
      regUid,
      regWorkspaceId,
    );

    return jsonResponse({
      ok: true,
      session_id,
      connection_activated: autoActivate.activated === true,
      connection_id: autoActivate.connection_id ?? null,
    });
  }

  // GET /api/terminal/history — user input lines for shell history seed (no secrets in response)
  if (path === '/api/terminal/history' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    const commands = await getTerminalInputHistory(env, authUser.id, 200);
    return jsonResponse({ commands, count: commands.length });
  }

  // GET /api/terminal/splash-status — workspace-scoped splash lanes (single round-trip)
  if (path === '/api/terminal/splash-status' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    const tw = await resolveTerminalWorkspaceId(env, request, authUser, url.searchParams.get('workspace_id'));
    if (!tw.workspaceId) {
      return jsonResponse({ error: WORKSPACE_CONTEXT_MISSING, code: WORKSPACE_CONTEXT_MISSING }, 400);
    }
    const authWs = await resolveEffectiveWorkspaceId(env, request, authUser, {});
    const payload = await buildTerminalSplashStatus(env, authUser, tw.workspaceId, {
      authWorkspaceId: authWs.workspaceId ?? tw.workspaceId,
    });
    return jsonResponse(payload);
  }

  // GET /api/terminal/connections/targets — local + cloud lane readiness for splash UI
  if (path === '/api/terminal/connections/targets' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    const tw = await resolveTerminalWorkspaceId(env, request, authUser, url.searchParams.get('workspace_id'));
    if (!tw.workspaceId) {
      return jsonResponse({ error: WORKSPACE_CONTEXT_MISSING, code: WORKSPACE_CONTEXT_MISSING }, 400);
    }
    const targets = await buildTerminalLaneTargets(env, authUser, tw.workspaceId);
    return jsonResponse(targets);
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

  // POST /api/terminal/token/generate — one-time PTY bridge token (encrypted in user_secrets)
  if (path === '/api/terminal/token/generate' && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    const tw = await resolveTerminalWorkspaceId(env, request, authUser, null);
    if (!tw.workspaceId) {
      return jsonResponse({ error: WORKSPACE_CONTEXT_MISSING, code: WORKSPACE_CONTEXT_MISSING }, 400);
    }
    if (!(await userCanRunPtyFromPolicy(env, authUser.id, tw.workspaceId))) {
      return jsonResponse({ error: 'terminal_not_enabled' }, 403);
    }
    const body = await request.json().catch(() => ({}));
    const result = await generateUserPtyAuthToken(env, authUser, tw.workspaceId, request, {
      rotate: body?.rotate === true,
    });
    if (!result.ok) {
      return jsonResponse({ error: result.error }, result.status || 500);
    }
    return jsonResponse({
      ok: true,
      token: result.token,
      last4: result.last4,
      connection_id: result.connection_id,
      instructions: result.instructions,
    });
  }

  // GET /api/terminal/token/status
  if (path === '/api/terminal/token/status' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    const tw = await resolveTerminalWorkspaceId(env, request, authUser, url.searchParams.get('workspace_id'));
    if (!tw.workspaceId) {
      return jsonResponse({ error: WORKSPACE_CONTEXT_MISSING, code: WORKSPACE_CONTEXT_MISSING }, 400);
    }
    if (!(await userCanRunPtyFromPolicy(env, authUser.id, tw.workspaceId))) {
      return jsonResponse({ error: 'terminal_not_enabled' }, 403);
    }
    const status = await getUserPtyAuthTokenStatus(env, authUser.id, tw.workspaceId);
    return jsonResponse(status);
  }

  // DELETE /api/terminal/token
  if (path === '/api/terminal/token' && method === 'DELETE') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    const tw = await resolveTerminalWorkspaceId(env, request, authUser, null);
    if (!tw.workspaceId) {
      return jsonResponse({ error: WORKSPACE_CONTEXT_MISSING, code: WORKSPACE_CONTEXT_MISSING }, 400);
    }
    if (!(await userCanRunPtyFromPolicy(env, authUser.id, tw.workspaceId))) {
      return jsonResponse({ error: 'terminal_not_enabled' }, 403);
    }
    const result = await revokeUserPtyAuthToken(env, authUser, tw.workspaceId, request);
    if (!result.ok) {
      return jsonResponse({ error: result.error }, result.status || 500);
    }
    return jsonResponse({ ok: true, revoked: result.revoked === true });
  }

  // POST /api/terminal/tunnel/provision — BYOK Cloudflare tunnel + DNS
  if (path === '/api/terminal/tunnel/provision' && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    const tw = await resolveTerminalWorkspaceId(env, request, authUser, null);
    if (!tw.workspaceId) {
      return jsonResponse({ error: WORKSPACE_CONTEXT_MISSING, code: WORKSPACE_CONTEXT_MISSING }, 400);
    }
    if (!(await userCanRunPtyFromPolicy(env, authUser.id, tw.workspaceId))) {
      return jsonResponse({ error: 'terminal_not_enabled' }, 403);
    }
    const body = await request.json().catch(() => ({}));
    const tunnelName = String(body?.tunnel_name || '').trim();
    const hostname = String(body?.hostname || '').trim();
    const zoneId = String(body?.zone_id || '').trim();
    if (!tunnelName || !hostname || !zoneId) {
      return jsonResponse({ error: 'tunnel_name, hostname, and zone_id required' }, 400);
    }

    const tenantId = await resolvePtyTenantIdForUser(env, authUser, authUser.id);
    if (!tenantId) return jsonResponse({ error: 'tenant_missing' }, 403);

    const creds = await resolveWorkspaceCloudflareCredentials(
      env,
      authUser.id,
      tenantId,
      tw.workspaceId,
    );
    if (!creds.ok || !creds.token) {
      return jsonResponse(CF_CREDENTIALS_HELP, 400);
    }

    const { getUserHostedTunnelConnection } = await import('../core/terminal.js');
    const existing = await getUserHostedTunnelConnection(env.DB, authUser.id, tw.workspaceId);
    if (existing && Number(existing.is_active) === 1) {
      return jsonResponse(
        { error: 'tunnel_already_active', connection_id: String(existing.id) },
        409,
      );
    }

    const result = await provisionPtyTunnel(env, {
      userId: authUser.id,
      tenantId,
      workspaceId: tw.workspaceId,
      tunnelName,
      hostname,
      zoneId,
      port: body?.port,
      platform: body?.platform,
      shell: body?.shell,
    });
    if (!result.ok) {
      return jsonResponse(
        { error: result.error, step_failed: result.step_failed ?? null },
        500,
      );
    }
    return jsonResponse({
      ok: true,
      tunnel_id: result.tunnel_id,
      hostname: result.hostname,
      ws_url: result.ws_url,
      connection_id: result.connection_id,
      run_token: result.run_token,
      next_steps: [
        'Install cloudflared on your machine',
        'Run: cloudflared tunnel run --token <run_token>',
        'Set PTY_AUTH_TOKEN via POST /api/terminal/token/generate, then run node server.js in iam-pty',
        'Connection auto-activates when the tunnel registers a session',
      ],
    });
  }

  // GET /api/terminal/tunnel/status
  if (path === '/api/terminal/tunnel/status' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    const tw = await resolveTerminalWorkspaceId(env, request, authUser, url.searchParams.get('workspace_id'));
    if (!tw.workspaceId) {
      return jsonResponse({ error: WORKSPACE_CONTEXT_MISSING, code: WORKSPACE_CONTEXT_MISSING }, 400);
    }
    const tenantId = await resolvePtyTenantIdForUser(env, authUser, authUser.id);
    const status = await getPtyTunnelStatus(env, {
      userId: authUser.id,
      tenantId: tenantId || '',
      workspaceId: tw.workspaceId,
    });
    return jsonResponse(status);
  }

  // DELETE /api/terminal/tunnel
  if (path === '/api/terminal/tunnel' && method === 'DELETE') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    const tw = await resolveTerminalWorkspaceId(env, request, authUser, null);
    if (!tw.workspaceId) {
      return jsonResponse({ error: WORKSPACE_CONTEXT_MISSING, code: WORKSPACE_CONTEXT_MISSING }, 400);
    }
    const tenantId = await resolvePtyTenantIdForUser(env, authUser, authUser.id);
    if (!tenantId) return jsonResponse({ error: 'tenant_missing' }, 403);
    const result = await deprovisionPtyTunnel(env, {
      userId: authUser.id,
      tenantId,
      workspaceId: tw.workspaceId,
    });
    if (!result.ok) {
      return jsonResponse({ error: result.error }, result.status || 500);
    }
    return jsonResponse({
      ok: true,
      tunnel_id: result.tunnel_id,
      dns_record_deleted: result.dns_record_deleted === true,
    });
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

  // GET /api/terminal/models — PTY server /agents slash (no browser cookie)
  if (path === '/api/terminal/models' && method === 'GET') {
    const auth = request.headers.get('Authorization') || request.headers.get('x-pty-auth') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : auth.trim();
    if (!token || token !== (env.PTY_AUTH_TOKEN || '')) {
      return jsonResponse({ error: 'unauthorized' }, 401);
    }
    const sessionId = String(url.searchParams.get('session_id') || '').trim();
    if (!sessionId || !env.DB) {
      return jsonResponse({ error: 'session_id required' }, 400);
    }
    const sess = await env.DB.prepare(
      'SELECT workspace_id, tenant_id FROM terminal_sessions WHERE id = ? LIMIT 1',
    )
      .bind(sessionId)
      .first();
    const tenantId = sess?.tenant_id != null ? String(sess.tenant_id).trim() : '';
    if (!tenantId) {
      return jsonResponse({ error: 'session_not_found' }, 404);
    }
    const { results } = await env.DB.prepare(
      `SELECT model_key, name, provider, api_platform, size_class, sort_order
       FROM agentsam_ai
       WHERE mode = 'model' AND status = 'active'
         AND COALESCE(picker_eligible, 1) = 1
         AND (is_global = 1 OR allowed_tenants_json LIKE ('%"' || ? || '"%'))
       ORDER BY sort_order ASC, name ASC`,
    )
      .bind(tenantId)
      .all();
    return jsonResponse({ models: results || [] });
  }

  // POST /api/terminal/assist
  if (path === '/api/terminal/assist' && method === 'POST') {
    const auth  = request.headers.get('Authorization') || request.headers.get('x-pty-auth') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : auth.trim();
    if (!token || token !== (env.PTY_AUTH_TOKEN || '')) {
      return jsonResponse({ error: 'unauthorized' }, 401);
    }

    let body = {};
    try { body = await request.json(); } catch (_) {}

    const { mode, context, command, output, exit_code, session_id, model_key: modelKeyOverride } = body;

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
    const assistMode = mode != null ? String(mode) : 'ask';
    const runStartedAt = Date.now();

    let workspaceId = '';
    let tenantId = '';
    let userId = '';
    if (session_id && env.DB) {
      const sess = await env.DB.prepare(
        'SELECT workspace_id, tenant_id, user_id FROM terminal_sessions WHERE id = ? LIMIT 1',
      )
        .bind(session_id)
        .first();
      workspaceId = sess?.workspace_id != null ? String(sess.workspace_id).trim() : '';
      tenantId = sess?.tenant_id != null ? String(sess.tenant_id).trim() : '';
      userId = sess?.user_id != null ? String(sess.user_id).trim() : '';
    }
    if (!workspaceId) {
      return jsonResponse({ error: 'unauthorized' }, 401);
    }

    let modelKey = '';
    const override = String(modelKeyOverride || '').trim();
    if (override && tenantId) {
      const allowed = await env.DB.prepare(
        `SELECT model_key FROM agentsam_ai
         WHERE model_key = ? AND mode = 'model' AND status = 'active'
           AND (is_global = 1 OR allowed_tenants_json LIKE ('%"' || ? || '"%'))
         LIMIT 1`,
      )
        .bind(override, tenantId)
        .first();
      if (allowed?.model_key) {
        modelKey = String(allowed.model_key);
      } else {
        logTerminalAssistError(env, ctx, {
          workspaceId,
          tenantId,
          sessionId: session_id ?? null,
          errorCode: 'model_not_allowed',
          errorMessage: `model_not_allowed: ${override}`,
          mode: assistMode,
          command: command ?? null,
        });
        return jsonResponse({ error: 'model_not_allowed', model_key: override }, 400);
      }
    } else {
      try {
        const resolved = await resolveModelForTask(env, {
          task_type: normalizeCanonicalTaskType('terminal_execution'),
          mode: 'agent',
          workspace_id: workspaceId,
        });
        modelKey = String(resolved?.model_key || '').trim();
      } catch (e) {
        const detail = e?.message != null ? String(e.message) : 'model_resolve_failed';
        logTerminalAssistError(env, ctx, {
          workspaceId,
          tenantId,
          sessionId: session_id ?? null,
          errorCode: 'model_resolve_failed',
          errorMessage: detail,
          mode: assistMode,
          command: command ?? null,
        });
        return jsonResponse({ error: 'model_resolve_failed', detail }, 500);
      }
      if (!modelKey) {
        logTerminalAssistError(env, ctx, {
          workspaceId,
          tenantId,
          sessionId: session_id ?? null,
          errorCode: 'model_resolve_empty',
          errorMessage: 'model_resolve_empty',
          mode: assistMode,
          command: command ?? null,
        });
        return jsonResponse({ error: 'model_resolve_empty' }, 500);
      }
    }

    const agentRunId =
      userId && workspaceId ? mintTerminalAssistAgentRunId(env, ctx, { userId, workspaceId }) : null;
    if (agentRunId) {
      startTerminalAssistAgentRun(env, ctx, {
        agentRunId,
        userId,
        tenantId,
        workspaceId,
        sessionId: session_id ?? null,
        modelKey,
        mode: assistMode,
      });
    }

    const systemPrompt = `You are a developer assistant embedded in the IAM terminal.
Be concise. Plain text only. No markdown headers. Dashes not bullet asterisks.
Max 10 lines unless more detail is essential.`;

    try {
      // Blocking JSON — iam-pty handleAssist expects { text }, not SSE.
      const result = await dispatchComplete(env, {
        modelKey,
        systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        userId: userId || undefined,
        options: {
          reasoningEffort: assistMode === 'agent' ? 'medium' : 'none',
          verbosity: 'low',
        },
      });

      const text =
        result?.content?.[0]?.text ||
        result?.choices?.[0]?.message?.content ||
        result?.text ||
        result?.output_text ||
        (typeof result === 'string' ? result : JSON.stringify(result));

      const usage = extractDispatchUsage(result);
      if (agentRunId) {
        await finalizeTerminalAssistAgentRun(env, ctx, {
          agentRunId,
          userId,
          tenantId,
          workspaceId,
          sessionId: session_id ?? null,
          modelKey,
          mode: assistMode,
          command: command ?? null,
          success: true,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          durationMs: Date.now() - runStartedAt,
        });
      }

      return jsonResponse({
        text: String(text).slice(0, 1200),
        ...(agentRunId ? { agent_run_id: agentRunId } : {}),
      });
    } catch (e) {
      const detail = e?.message != null ? String(e.message) : 'assist failed';
      if (agentRunId) {
        await finalizeTerminalAssistAgentRun(env, ctx, {
          agentRunId,
          userId,
          tenantId,
          workspaceId,
          sessionId: session_id ?? null,
          modelKey,
          mode: assistMode,
          command: command ?? null,
          success: false,
          errorMessage: detail,
          durationMs: Date.now() - runStartedAt,
        });
      } else if (tenantId) {
        logTerminalAssistError(env, ctx, {
          workspaceId,
          tenantId,
          sessionId: session_id ?? null,
          errorCode: 'terminal_assist_failed',
          errorMessage: detail,
          mode: assistMode,
          command: command ?? null,
        });
      }
      return jsonResponse({ error: 'assist failed', detail }, 500);
    }
  }

  return jsonResponse({ error: 'not found' }, 404);
}
