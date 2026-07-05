/**
 * Terminal lane fallback — when local PTY fails, retry sandbox (and remote for operators).
 * Keeps a single model tool call while the platform tries alternate exec surfaces.
 */
import { wrapShellCommandWithPath } from './mcp-terminal-contract.js';
import {
  resolveTerminalExecRouting,
  terminalToolPrefersGcpLane,
  validateUserLocalTerminalAccess,
} from './terminal-routing-policy.js';
import { shouldSkipLocalTerminalTunnel } from './mobile-exec-profile.js';
import { userIsPlatformOperator } from './platform-operator-policy.js';
import { gcpRemoteExecCwd } from './host-workspace-paths.js';

/**
 * @param {unknown} settingsJson
 * @param {string} command
 * @param {{ gcpExec?: boolean }} [opts]
 */
function wrapWorkspaceShellCommand(settingsJson, command, opts = {}) {
  const cmd = String(command || '').trim();
  if (!cmd) return cmd;

  let parsed = settingsJson;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch (_) {
      return cmd;
    }
  }
  if (!parsed || typeof parsed !== 'object') return cmd;
  if (/^\s*cd\s+/i.test(cmd)) return cmd;

  const gcpExec = opts.gcpExec === true;
  if (gcpExec) {
    const vmRoot = String(parsed.vm_workspace_root || parsed.repo?.vm_path || '').trim();
    const root = vmRoot || gcpRemoteExecCwd(parsed);
    if (root && cmd.includes(root)) return cmd;
    return `cd ${root} && ${cmd}`;
  }

  const root = String(parsed.workspace_root || '').trim();
  if (root && cmd.includes(root)) return cmd;

  const cdPrefix = String(parsed.workspace_cd_command || '').trim();
  if (cdPrefix) {
    if (/&&\s*$/.test(cdPrefix)) return `${cdPrefix} ${cmd}`;
    if (cdPrefix.includes('&&')) return `${cdPrefix} && ${cmd}`;
    return `${cdPrefix} && ${cmd}`;
  }
  if (root) return `cd ${root} && ${cmd}`;
  return cmd;
}

export const TERMINAL_LANE_TOOLS = Object.freeze({
  LOCAL: 'agentsam_terminal_local',
  SANDBOX: 'agentsam_terminal_sandbox',
  REMOTE: 'agentsam_terminal_remote',
});

/**
 * @param {string|null|undefined} initialToolKey
 * @param {{ isPlatformOperator?: boolean }} [opts]
 * @returns {string[]}
 */
export function resolveTerminalFallbackChain(initialToolKey, opts = {}) {
  const initial = String(initialToolKey || '').trim();
  if (!initial) return [];

  /** @type {string[]} */
  const chain = [initial];

  if (initial === TERMINAL_LANE_TOOLS.LOCAL) {
    chain.push(TERMINAL_LANE_TOOLS.SANDBOX);
    if (opts.isPlatformOperator === true) {
      chain.push(TERMINAL_LANE_TOOLS.REMOTE);
    }
  } else if (initial === TERMINAL_LANE_TOOLS.REMOTE) {
    chain.push(TERMINAL_LANE_TOOLS.SANDBOX);
  }

  return [...new Set(chain)];
}

/**
 * @param {{ ok?: boolean, error?: string, body?: Record<string, unknown>|null }} result
 * @returns {boolean}
 */
export function isRetriableTerminalLaneFailure(result) {
  if (!result || result.ok === true) return false;
  const err = [
    result.error,
    result.body?.user_message,
    result.body?.stderr,
    result.body?.output,
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();

  if (!err) return true;

  const retriable =
    /403|401|forbidden|auth|pty command failed|enoent|tunnel|unavailable|timeout|econnrefused|connection|health_probe|not_provisioned|mobile_local|routing forbidden|terminal error/i.test(
      err,
    );
  return retriable;
}

/**
 * @param {string} rawCommand
 * @param {string} laneToolKey
 * @param {{ explicitPath?: string|null, settingsJson?: unknown, parsedSettings?: Record<string, unknown>|null }} [opts]
 */
export function buildCommandForTerminalLane(rawCommand, laneToolKey, opts = {}) {
  const cmd = String(rawCommand || '').trim();
  if (!cmd) return cmd;

  const lane = String(laneToolKey || '').trim();
  const explicitPath = String(opts.explicitPath || '').trim();
  const settingsJson = opts.settingsJson ?? null;
  const parsedSettings =
    opts.parsedSettings && typeof opts.parsedSettings === 'object' ? opts.parsedSettings : null;

  if (lane === TERMINAL_LANE_TOOLS.SANDBOX) {
    return cmd;
  }

  if (lane === TERMINAL_LANE_TOOLS.REMOTE) {
    if (settingsJson) {
      return wrapWorkspaceShellCommand(settingsJson, cmd, { gcpExec: true });
    }
    const vmRoot = gcpRemoteExecCwd(parsedSettings);
    if (vmRoot && !cmd.includes(vmRoot)) {
      return `cd ${vmRoot} && ${cmd}`;
    }
    return cmd;
  }

  if (lane === TERMINAL_LANE_TOOLS.LOCAL) {
    if (explicitPath) {
      return wrapShellCommandWithPath(explicitPath, cmd);
    }
    if (settingsJson) {
      return wrapWorkspaceShellCommand(settingsJson, cmd, { gcpExec: false });
    }
    return cmd;
  }

  if (explicitPath) return wrapShellCommandWithPath(explicitPath, cmd);
  return cmd;
}

/**
 * @param {Array<{ tool: string, ok: boolean, error?: string|null, lane?: string|null }>} attempts
 * @param {{ rawCommand?: string|null }} [ctx]
 */
export function buildTerminalLanesExhaustedBody(attempts, ctx = {}) {
  const rawCommand = String(ctx.rawCommand || '').trim();
  /** @type {{ code: string, action: string }[]} */
  const recovery_hints = [];
  /** @type {string[]} */
  const next_steps = [];

  const text = attempts.map((a) => `${a.tool}:${a.error || 'failed'}`).join('\n');
  const had403 = /403|forbidden|auth/i.test(text);
  const hadLocal = attempts.some((a) => a.tool === TERMINAL_LANE_TOOLS.LOCAL);
  const hadSandbox = attempts.some((a) => a.tool === TERMINAL_LANE_TOOLS.SANDBOX);
  const hadRemote = attempts.some((a) => a.tool === TERMINAL_LANE_TOOLS.REMOTE);
  const hadTunnel = /tunnel|not_provisioned|localpty/i.test(text);

  if (had403 && hadLocal) {
    recovery_hints.push({
      code: 'local_pty_auth_failed',
      action:
        'Local PTY returned 403 — verify the localpty daemon is running on your Mac and EXECOS_KEY / PTY token matches Settings → Terminal.',
    });
    next_steps.push('On your Mac: `ps aux | grep localpty` and test POST https://localpty.inneranimalmedia.com/run with your bearer token.');
  }

  if (hadTunnel) {
    recovery_hints.push({
      code: 'user_hosted_tunnel_missing',
      action:
        'No healthy device tunnel — complete Terminal setup in Settings (cloudflared) or use agentsam_terminal_sandbox for cloud shell work.',
    });
  }

  if (hadSandbox) {
    recovery_hints.push({
      code: 'sandbox_lane_failed',
      action:
        'CF Container sandbox also failed — check MY_CONTAINER health or retry with a simpler command (whoami, pwd, ls).',
    });
  }

  if (hadRemote) {
    recovery_hints.push({
      code: 'remote_lane_failed',
      action:
        'GCP remote lane failed — confirm terminal.inneranimalmedia.com health and that the sparse clone exists at /home/samprimeaux/inneranimalmedia.',
    });
  }

  recovery_hints.push({
    code: 'terminal_all_lanes_failed',
    action:
      'All terminal lanes failed for this command. Try GitHub read tools for file inspection, or run the command manually and paste output.',
  });

  if (!next_steps.length) {
    next_steps.push('Start a fresh Agent chat turn and retry with an explicit lane: sandbox for cloud shell, local only when your Mac tunnel is healthy.');
  }

  const summary = had403
    ? 'Terminal execution failed on every lane (local PTY auth/tunnel issue detected).'
    : 'Terminal execution failed on every available lane.';

  return {
    ok: false,
    error: 'all_terminal_lanes_failed',
    body: {
      user_message: summary,
      command: rawCommand || null,
      lane_attempts: attempts,
      recovery_hints,
      next_steps,
      stderr: summary,
      stdout: '',
      output: '',
      exit_code: null,
    },
  };
}

/**
 * @param {any} env
 * @param {string} laneToolKey
 * @param {Record<string, unknown>} ctx
 */
async function executeSandboxLane(env, laneToolKey, ctx) {
  const { runMcpZoneSandboxCommand, normalizeMcpZoneSlug } = await import('./terminal-sandbox.js');
  const rawCmd = String(ctx.rawCommand || '').trim();
  if (!rawCmd) {
    return { ok: false, error: 'terminal sandbox requires command in input', lane: 'sandbox_container' };
  }

  const zoneSlug = normalizeMcpZoneSlug(
    ctx.params?.zone_slug ??
      ctx.params?.zoneSlug ??
      ctx.runContext?.mcp_panel_slug ??
      ctx.runContext?.mcpZoneSlug,
  );
  const sandboxTimeoutMs =
    ctx.params?.timeout_ms != null
      ? Number(ctx.params.timeout_ms)
      : ctx.params?.timeoutMs != null
        ? Number(ctx.params.timeoutMs)
        : undefined;

  const sb = await runMcpZoneSandboxCommand(env, ctx.runContext?.request, {
    command: rawCmd,
    zoneSlug,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    sessionId: ctx.runContext?.sessionId ?? ctx.runContext?.session_id ?? null,
    config: ctx.config,
    language: ctx.params?.language,
    path: undefined,
    timeout_ms: Number.isFinite(sandboxTimeoutMs) ? sandboxTimeoutMs : undefined,
    authUser: ctx.runContext?.authUser ?? ctx.runContext?.user ?? null,
  });

  if (!sb.ok) {
    return {
      ok: false,
      error: sb.error || 'sandbox execution failed',
      lane: 'sandbox_container',
      body: sb.body || {},
    };
  }

  return {
    ok: true,
    lane: 'sandbox_container',
    body: {
      ...(sb.body || {}),
      lane: 'sandbox_container',
      fallback_tool: laneToolKey,
    },
  };
}

/**
 * @param {any} env
 * @param {string} laneToolKey
 * @param {Record<string, unknown>} ctx
 */
async function executePtyLane(env, laneToolKey, ctx) {
  const { executeTerminalHandlerRun } = await import('./terminal-handler-run.js');
  const executedCommand = buildCommandForTerminalLane(ctx.rawCommand, laneToolKey, {
    explicitPath: ctx.explicitPath,
    settingsJson: ctx.settingsJson,
    parsedSettings: ctx.parsedSettings,
  });

  const routing = resolveTerminalExecRouting({
    tool_key: laneToolKey,
    target_id: ctx.params?.target_id,
    target_type: ctx.params?.target_type,
    client_surface: ctx.runContext?.client_surface ?? ctx.runContext?.clientSurface ?? null,
    exec_lane: ctx.runContext?.exec_lane ?? ctx.runContext?.execLane ?? null,
    user_id: ctx.userId,
  });

  const remoteTargetId = routing.target_id || '';
  const out = await executeTerminalHandlerRun(
    env,
    {
      command: executedCommand,
      request: ctx.runContext?.request ?? null,
      session_id: ctx.params?.session_id ?? ctx.runContext?.sessionId ?? ctx.runContext?.session_id ?? null,
      workspace_id: ctx.workspaceId,
      tool_name: laneToolKey,
      user_id: ctx.userId,
      client_surface: ctx.runContext?.client_surface ?? ctx.runContext?.clientSurface ?? null,
      exec_lane: ctx.runContext?.exec_lane ?? ctx.runContext?.execLane ?? null,
      ...(remoteTargetId ? { target_id: remoteTargetId } : {}),
      ...(routing.target_type ? { target_type: routing.target_type } : {}),
    },
    ctx.runContext,
  );

  if (out?.error) {
    const errText = String(out.error);
    return {
      ok: false,
      error: errText,
      lane: routing.lane || null,
      body: {
        cwd: ctx.explicitPath || ctx.responseWorkspaceRoot || null,
        stderr: errText,
        command: executedCommand,
      },
    };
  }

  const gcpExec =
    terminalToolPrefersGcpLane(laneToolKey) ||
    routing.lane === 'gcp_primary' ||
    (remoteTargetId && /gcp|iam_tunnel|platform_vm/i.test(remoteTargetId));

  const { buildTerminalToolResponseBody } = await import('./mcp-terminal-contract.js');
  const exitCode = out.exit_code ?? out.exitCode ?? null;
  const stdout = typeof out.output === 'string' ? out.output : '';

  return {
    ok: true,
    lane: routing.lane || null,
    body: buildTerminalToolResponseBody({
      explicitPath: gcpExec ? null : ctx.explicitPath || null,
      workspaceRoot: gcpExec ? ctx.responseWorkspaceRoot : ctx.workspaceRoot,
      executedCommand: out.command || executedCommand,
      stdout,
      stderr: typeof out.stderr === 'string' ? out.stderr : '',
      exitCode,
      status: out.status || 'success',
    }),
  };
}

/**
 * @param {any} env
 * @param {string} laneToolKey
 * @param {Record<string, unknown>} ctx
 */
async function executeTerminalLaneAttempt(env, laneToolKey, ctx) {
  if (laneToolKey === TERMINAL_LANE_TOOLS.SANDBOX) {
    return executeSandboxLane(env, laneToolKey, ctx);
  }

  if (laneToolKey === TERMINAL_LANE_TOOLS.LOCAL) {
    const clientSurface = String(ctx.runContext?.client_surface ?? ctx.runContext?.clientSurface ?? '').trim();
    const execLane = String(ctx.runContext?.exec_lane ?? ctx.runContext?.execLane ?? 'auto')
      .trim()
      .toLowerCase();
    if (shouldSkipLocalTerminalTunnel(clientSurface, execLane)) {
      const isOp = await userIsPlatformOperator(env, ctx.runContext?.authUser, ctx.workspaceId);
      return {
        ok: false,
        error: 'mobile_local_forbidden',
        lane: 'user_local',
        body: {
          user_message: isOp
            ? 'agentsam_terminal_local is unavailable on mobile.'
            : 'agentsam_terminal_local is unavailable on mobile.',
        },
      };
    }
    const localGate = await validateUserLocalTerminalAccess(env.DB, ctx.userId, ctx.workspaceId);
    if (!localGate.ok) {
      return {
        ok: false,
        error: localGate.error,
        lane: 'user_local',
        body: { user_message: localGate.user_message },
      };
    }
    const { assertTerminalLocalArgs } = await import('./mcp-terminal-contract.js');
    const localArgErr = assertTerminalLocalArgs(ctx.params || {});
    if (localArgErr) {
      return { ok: false, error: localArgErr, lane: 'user_local' };
    }
  }

  if (laneToolKey === TERMINAL_LANE_TOOLS.REMOTE) {
    const op = await userIsPlatformOperator(env, ctx.runContext?.authUser, ctx.workspaceId);
    if (!op) {
      return {
        ok: false,
        error: 'platform_operator_required',
        lane: 'forbidden_non_operator',
        body: {
          user_message:
            'agentsam_terminal_remote (GCP cloud desk) is restricted to platform operators.',
        },
      };
    }
  }

  return executePtyLane(env, laneToolKey, ctx);
}

/**
 * Run terminal catalog tool with automatic lane fallback.
 *
 * @param {any} env
 * @param {Record<string, unknown>} ctx
 * @returns {Promise<{ ok: boolean, error?: string, body?: Record<string, unknown> }>}
 */
export async function executeTerminalCatalogWithFallback(env, ctx) {
  const initialToolKey = String(ctx.toolKey || '').trim();
  const rawCommand = String(ctx.rawCommand || ctx.params?.command || ctx.params?.cmd || '').trim();
  if (!rawCommand) {
    return { ok: false, error: 'terminal tool requires command in input' };
  }

  const isOp = await userIsPlatformOperator(env, ctx.runContext?.authUser, ctx.workspaceId);
  const chain = resolveTerminalFallbackChain(initialToolKey, { isPlatformOperator: isOp });

  /** @type {Array<{ tool: string, ok: boolean, error?: string|null, lane?: string|null }>} */
  const attempts = [];
  let lastFailure = null;

  for (let i = 0; i < chain.length; i += 1) {
    const laneTool = chain[i];
    const attempt = await executeTerminalLaneAttempt(env, laneTool, { ...ctx, rawCommand });
    attempts.push({
      tool: laneTool,
      ok: attempt.ok === true,
      error: attempt.error || (attempt.ok ? null : 'failed'),
      lane: attempt.lane ?? null,
    });

    if (attempt.ok) {
      const body = {
        ...(attempt.body || {}),
        ...(i > 0
          ? {
              fallback_from: chain[0],
              fallback_lane: laneTool,
              lane_attempts: attempts,
            }
          : {}),
      };
      return { ok: true, body };
    }

    lastFailure = attempt;
    const hasMore = i < chain.length - 1;
    if (!hasMore || !isRetriableTerminalLaneFailure(attempt)) {
      break;
    }
  }

  if (chain.length > 1 && attempts.length > 1) {
    return buildTerminalLanesExhaustedBody(attempts, { rawCommand });
  }

  const errText = String(lastFailure?.error || 'terminal execution failed');
  const { terminalRecoveryHints } = await import('./mcp-terminal-contract.js');
  return {
    ok: false,
    error: errText,
    body: {
      ...(lastFailure?.body || {}),
      lane_attempts: attempts,
      recovery_hints: terminalRecoveryHints({
        stdout: '',
        stderr: errText,
      }),
    },
  };
}
