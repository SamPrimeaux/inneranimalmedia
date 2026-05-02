/**
 * Dispatcher: Terminal (terminal-dispatch)
 * Handles HTTP routes for terminal execution, auditing, and AI assistance.
 */

import { runTerminalCommand, resolveIamWorkspaceRoot } from '../core/terminal.js';

export async function handleTerminalRequest(path, method, body, env, request, ctx) {
  const pathLower = path.toLowerCase();

  // 1. POST /api/agent/terminal/run
  if (pathLower === '/api/agent/terminal/run' && method === 'POST') {
    const command = typeof body?.command === 'string' ? body.command.trim() : '';
    const session_id = body?.session_id ?? null;
    if (!command) return { error: 'No command', status: 400 };

    const { output, command: runCommand } = await runTerminalCommand(env, request, command, session_id, ctx);
    const execId = crypto.randomUUID();
    
    // Audit execution to D1
    try {
      await env.DB.prepare(
        `INSERT INTO agent_command_executions 
         (id, tenant_id, workspace_id, session_id, command_name, command_text, output_text, status, started_at, completed_at)
         VALUES (?, 'system', 'ws_inneranimalmedia', ?, 'terminal_run', ?, ?, 'completed', unixepoch(), unixepoch())`
      ).bind(execId, session_id || null, runCommand, output).run();
    } catch (_) {}

    return { output, command: runCommand, execution_id: execId };
  }

  // 2. POST /api/agent/terminal/complete
  if (pathLower === '/api/agent/terminal/complete' && method === 'POST') {
    const executionId = body?.execution_id;
    const status = body?.status;
    const now = Math.floor(Date.now() / 1000);

    if (executionId && (status === 'completed' || status === 'failed')) {
      try {
        await env.DB.prepare(
          "UPDATE agent_command_executions SET status = ?, completed_at = ? WHERE id = ?"
        ).bind(status, now, executionId).run();
      } catch (_) {}
    }
    return { ok: true };
  }

  // 3. POST /api/terminal/assist
  if (pathLower === '/api/terminal/assist' && method === 'POST') {
    const { mode, command, context, output, exit_code } = body || {};
    // ... migration logic for assists handlers ...
    return { error: 'Terminal assist integration in progress', status: 501 };
  }

  return { error: 'Not Found', status: 404 };
}
