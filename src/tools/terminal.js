/**
 * Tool: Terminal
 * Agent-facing interface to the IAM PTY server (iam-pty).
 * Auth: PTY_AUTH_TOKEN (primary) → TERMINAL_SECRET (fallback)
 * Transport: HTTP /exec (primary) → WebSocket (fallback)
 * All execution routes through src/core/terminal.js runTerminalCommand.
 *
 * Handlers:
 *   run_command      — execute a single shell command
 *   run_script       — execute a multi-line bash script via heredoc
 *   get_workspace    — resolve the active IAM workspace root path
 *   git_status       — git status + branch in the workspace
 *   git_log          — recent git log (n commits)
 *   check_binary     — verify a binary/command exists in PATH
 *   env_info         — node, npm, wrangler, bun versions + OS info
 *   kill_session     — mark a terminal session as closed in D1
 */

import { runTerminalCommand, resolveIamWorkspaceRoot } from '../core/terminal.js';

// ---------------------------------------------------------------------------
// Shared execution helper
// ---------------------------------------------------------------------------

async function exec(command, env, request, sessionId = null, ctx = null) {
  const result = await runTerminalCommand(env, request, command, sessionId, ctx);
  return {
    output:    result.output || '(no output)',
    command:   result.command,
    exit_code: result.exitCode ?? null,
    success:   (result.exitCode ?? 0) === 0,
  };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const handlers = {

  /**
   * run_command
   * Execute a single shell command and return stdout/stderr.
   */
  async run_command({ command, session_id }, env, request, ctx) {
    if (!command?.trim()) return { error: 'command is required' };
    return await exec(command.trim(), env, request, session_id || null, ctx);
  },

  /**
   * run_script
   * Execute a multi-line bash script. Lines are joined and run as a single
   * heredoc to preserve quoting and multi-step logic.
   */
  async run_script({ script, session_id }, env, request, ctx) {
    if (!script?.trim()) return { error: 'script is required' };

    // Write script to a temp file path derived from timestamp, execute, clean up
    const tmpName = `/tmp/iam_script_${Date.now()}.sh`;
    const escaped = script.replace(/'/g, `'\\''`);
    const command = `printf '%s\\n' '${escaped}' > ${tmpName} && chmod +x ${tmpName} && bash ${tmpName}; _ec=$?; rm -f ${tmpName}; exit $_ec`;

    return await exec(command, env, request, session_id || null, ctx);
  },

  /**
   * get_workspace
   * Returns the active IAM workspace root path from workspace_settings D1
   * or the configured fallback. Agents should call this before constructing
   * any absolute file paths.
   */
  async get_workspace(_params, env) {
    try {
      const root = await resolveIamWorkspaceRoot(env);
      return { workspace_root: root, success: true };
    } catch (err) {
      return { error: err.message, success: false };
    }
  },

  /**
   * git_status
   * Returns current branch, staged/unstaged summary, and ahead/behind count
   * for the IAM workspace repo.
   */
  async git_status({ session_id }, env, request, ctx) {
    const root = await resolveIamWorkspaceRoot(env);
    const command = [
      `cd ${root}`,
      `echo "BRANCH:$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"`,
      `echo "STATUS:"`,
      `git status --short 2>/dev/null`,
      `echo "AHEAD_BEHIND:$(git rev-list --left-right --count HEAD...@{upstream} 2>/dev/null || echo 'n/a')"`,
    ].join(' && ');

    const result = await exec(command, env, request, session_id || null, ctx);

    // Parse structured output
    const lines     = (result.output || '').split('\n');
    const branch    = (lines.find(l => l.startsWith('BRANCH:')) || '').replace('BRANCH:', '').trim();
    const abIdx     = lines.findIndex(l => l.startsWith('AHEAD_BEHIND:'));
    const statusLines = lines
      .slice(lines.findIndex(l => l === 'STATUS:') + 1, abIdx > -1 ? abIdx : undefined)
      .filter(Boolean);
    const aheadBehind = abIdx > -1 ? lines[abIdx].replace('AHEAD_BEHIND:', '').trim() : 'n/a';

    return {
      branch,
      status_lines:  statusLines,
      changed_files: statusLines.length,
      ahead_behind:  aheadBehind,
      raw:           result.output,
      success:       result.success,
    };
  },

  /**
   * git_log
   * Returns the n most recent commits in the workspace repo.
   */
  async git_log({ n = 10, session_id }, env, request, ctx) {
    const root    = await resolveIamWorkspaceRoot(env);
    const count   = Math.min(Math.max(1, Number(n) || 10), 50);
    const command = `cd ${root} && git log --oneline -${count} 2>/dev/null`;
    const result  = await exec(command, env, request, session_id || null, ctx);

    const commits = (result.output || '')
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const [hash, ...rest] = line.split(' ');
        return { hash, message: rest.join(' ') };
      });

    return { commits, count: commits.length, success: result.success };
  },

  /**
   * check_binary
   * Verify that a command/binary exists in PATH on the PTY host.
   * Useful before constructing commands that depend on specific tools.
   */
  async check_binary({ binary, session_id }, env, request, ctx) {
    if (!binary?.trim()) return { error: 'binary is required' };
    const command = `which ${binary.trim()} 2>/dev/null && echo "EXISTS" || echo "NOT_FOUND"`;
    const result  = await exec(command, env, request, session_id || null, ctx);
    const exists  = (result.output || '').includes('EXISTS');
    const path    = exists ? (result.output || '').replace('EXISTS', '').trim() : null;
    return { binary: binary.trim(), exists, path, success: true };
  },

  /**
   * env_info
   * Returns runtime version info from the PTY host.
   * Agents should call this when constructing commands that depend on
   * specific tool versions (node, wrangler, bun, git, etc).
   */
  async env_info({ session_id }, env, request, ctx) {
    const command = [
      `echo "NODE:$(node --version 2>/dev/null || echo n/a)"`,
      `echo "NPM:$(npm --version 2>/dev/null || echo n/a)"`,
      `echo "BUN:$(bun --version 2>/dev/null || echo n/a)"`,
      `echo "WRANGLER:$(wrangler --version 2>/dev/null || echo n/a)"`,
      `echo "GIT:$(git --version 2>/dev/null || echo n/a)"`,
      `echo "OS:$(uname -s 2>/dev/null || echo n/a)"`,
      `echo "ARCH:$(uname -m 2>/dev/null || echo n/a)"`,
      `echo "SHELL:$(echo $SHELL)"`,
    ].join(' && ');

    const result = await exec(command, env, request, session_id || null, ctx);
    const parsed = {};
    for (const line of (result.output || '').split('\n')) {
      const [key, ...val] = line.split(':');
      if (key && val.length) parsed[key.toLowerCase()] = val.join(':').trim();
    }
    return { ...parsed, success: result.success };
  },

  /**
   * kill_session
   * Marks a terminal session as closed in D1.
   * Call when an agent session ends to keep terminal_sessions table clean.
   */
  async kill_session({ session_id }, env) {
    if (!session_id) return { error: 'session_id is required' };
    if (!env.DB)     return { error: 'DB binding unavailable' };

    try {
      await env.DB.prepare(
        `UPDATE terminal_sessions SET status = 'closed', updated_at = unixepoch() WHERE id = ?`
      ).bind(session_id).run();
      return { session_id, closed: true, success: true };
    } catch (err) {
      return { error: err.message, success: false };
    }
  },
};

// ---------------------------------------------------------------------------
// Tool definitions (Anthropic tool_use / MCP schema)
// ---------------------------------------------------------------------------

export const definitions = [
  {
    name: 'run_command',
    description: 'Execute a single shell command on the IAM PTY server and return stdout/stderr. Use for any terminal operation: git, wrangler, npm, file inspection, etc.',
    parameters: {
      type: 'object',
      properties: {
        command:    { type: 'string', description: 'Shell command to execute' },
        session_id: { type: 'string', description: 'Terminal session ID for history tracking (optional)' },
      },
      required: ['command'],
    },
  },
  {
    name: 'run_script',
    description: 'Execute a multi-line bash script on the IAM PTY server. Use when a task requires multiple commands that must run in sequence with shared state.',
    parameters: {
      type: 'object',
      properties: {
        script:     { type: 'string', description: 'Multi-line bash script content' },
        session_id: { type: 'string', description: 'Terminal session ID for history tracking (optional)' },
      },
      required: ['script'],
    },
  },
  {
    name: 'get_workspace',
    description: 'Get the active IAM workspace root path. Always call this before constructing absolute file paths.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'git_status',
    description: 'Get current git branch, changed files, and ahead/behind status for the IAM workspace repo.',
    parameters: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'Terminal session ID (optional)' },
      },
      required: [],
    },
  },
  {
    name: 'git_log',
    description: 'Get the most recent git commits in the IAM workspace repo.',
    parameters: {
      type: 'object',
      properties: {
        n:          { type: 'number', description: 'Number of commits to return (default 10, max 50)' },
        session_id: { type: 'string', description: 'Terminal session ID (optional)' },
      },
      required: [],
    },
  },
  {
    name: 'check_binary',
    description: 'Check if a command or binary exists in PATH on the PTY host before using it in a command.',
    parameters: {
      type: 'object',
      properties: {
        binary:     { type: 'string', description: 'Binary name to check (e.g. wrangler, bun, git)' },
        session_id: { type: 'string', description: 'Terminal session ID (optional)' },
      },
      required: ['binary'],
    },
  },
  {
    name: 'env_info',
    description: 'Get runtime environment info from the PTY host: node, npm, bun, wrangler, git versions, OS, shell.',
    parameters: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'Terminal session ID (optional)' },
      },
      required: [],
    },
  },
  {
    name: 'kill_session',
    description: 'Mark a terminal session as closed in D1. Call when an agent session ends.',
    parameters: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'Terminal session ID to close' },
      },
      required: ['session_id'],
    },
  },
];
