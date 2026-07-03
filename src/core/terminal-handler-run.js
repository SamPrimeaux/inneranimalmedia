/**
 * Shared terminal handler entry — merge run identity, routing, in-process vs HTTP.
 * Used by tools/terminal.js and any legacy dispatch path that must not Worker-loopback.
 */
import { getAuthUser } from './auth.js';
import { wrapShellCommandWithPath } from './mcp-terminal-contract.js';
import { resolveTerminalExecRouting } from './terminal-routing-policy.js';

/**
 * @param {Record<string, unknown>} [params]
 * @param {Record<string, unknown>} [runContext]
 */
export function mergeTerminalHandlerParams(params = {}, runContext = {}) {
  const p = params && typeof params === 'object' ? params : {};
  const rc = runContext && typeof runContext === 'object' ? runContext : {};
  return {
    command: p.command ?? p.cmd ?? null,
    request: p.request ?? rc.request ?? null,
    session_id: p.session_id ?? p.sessionId ?? rc.sessionId ?? rc.session_id ?? null,
    workspace_id: p.workspace_id ?? p.workspaceId ?? rc.workspaceId ?? rc.workspace_id ?? null,
    path: p.path ?? p.cwd ?? null,
    cwd: p.cwd ?? p.path ?? null,
    target_id: p.target_id ?? p.targetId ?? rc.target_id ?? null,
    target_type: p.target_type ?? p.targetType ?? rc.target_type ?? null,
    tool_name: p.tool_name ?? p.toolName ?? rc.tool_name ?? rc.toolName ?? null,
    user_id: p.user_id ?? p.userId ?? rc.userId ?? rc.user_id ?? null,
    client_surface: p.client_surface ?? p.clientSurface ?? rc.client_surface ?? rc.clientSurface ?? null,
    exec_lane: p.exec_lane ?? p.execLane ?? rc.exec_lane ?? rc.execLane ?? null,
  };
}

/**
 * @param {any} env
 * @param {Request|null|undefined} request
 * @param {string|null|undefined} explicitUserId
 */
export async function resolveTerminalHandlerUserId(env, request, explicitUserId) {
  const fromParams = explicitUserId != null ? String(explicitUserId).trim() : '';
  if (fromParams) return fromParams;
  if (request) {
    const authUser = await getAuthUser(request, env);
    if (authUser?.id) return String(authUser.id).trim();
  }
  return null;
}

function terminalRoutingForbiddenMessage(routing, toolName) {
  const tk = String(toolName || '').trim();
  if (routing?.lane === 'forbidden_non_operator' && tk === 'agentsam_terminal_remote') {
    return 'agentsam_terminal_remote (GCP cloud desk) is restricted to platform operators.';
  }
  if (routing?.forbidden) {
    return `Terminal routing forbidden for ${tk || 'command'}.`;
  }
  return 'Terminal routing denied.';
}

/**
 * @param {any} env
 * @param {Record<string, unknown>} params
 * @param {Record<string, unknown>} [runContext]
 */
export async function executeTerminalHandlerRun(env, params, runContext = {}) {
  const merged = mergeTerminalHandlerParams(params, runContext);
  const rawCmd = typeof merged.command === 'string' ? merged.command.trim() : '';
  if (!rawCmd) {
    return { error: 'Terminal Error: command required' };
  }

  const workDir = String(merged.path || merged.cwd || '').trim();
  const runCommand = workDir ? wrapShellCommandWithPath(workDir, rawCmd) : rawCmd;
  const toolName = merged.tool_name != null ? String(merged.tool_name).trim() : '';
  const userId = await resolveTerminalHandlerUserId(env, merged.request, merged.user_id);

  const routing = resolveTerminalExecRouting({
    tool_name: toolName || null,
    tool_key: toolName || null,
    target_id: merged.target_id,
    target_type: merged.target_type,
    client_surface: merged.client_surface,
    exec_lane: merged.exec_lane,
    user_id: userId,
  });

  if (routing.forbidden) {
    return { error: `Terminal Error: ${terminalRoutingForbiddenMessage(routing, toolName)}` };
  }

  const remoteTargetId = routing.target_id || '';
  const sessionId = merged.session_id != null ? String(merged.session_id).trim() || null : null;
  const workspaceId =
    merged.workspace_id != null ? String(merged.workspace_id).trim() || null : null;

  const executionCtx = {
    execution_mode: 'pty',
    workspace_id: workspaceId,
    tool_name: toolName || null,
    user_id: userId,
    userId,
    ...(remoteTargetId ? { target_id: remoteTargetId } : {}),
    ...(routing.target_type ? { target_type: routing.target_type } : {}),
  };

  if (merged.request) {
    try {
      const { runTerminalCommand } = await import('./terminal.js');
      const runRes = await runTerminalCommand(env, merged.request, runCommand, sessionId, executionCtx);
      return {
        output: runRes.output || '(no output)',
        command: runRes.command || runCommand,
        exit_code: runRes.exitCode ?? runRes.exit_code ?? null,
        cwd: workDir || null,
        status: 'success',
      };
    } catch (e) {
      return { error: `Terminal Error: ${e?.message || e}` };
    }
  }

  const origin = env.IAM_ORIGIN || 'https://inneranimalmedia.com';
  const headers = { 'Content-Type': 'application/json' };
  try {
    const res = await fetch(`${origin}/api/agent/terminal/run`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        command: runCommand,
        session_id: sessionId,
        ...(workspaceId ? { workspace_id: workspaceId } : {}),
        ...(remoteTargetId ? { target_id: remoteTargetId } : {}),
        ...(routing.target_type ? { target_type: routing.target_type } : {}),
        ...(toolName ? { tool_name: toolName } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'PTY Error');
    return {
      output: data.output || '(no output)',
      command: data.command || runCommand,
      exit_code: data.exit_code ?? data.exitCode ?? null,
      cwd: workDir || null,
      status: 'success',
    };
  } catch (e) {
    return { error: `Terminal Error: ${e.message}` };
  }
}
