/**
 * MCP zone sandbox execution for agentsam_terminal_sandbox.
 * Runs commands under {workspace_root}/.mcp-zones/{zone_slug}/ (caller workspace by default).
 */
import { runTerminalCommand } from './terminal.js';
import { normalizeMcpZoneSlug, resolveMcpZoneWorkspaceId } from './mcp-zone-spine.js';
import {
  buildTerminalToolResponseBody,
  terminalRecoveryHints,
  wrapShellCommandWithPath,
} from './mcp-terminal-contract.js';

export { normalizeMcpZoneSlug } from './mcp-zone-spine.js';

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
 * }} opts
 */
export async function runMcpZoneSandboxCommand(env, request, opts) {
  const command = String(opts.command || '').trim();
  if (!command) {
    return { ok: false, error: 'command required' };
  }

  const zoneSlug = normalizeMcpZoneSlug(opts.zoneSlug);
  const config = opts.config && typeof opts.config === 'object' ? opts.config : {};
  const zoneWs =
    opts.zoneSlug != null
      ? resolveMcpZoneWorkspaceId(normalizeMcpZoneSlug(opts.zoneSlug), String(opts.tenantId || ''))
      : null;
  const useCallerWs = config.use_caller_workspace === true && !zoneWs;
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
