/**
 * Tenant-safe /api/agent/terminal/run gate: bootstrap, MCP tool registration, optional approval.
 */
import { getAuthUser, authUserIsSuperadmin, fetchAuthUserTenantId, platformTenantIdFromEnv } from './auth.js';
import {
  resolveEffectiveWorkspaceId,
  resolveActiveBootstrap,
  WORKSPACE_CONTEXT_MISSING,
  resolveTenantIdForWorkspace,
} from './bootstrap.js';
import { selectAgentsamMcpToolRow } from './agentsam-mcp-tools.js';
import { loadAgentSamUserPolicy } from './agent-policy.js';
import { runTerminalCommand } from './terminal.js';
import { scheduleRecordMcpToolExecution } from './mcp-tool-execution.js';
import { resolveCanonicalUserId } from '../api/auth.js';

function isLikelySafeShellCommand(cmd) {
  const c = String(cmd || '').trim();
  if (!c) return false;
  return (
    /^(pwd|whoami|hostname|date|uname)(\s|$)/i.test(c) ||
    /^echo\s+/i.test(c) ||
    /^ls(\s|$)/i.test(c) ||
    /^printenv(\s|$)/i.test(c)
  );
}

function scheduleTerminalToolCallLog(env, ctx, params) {
  if (!env?.DB) return;
  const {
    tenantId,
    sessionId,
    userId,
    workspaceId,
    toolName,
    status,
    durationMs,
    errorMessage,
    inputSummary,
  } = params;
  const p = env.DB
    .prepare(
      `INSERT INTO agentsam_tool_call_log
       (tenant_id, session_id, tool_name, status, duration_ms, cost_usd, input_tokens, output_tokens, user_id, workspace_id, error_message, input_summary)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      tenantId != null ? String(tenantId) : 'system',
      sessionId ?? null,
      String(toolName || 'terminal_run'),
      status === 'success' ? 'success' : 'error',
      Math.max(0, Math.floor(Number(durationMs) || 0)),
      0,
      0,
      0,
      userId ?? null,
      workspaceId ?? null,
      errorMessage != null ? String(errorMessage).slice(0, 8000) : null,
      String(inputSummary ?? '').slice(0, 200),
    )
    .run()
    .catch((e) => console.warn('[agent-terminal-run tool_call_log]', e?.message ?? e));
  if (ctx?.waitUntil) ctx.waitUntil(p);
  else void p;
}

/**
 * @param {Request} request
 * @param {any} env
 * @param {any} ctx
 * @param {URL} url
 * @param {object} body parsed JSON body
 */
export async function executeScopedAgentTerminalRun(request, env, ctx, url, body) {
  const authUser = await getAuthUser(request, env);
  if (!authUser) return { response: null, error: 'Unauthorized', status: 401 };

  const command = typeof body?.command === 'string' ? body.command.trim() : '';
  if (!command) return { response: null, error: 'No command', status: 400 };

  const sessionId = body?.session_id ?? null;
  const proposalId = body?.proposal_id ?? body?.approved_proposal_id ?? null;
  const superadmin = authUserIsSuperadmin(authUser);
  const uid = String(authUser.id || '').trim();

  let targetWorkspace =
    url.searchParams.get('workspace_id') ||
    (typeof body?.workspace_id === 'string' ? body.workspace_id.trim() : '') ||
    '';

  const wsRes = await resolveEffectiveWorkspaceId(env, request, authUser, {});
  if (wsRes.error || !wsRes.workspaceId) {
    return { response: null, error: WORKSPACE_CONTEXT_MISSING, status: 400 };
  }
  const effectiveWs = String(wsRes.workspaceId).trim();

  if (superadmin && targetWorkspace && targetWorkspace !== effectiveWs) {
    /* intentional cross-workspace administration */
  } else {
    targetWorkspace = effectiveWs;
  }

  let tenantId =
    authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
      ? String(authUser.tenant_id).trim()
      : '';
  if (!tenantId) tenantId = await fetchAuthUserTenantId(env, uid);
  if (!tenantId) tenantId = await resolveTenantIdForWorkspace(env, targetWorkspace);
  if (!tenantId && superadmin) tenantId = platformTenantIdFromEnv(env) || '';
  if (!tenantId) return { response: null, error: 'tenant_required', status: 403 };

  const personUuid = authUser.person_uuid != null ? String(authUser.person_uuid).trim() : '';

  const policy = await loadAgentSamUserPolicy(env, uid, targetWorkspace);
  const bootstrap = await resolveActiveBootstrap(env, {
    userId: uid,
    personUuid: personUuid || null,
    tenantId,
    workspaceId: targetWorkspace,
  });

  if (!superadmin) {
    if (!bootstrap) return { response: null, error: 'Terminal not permitted (no bootstrap)', status: 403 };
    let capabilities = {};
    try {
      capabilities = JSON.parse(bootstrap.capabilities_json || '{}');
    } catch (_) {
      capabilities = {};
    }
    const canPty = capabilities.can_run_pty === true || capabilities.terminal === true;
    if (!canPty) return { response: null, error: 'Terminal not permitted', status: 403 };

    const mcpRow = await selectAgentsamMcpToolRow(env.DB, {
      userId: uid,
      tenantId,
      workspaceId: targetWorkspace,
      personUuid: personUuid || null,
    }, 'terminal_execute');
    const legacyOk = Number(policy.legacy_terminal_tool ?? 0) === 1;
    if (!mcpRow && !legacyOk) {
      return { response: null, error: 'terminal_execute not registered for this workspace', status: 403 };
    }

    const needsApprovalGate = !isLikelySafeShellCommand(command);
    if (needsApprovalGate) {
      let ok = false;
      if (proposalId && env.DB) {
        const pr = await env.DB.prepare(
          `SELECT id FROM agentsam_approval_queue WHERE id = ? AND status = 'approved' AND expires_at > unixepoch() LIMIT 1`,
        )
          .bind(String(proposalId))
          .first()
          .catch(() => null);
        ok = !!pr;
      }
      if (!ok) {
        return {
          response: null,
          error:
            'High-risk terminal command requires an approved proposal_id (dashboard approval flow) or use d1_query for reads.',
          status: 403,
        };
      }
    }
  }

  const t0 = Date.now();
  let output = '';
  let runCommand = command;
  let execErr = null;
  try {
    const r = await runTerminalCommand(env, request, command, sessionId, {
      execution_mode: 'pty',
      workspace_id: targetWorkspace,
    });
    output = r.output;
    runCommand = r.command;
  } catch (e) {
    execErr = e;
  }
  const durationMs = Date.now() - t0;

  const execId = crypto.randomUUID();
  if (env.DB) {
    try {
      const canonicalUserId = await resolveCanonicalUserId(uid, env);
      await env.DB.prepare(
        `INSERT INTO agentsam_command_run
         (id, tenant_id, workspace_id, user_id, session_id, command_name, command_text, output_text, status, started_at, completed_at)
         VALUES (?, ?, ?, ?, ?, 'terminal_run', ?, ?, ?, unixepoch(), unixepoch())`,
      ).bind(
        execId,
        tenantId,
        targetWorkspace,
        canonicalUserId,
        sessionId || null,
        runCommand,
        execErr ? String(execErr.message || execErr).slice(0, 12000) : output.slice(0, 12000),
        execErr ? 'failed' : 'completed',
      ).run();
    } catch (_) {}

    scheduleRecordMcpToolExecution(env, ctx, {
      tenant_id: tenantId,
      workspace_id: targetWorkspace,
      session_id: sessionId,
      tool_name: 'terminal_run',
      input_json: JSON.stringify({ command: runCommand, workspace_id: targetWorkspace }),
      output_json: execErr ? null : JSON.stringify({ output: output.slice(0, 8000) }),
      success: !execErr,
      error_message: execErr ? String(execErr.message || execErr).slice(0, 4000) : null,
      duration_ms: durationMs,
      user_id: uid,
      person_uuid: personUuid || null,
      status: execErr ? 'error' : 'completed',
    });

    scheduleTerminalToolCallLog(env, ctx, {
      tenantId,
      sessionId,
      userId: uid,
      workspaceId: targetWorkspace,
      toolName: 'terminal_run',
      status: execErr ? 'error' : 'success',
      durationMs,
      errorMessage: execErr ? String(execErr.message || execErr) : null,
      inputSummary: String(runCommand).slice(0, 200),
    });
  }

  if (execErr) {
    return {
      response: null,
      error: execErr.message || 'terminal run failed',
      status: 500,
      execution_id: execId,
    };
  }

  return {
    response: { output, command: runCommand, execution_id: execId },
    error: null,
    status: 200,
  };
}
