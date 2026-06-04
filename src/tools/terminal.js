/**
 * Tool: Terminal (term)
 * Allows the agent to run shell commands in the workspace PTY.
 */

import { wrapShellCommandWithPath } from '../core/mcp-terminal-contract.js';

export const handlers = {
  /**
   * run_command: Execute a single shell command and return the output.
   */
  async run_command(
    { command, request, session_id, sessionId, workspace_id, workspaceId, path, cwd, target_id },
    env,
  ) {
    try {
      const origin = env.IAM_ORIGIN || 'https://inneranimalmedia.com';
      const headers = { 'Content-Type': 'application/json' };
      const cookie = request?.headers?.get?.('Cookie');
      if (cookie) headers.Cookie = cookie;
      const sid = session_id || sessionId || env.PTY_SESSION_ID || null;
      const workDir = String(path || cwd || '').trim();
      let runCommand = typeof command === 'string' ? command.trim() : '';
      if (workDir) runCommand = wrapShellCommandWithPath(workDir, runCommand);
      // CF Workers: forward session cookie so /api/agent/terminal/run resolves the same user/workspace.
      const wid =
        workspace_id ??
        workspaceId ??
        env?.DEFAULT_WORKSPACE_ID ??
        null;
      const res = await fetch(`${origin}/api/agent/terminal/run`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          command: runCommand,
          session_id: sid,
          ...(wid ? { workspace_id: String(wid).trim() } : {}),
          ...(target_id != null && String(target_id).trim() !== ''
            ? { target_id: String(target_id).trim() }
            : {}),
        }),
      });

      const data = await res.json();
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
  },
};

export const definitions = [
  {
    name: 'run_command',
    description: 'Run a shell command in the terminal and see the results (stdout/stderr)',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to execute (e.g., ls -la, git status)' },
      },
      required: ['command'],
    },
  },
];
