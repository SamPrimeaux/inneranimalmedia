/**
 * MCP zone sandbox execution for agentsam_terminal_sandbox.
 * Target: CF Container per zone_slug (see docs/platform/terminal-three-lane-model.md).
 * Legacy fallback: PTY under .mcp-zones/{zone_slug} when container backend unavailable.
 */
import { runTerminalCommand } from './terminal.js';
import {
  CONTAINER_EXEC_COMMAND_TIMEOUT_MS,
  tryZoneContainerExec,
} from './my-container.js';
import {
  normalizeMcpZoneSlug,
  resolveMcpZoneWorkspaceId,
  resolveSandboxContainerSlug,
} from './mcp-zone-spine.js';
import {
  buildTerminalToolResponseBody,
  terminalRecoveryHints,
  wrapShellCommandWithPath,
} from './mcp-terminal-contract.js';

export { normalizeMcpZoneSlug, resolveSandboxContainerSlug } from './mcp-zone-spine.js';

/** @param {string} raw */
function shellQuote(raw) {
  const s = String(raw || '');
  if (!/[\s'"$`\\]/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * @param {Record<string, unknown>} config
 * @param {string} zoneSlug
 * @param {string} tenantId
 * @param {string} userId
 */
export function resolveMcpZoneSandboxRoot(config, zoneSlug, tenantId, userId) {
  const tpl = String(config.zone_root_template || '.mcp-zones/{zone_slug}').trim();
  return tpl
    .replace(/\{zone_slug\}/g, zoneSlug)
    .replace(/\{tenant_id\}/g, tenantId || 'unknown')
    .replace(/\{user_id\}/g, userId || 'unknown');
}

/**
 * @param {any} env
 * @param {Request|null|undefined} request
 * @param {{
 *   command: string,
 *   zoneSlug?: string,
 *   tenantId?: string,
 *   userId?: string,
 *   workspaceId?: string,
 *   sessionId?: string|null,
 *   config?: Record<string, unknown>,
 *   language?: string,
 *   path?: string,
 *   timeout_ms?: number,
 * }} opts
 */
export async function runMcpZoneSandboxCommand(env, request, opts) {
  const command = String(opts.command || '').trim();
  if (!command) {
    return { ok: false, error: 'command required' };
  }

  const config = opts.config && typeof opts.config === 'object' ? opts.config : {};
  const useContainer =
    String(config.target_type || '').trim() === 'container' ||
    String(env?.IAM_SANDBOX_USE_CONTAINER || '1').trim() === '1';

  const zoneSlug = useContainer
    ? await resolveSandboxContainerSlug(env, {
        zoneSlug: opts.zoneSlug,
        userId: opts.userId,
        username: opts.username,
        workspaceId: opts.workspaceId,
        tenantId: opts.tenantId,
      })
    : normalizeMcpZoneSlug(opts.zoneSlug);

  if (useContainer) {
    const innerPath = opts.path != null ? String(opts.path).trim() : '';
    const language = String(opts.language || 'shell').trim().toLowerCase();
    let runCmd = command;
    if (language === 'python') {
      runCmd = `python3 -c ${shellQuote(command)}`;
    } else if (language === 'node') {
      runCmd = `node -e ${shellQuote(command)}`;
    }

    const containerCwd = innerPath
      ? `/tmp/${zoneSlug}/${innerPath.replace(/^\//, '')}`
      : `/tmp/${zoneSlug}`;
    const timeoutMs =
      opts.timeout_ms != null && Number.isFinite(Number(opts.timeout_ms))
        ? Number(opts.timeout_ms)
        : CONTAINER_EXEC_COMMAND_TIMEOUT_MS;
    const containerOut = await tryZoneContainerExec(env, {
      command: runCmd,
      zone_slug: zoneSlug,
      cwd: containerCwd,
      timeout_ms: timeoutMs,
    });
    const stdout = String(containerOut.stdout ?? '');
    const stderr = String(containerOut.stderr ?? containerOut.error ?? '');
    const exitCode = containerOut.exit_code ?? (containerOut.ok ? 0 : 1);
    const body = buildTerminalToolResponseBody({
      explicitPath: containerCwd,
      executedCommand: runCmd,
      stdout,
      stderr,
      exitCode,
      status: containerOut.ok ? 'success' : 'error',
    });
    return {
      ok: containerOut.ok !== false && !containerOut.error,
      error: containerOut.error || null,
      body: {
        ...body,
        zone_slug: zoneSlug,
        sandbox_root: containerCwd,
        cwd_source: 'container_user',
        lane: 'container',
        image: containerOut.image ?? null,
        recovery_hints: terminalRecoveryHints({ stdout, stderr, exitCode }),
      },
    };
  }

  const useCallerWs = config.use_caller_workspace === true;
  const zoneWs =
    !useCallerWs && opts.zoneSlug != null
      ? resolveMcpZoneWorkspaceId(normalizeMcpZoneSlug(opts.zoneSlug), String(opts.tenantId || ''))
      : null;
  const execWorkspaceId = useCallerWs
    ? String(opts.workspaceId || '').trim()
    : zoneWs || String(config.sandbox_workspace_id || opts.workspaceId || '').trim();

  if (!execWorkspaceId) {
    return { ok: false, error: 'workspace_id required for sandbox execution' };
  }

  const zoneRel = resolveMcpZoneSandboxRoot(
    config,
    zoneSlug,
    String(opts.tenantId || ''),
    String(opts.userId || ''),
  );

  let workspaceRoot = null;
  if (env?.DB && execWorkspaceId) {
    const row = await env.DB.prepare(
      'SELECT settings_json FROM workspace_settings WHERE workspace_id = ? LIMIT 1',
    )
      .bind(execWorkspaceId)
      .first()
      .catch(() => null);
    if (row?.settings_json) {
      try {
        const parsed =
          typeof row.settings_json === 'string' ? JSON.parse(row.settings_json) : row.settings_json;
        workspaceRoot = String(parsed?.workspace_root || '').trim() || null;
      } catch (_) {
        workspaceRoot = null;
      }
    }
  }

  const innerPath = opts.path != null ? String(opts.path).trim() : '';
  const zoneDir = innerPath
    ? `${zoneRel.replace(/\/$/, '')}/${innerPath.replace(/^\//, '')}`
    : zoneRel;

  const absZoneDir = workspaceRoot
    ? `${workspaceRoot.replace(/\/$/, '')}/${zoneDir.replace(/^\//, '')}`
    : zoneDir;

  const language = String(opts.language || 'shell').trim().toLowerCase();
  let runCmd = command;
  if (language === 'python') {
    runCmd = `python3 -c ${shellQuote(command)}`;
  } else if (language === 'node') {
    runCmd = `node -e ${shellQuote(command)}`;
  }

  const wrapped = `mkdir -p ${shellQuote(absZoneDir)} && cd ${shellQuote(absZoneDir)} && ${runCmd}`;

  let stdout = '';
  let stderr = '';
  let exitCode = null;
  let executedCommand = wrapped;
  let errText = null;

  try {
    const r = await runTerminalCommand(env, request, wrapped, opts.sessionId ?? null, {
      execution_mode: 'pty',
      workspace_id: execWorkspaceId,
      tool_name: 'agentsam_terminal_sandbox',
      target_type: String(config.target_type || 'sandbox'),
      zone_slug: zoneSlug,
    });
    stdout = typeof r.output === 'string' ? r.output : '';
    executedCommand = r.command || wrapped;
    exitCode = r.exitCode ?? r.exit_code ?? 0;
  } catch (e) {
    errText = String(e?.message || e);
    stderr = errText;
  }

  const body = buildTerminalToolResponseBody({
    explicitPath: absZoneDir,
    workspaceRoot,
    executedCommand,
    stdout,
    stderr,
    exitCode,
    status: errText ? 'error' : 'success',
  });

  return {
    ok: !errText,
    error: errText,
    body: {
      ...body,
      zone_slug: zoneSlug,
      sandbox_root: absZoneDir,
      cwd_source: 'sandbox_zone',
      recovery_hints: terminalRecoveryHints({ stdout, stderr, exitCode }),
    },
  };
}
