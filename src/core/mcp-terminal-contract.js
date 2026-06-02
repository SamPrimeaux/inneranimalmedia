/**
 * Canonical MCP terminal tool contracts (local vs remote).
 * Code wins at runtime; D1 agentsam_tools schemas kept in sync via migration.
 */

/** @type {Record<string, unknown>} */
export const CANONICAL_AGENTSAM_TERMINAL_LOCAL_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    command: {
      type: 'string',
      description: 'Shell command to run on the platform VM.',
    },
    path: {
      type: 'string',
      description:
        'Optional working directory (absolute under PTY workspace). Honored as cwd unless command already starts with cd.',
    },
  },
  required: ['command'],
  additionalProperties: false,
};

/** @type {Record<string, unknown>} */
export const CANONICAL_AGENTSAM_TERMINAL_REMOTE_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    command: {
      type: 'string',
      description: 'Shell command on the configured remote terminal target.',
    },
    target_id: {
      type: 'string',
      description: 'Optional terminal_connections target id for this workspace.',
    },
  },
  required: ['command'],
  additionalProperties: false,
};

/** @type {Record<string, unknown>} */
export const CANONICAL_AGENTSAM_TERMINAL_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    cwd: { type: 'string', nullable: true },
    cwd_source: {
      type: 'string',
      enum: ['path', 'workspace_root', 'command_cd', 'pty_session_default'],
    },
    exit_code: { type: 'integer', nullable: true },
    stdout: { type: 'string' },
    stderr: { type: 'string' },
    output: { type: 'string', description: 'Alias of stdout for backward compatibility.' },
    command: { type: 'string' },
    recovery_hints: { type: 'array' },
  },
  additionalProperties: true,
};

/** @returns {Record<string, unknown>} */
export function agentsamTerminalLocalInputSchema() {
  return {
    ...CANONICAL_AGENTSAM_TERMINAL_LOCAL_INPUT_SCHEMA,
    properties: { ...CANONICAL_AGENTSAM_TERMINAL_LOCAL_INPUT_SCHEMA.properties },
    required: [...CANONICAL_AGENTSAM_TERMINAL_LOCAL_INPUT_SCHEMA.required],
  };
}

/**
 * Prefix a shell command with cd when callers pass an explicit working directory.
 * Skips when the command already starts with cd (caller owns cwd).
 * @param {string|null|undefined} path
 * @param {string} command
 */
export function wrapShellCommandWithPath(path, command) {
  const cmd = String(command || '').trim();
  const dir = String(path || '').trim();
  if (!cmd || !dir) return cmd;
  if (/^\s*cd\s+/i.test(cmd)) return cmd;
  const quoted = dir.includes(' ') || dir.includes('$') ? `"${dir.replace(/"/g, '\\"')}"` : dir;
  return `cd ${quoted} && ${cmd}`;
}

/** @returns {Record<string, unknown>} */
export function agentsamTerminalRemoteInputSchema() {
  return {
    ...CANONICAL_AGENTSAM_TERMINAL_REMOTE_INPUT_SCHEMA,
    properties: { ...CANONICAL_AGENTSAM_TERMINAL_REMOTE_INPUT_SCHEMA.properties },
    required: [...CANONICAL_AGENTSAM_TERMINAL_REMOTE_INPUT_SCHEMA.required],
  };
}

/**
 * @param {Record<string, unknown>} params
 * @returns {string|null} error message when invalid
 */
export function assertTerminalLocalArgs(params) {
  if (params?.target_id != null && String(params.target_id).trim() !== '') {
    return 'terminal_local_does_not_accept_target_id: use agentsam_terminal_remote';
  }
  if (params?.targetId != null && String(params.targetId).trim() !== '') {
    return 'terminal_local_does_not_accept_targetId: use agentsam_terminal_remote';
  }
  return null;
}

/**
 * @param {string} command
 * @returns {string|null}
 */
export function inferCwdFromShellCommand(command) {
  const cmd = String(command || '').trim();
  const m = cmd.match(/^\s*cd\s+(?:"([^"]+)"|'([^']+)'|(\S+))/i);
  if (!m) return null;
  return String(m[1] || m[2] || m[3] || '').trim() || null;
}

/**
 * @param {{ stdout?: string, stderr?: string, exitCode?: number|null }} opts
 * @returns {{ code: string, action: string }[]}
 */
export function terminalRecoveryHints(opts = {}) {
  const text = `${opts.stdout ?? ''}\n${opts.stderr ?? ''}`;
  const hints = [];

  if (
    /Permission to .+ denied|fatal: unable to access 'https:\/\/github\.com|returned error: 403/i.test(
      text,
    )
  ) {
    hints.push({
      code: 'git_https_push_denied',
      action:
        'Push failed over HTTPS. When SSH is authorized, set origin to git@github.com:OWNER/REPO.git and retry git push.',
    });
  }

  if (
    /Cannot find native binding|Cannot find module '@rolldown\/binding|optional dependency/i.test(
      text,
    )
  ) {
    hints.push({
      code: 'node_optional_binding_missing',
      action: 'Run npm i then npm run build before changing application source code.',
    });
  }

  if (opts.exitCode != null && opts.exitCode !== 0 && hints.length === 0) {
    void opts.exitCode;
  }

  return hints;
}

/**
 * @param {{
 *   explicitPath?: string|null,
 *   workspaceRoot?: string|null,
 *   executedCommand?: string,
 *   stdout?: string,
 *   stderr?: string,
 *   exitCode?: number|null,
 *   status?: string,
 * }} ctx
 */
export function buildTerminalToolResponseBody(ctx) {
  const explicitPath = String(ctx.explicitPath || '').trim();
  const workspaceRoot = String(ctx.workspaceRoot || '').trim();
  const executedCommand = String(ctx.executedCommand || '').trim();
  const stdout = typeof ctx.stdout === 'string' ? ctx.stdout : '';
  const stderr = typeof ctx.stderr === 'string' ? ctx.stderr : '';
  const exitCode = ctx.exitCode ?? null;

  let cwd = explicitPath || workspaceRoot || inferCwdFromShellCommand(executedCommand) || null;
  let cwd_source = 'pty_session_default';
  if (explicitPath) cwd_source = 'path';
  else if (workspaceRoot) cwd_source = 'workspace_root';
  else if (inferCwdFromShellCommand(executedCommand)) cwd_source = 'command_cd';

  const recovery_hints = terminalRecoveryHints({ stdout, stderr, exitCode });

  return {
    cwd,
    cwd_source,
    exit_code: exitCode,
    stdout,
    stderr,
    output: stdout,
    command: executedCommand,
    status: ctx.status || 'success',
    ...(recovery_hints.length ? { recovery_hints } : {}),
  };
}
